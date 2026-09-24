import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  deriveStatus,
  resolveThresholds,
  type BeltThresholdRow,
  type EffectiveThresholds,
  type TelemetrySample,
} from "@/lib/telemetry";

const SIM_TICK_MS = 10000;
const LEASE_KEY = "telemetry-sim-lease";
const LEASE_TTL_MS = 25000;

interface Lease {
  id: string;
  ts: number;
}

const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const baselines = new Map<string, TelemetrySample>();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rand = (min: number, max: number) =>
  min + Math.random() * (max - min);

const acquireLease = (): boolean => {
  const now = Date.now();
  const raw = localStorage.getItem(LEASE_KEY);

  if (raw) {
    try {
      const lease: Lease = JSON.parse(raw);
      if (lease.id === instanceId) {
        localStorage.setItem(LEASE_KEY, JSON.stringify({ id: instanceId, ts: now }));
        return true;
      }
      if (now - lease.ts < LEASE_TTL_MS) {
        return false;
      }
    } catch {
      // corrupted lease, fall through and take over
    }
  }

  localStorage.setItem(LEASE_KEY, JSON.stringify({ id: instanceId, ts: now }));
  const mine = localStorage.getItem(LEASE_KEY);
  if (!mine) return false;
  try {
    const lease: Lease = JSON.parse(mine);
    return lease.id === instanceId;
  } catch {
    return false;
  }
};

const releaseLease = () => {
  const raw = localStorage.getItem(LEASE_KEY);
  if (!raw) return;
  try {
    const lease: Lease = JSON.parse(raw);
    if (lease.id === instanceId) {
      localStorage.removeItem(LEASE_KEY);
    }
  } catch {
    // ignore
  }
};

interface BeltRow {
  id: string;
  name: string;
  speed: number | null;
  load_percentage: number | null;
  temperature: number | null;
  vibration: number | null;
}

const nextReading = (
  belt: BeltRow,
  thresholds: EffectiveThresholds
): TelemetrySample => {
  const base = baselines.get(belt.id) ?? {
    load: Number(belt.load_percentage ?? 70),
    temperature: Number(belt.temperature ?? 42),
    vibration: Number(belt.vibration ?? 2.1),
    speed: Number(belt.speed ?? 4.5),
    status: "operational",
  };

  const sample: TelemetrySample = {
    load: clamp(base.load + rand(-6, 6), 20, 98),
    temperature: clamp(base.temperature + rand(-3, 3), 30, 85),
    vibration: clamp(base.vibration + rand(-0.7, 0.7), 0.5, 12),
    speed: clamp(base.speed + rand(-0.4, 0.4), 1.5, 6),
    status: "operational",
  };
  sample.status = deriveStatus(sample.vibration, sample.temperature, sample.load, thresholds);
  baselines.set(belt.id, sample);
  return sample;
};

const ensureAlert = async (
  beltId: string,
  title: string,
  priority: string,
  description: string
) => {
  const { data: existing } = await supabase
    .from("alerts")
    .select("id")
    .eq("belt_id", beltId)
    .eq("title", title)
    .eq("status", "active")
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from("alerts").insert({
    belt_id: beltId,
    title,
    priority,
    description,
    status: "active",
    source: "system",
  });
};

const evaluateThresholds = async (
  beltId: string,
  sample: TelemetrySample,
  t: EffectiveThresholds
) => {
  const { vibration, temperature, load, speed } = sample;

  if (vibration > t.vibrationCritical) {
    await ensureAlert(
      beltId,
      "High Vibration Detected",
      "critical",
      `Vibration levels exceeding safe threshold (${vibration.toFixed(1)} mm/s)`
    );
  } else if (vibration > t.vibrationWarning) {
    await ensureAlert(
      beltId,
      "Vibration Rising",
      "warning",
      `Vibration approaching critical threshold (${vibration.toFixed(1)} mm/s)`
    );
  }

  if (temperature > t.temperatureCritical) {
    await ensureAlert(
      beltId,
      "Temperature Critical",
      "critical",
      `Temperature exceeded critical threshold (${temperature.toFixed(1)}°C)`
    );
  } else if (temperature > t.temperatureWarning) {
    await ensureAlert(
      beltId,
      "Temperature Rising",
      "warning",
      `Temperature approaching critical threshold (${temperature.toFixed(1)}°C)`
    );
  }

  if (load > t.loadCritical) {
    await ensureAlert(
      beltId,
      "High Load Capacity",
      "warning",
      `Operating at ${Math.round(load)}% capacity - consider load balancing`
    );
  }

  if (speed < t.speedCritical) {
    await ensureAlert(
      beltId,
      "Belt Speed Critical",
      "critical",
      `Speed below critical threshold (${speed.toFixed(1)} m/s) - likely stall or failure`
    );
  } else if (speed < t.speedWarning) {
    await ensureAlert(
      beltId,
      "Belt Speed Anomaly",
      "warning",
      `Speed reduction detected (${speed.toFixed(1)} m/s) - potential mechanical issue`
    );
  }
};

export const useTelemetrySimulator = (enabled = true) => {
  const { toast } = useToast();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const runTick = async () => {
      if (!acquireLease()) return;

      if (!runningRef.current) {
        runningRef.current = true;
        toast({
          title: "Telemetry Simulation Running",
          description: "Generating live sensor data for all conveyor belts.",
        });
      }

      const { data: belts, error } = await supabase
        .from("conveyor_belts")
        .select("id, name, speed, load_percentage, temperature, vibration");

      if (error || !belts || belts.length === 0) return;

      const { data: thresholdRows } = await supabase
        .from("belt_thresholds")
        .select("*");
      const thresholdsByBelt = new Map<string, EffectiveThresholds>();
      for (const row of (thresholdRows ?? []) as BeltThresholdRow[]) {
        thresholdsByBelt.set((row as BeltThresholdRow & { belt_id: string }).belt_id, resolveThresholds(row));
      }

      for (const belt of belts) {
        const thresholds = thresholdsByBelt.get(belt.id) ?? resolveThresholds(null);
        const sample = nextReading(belt, thresholds);

        await supabase.from("sensor_readings").insert({
          belt_id: belt.id,
          speed: sample.speed,
          load_percentage: sample.load,
          temperature: sample.temperature,
          vibration: sample.vibration,
        });

        const { error: updateError } = await supabase
          .from("conveyor_belts")
          .update({
            speed: sample.speed,
            load_percentage: sample.load,
            temperature: sample.temperature,
            vibration: sample.vibration,
            status: sample.status,
          })
          .eq("id", belt.id);

        if (updateError) {
          console.error("Telemetry update failed", belt.id, updateError);
        }

        await evaluateThresholds(belt.id, sample, thresholds);

        // Fire-and-forget: creates deduped alerts + Telegram notifications
        // for threshold breaches server-side.
        supabase.functions
          .invoke("check-thresholds", { body: { belt_id: belt.id } })
          .catch((err) => console.error("check-thresholds invoke failed", err));
      }
    };

    const timer = setInterval(runTick, SIM_TICK_MS);
    runTick();

    return () => {
      clearInterval(timer);
      releaseLease();
    };
  }, [enabled]);
};