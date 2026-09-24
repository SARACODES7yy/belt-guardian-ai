import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Thresholds {
  vibrationWarning: number;
  vibrationCritical: number;
  temperatureWarning: number;
  temperatureCritical: number;
  loadWarning: number;
  loadCritical: number;
  speedWarning: number;
  speedCritical: number;
}

const DEFAULTS: Thresholds = {
  vibrationWarning: 5,
  vibrationCritical: 7,
  temperatureWarning: 55,
  temperatureCritical: 65,
  loadWarning: 80,
  loadCritical: 90,
  speedWarning: 2.5,
  speedCritical: 2,
};

interface Breach {
  metric: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
}

const num = (v: unknown): number | null =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
    // Accept both a direct invocation ({ belt_id }) and a database-webhook
    // payload ({ event, record }).
    const beltId: string | undefined = body?.belt_id ?? body?.record?.belt_id ?? body?.record?.id;

    if (!beltId) {
      return new Response(
        JSON.stringify({ error: "belt_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase service credentials are not configured");
    }
    const restHeaders = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    };

    // Latest belt metrics (the simulator keeps conveyor_belts up to date)
    const beltRes = await fetch(`${supabaseUrl}/rest/v1/conveyor_belts?id=eq.${beltId}&select=*`, {
      headers: restHeaders,
    });
    const belts = await beltRes.json();
    const belt = belts?.[0];
    if (!belt) {
      return new Response(
        JSON.stringify({ error: "belt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-belt thresholds with global fallbacks
    const trRes = await fetch(`${supabaseUrl}/rest/v1/belt_thresholds?belt_id=eq.${beltId}&select=*`, {
      headers: restHeaders,
    });
    const rows = await trRes.json();
    const t = rows?.[0] ?? {};
    const thresholds: Thresholds = {
      vibrationWarning: num(t.vibration_warn) ?? DEFAULTS.vibrationWarning,
      vibrationCritical: num(t.vibration_crit) ?? DEFAULTS.vibrationCritical,
      temperatureWarning: num(t.temp_warn) ?? DEFAULTS.temperatureWarning,
      temperatureCritical: num(t.temp_crit) ?? DEFAULTS.temperatureCritical,
      loadWarning: num(t.load_warn) ?? DEFAULTS.loadWarning,
      loadCritical: num(t.load_crit) ?? DEFAULTS.loadCritical,
      speedWarning: num(t.speed_warn) ?? DEFAULTS.speedWarning,
      speedCritical: num(t.speed_crit) ?? DEFAULTS.speedCritical,
    };

    const vibration = num(belt.vibration);
    const temperature = num(belt.temperature);
    const load = num(belt.load_percentage);
    const speed = num(belt.speed);

    const breaches: Breach[] = [];
    if (vibration != null && vibration > thresholds.vibrationCritical) {
      breaches.push({ metric: "vibration", severity: "critical", title: "High Vibration Detected", message: `Vibration ${vibration.toFixed(1)} mm/s exceeds critical threshold ${thresholds.vibrationCritical} mm/s` });
    } else if (vibration != null && vibration > thresholds.vibrationWarning) {
      breaches.push({ metric: "vibration", severity: "warning", title: "Vibration Rising", message: `Vibration ${vibration.toFixed(1)} mm/s exceeds warning threshold ${thresholds.vibrationWarning} mm/s` });
    }
    if (temperature != null && temperature > thresholds.temperatureCritical) {
      breaches.push({ metric: "temperature", severity: "critical", title: "Temperature Critical", message: `Temperature ${temperature.toFixed(1)}°C exceeds critical threshold ${thresholds.temperatureCritical}°C` });
    } else if (temperature != null && temperature > thresholds.temperatureWarning) {
      breaches.push({ metric: "temperature", severity: "warning", title: "Temperature Rising", message: `Temperature ${temperature.toFixed(1)}°C exceeds warning threshold ${thresholds.temperatureWarning}°C` });
    }
    if (load != null && load > thresholds.loadCritical) {
      breaches.push({ metric: "load", severity: "warning", title: "High Load Capacity", message: `Load ${load.toFixed(0)}% exceeds critical threshold ${thresholds.loadCritical}%` });
    } else if (load != null && load > thresholds.loadWarning) {
      breaches.push({ metric: "load", severity: "warning", title: "High Load Capacity", message: `Load ${load.toFixed(0)}% exceeds warning threshold ${thresholds.loadWarning}%` });
    }
    if (speed != null && speed < thresholds.speedCritical) {
      breaches.push({ metric: "speed", severity: "critical", title: "Belt Speed Critical", message: `Speed ${speed.toFixed(1)} m/s is below critical threshold ${thresholds.speedCritical} m/s` });
    } else if (speed != null && speed < thresholds.speedWarning) {
      breaches.push({ metric: "speed", severity: "warning", title: "Belt Speed Anomaly", message: `Speed ${speed.toFixed(1)} m/s is below warning threshold ${thresholds.speedWarning} m/s` });
    }

    if (breaches.length === 0) {
      return new Response(
        JSON.stringify({ success: true, belt: belt.name, breaches: [], alertsCreated: 0, telegram: "skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alertsCreated: string[] = [];
    const notified: string[] = [];
    const telegramErrors: string[] = [];

    for (const breach of breaches) {
      // Only act when there is no active alert for this breach yet, so a
      // breach notifies once instead of on every telemetry tick.
      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/alerts?belt_id=eq.${beltId}&title=eq.${encodeURIComponent(breach.title)}&status=eq.active&select=id`,
        { headers: restHeaders }
      );
      const existing = await existingRes.json();
      if (existing?.length > 0) continue;

      await fetch(`${supabaseUrl}/rest/v1/alerts`, {
        method: "POST",
        headers: restHeaders,
        body: JSON.stringify({
          belt_id: beltId,
          title: breach.title,
          priority: breach.severity,
          description: breach.message,
          status: "active",
          source: "threshold",
        }),
      });
      alertsCreated.push(breach.title);

      if (telegramToken && telegramChatId) {
        const text = `🚨 *ConveyorWatch Alert*\n\n*Belt:* ${belt.name} (${belt.location})\n*Severity:* ${breach.severity.toUpperCase()}\n*Alert:* ${breach.title}\n*Detail:* ${breach.message}`;
        const tgRes = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChatId, text, parse_mode: "Markdown" }),
        });
        if (tgRes.ok) {
          notified.push(breach.title);
        } else {
          const errText = await tgRes.text();
          console.error("Telegram send failed:", tgRes.status, errText);
          telegramErrors.push(`${tgRes.status}: ${errText.slice(0, 200)}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        belt: belt.name,
        breaches: breaches.map((b) => `${b.title} (${b.severity})`),
        alertsCreated,
        telegram: !telegramToken || !telegramChatId ? "not_configured" : notified,
        telegramErrors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-thresholds:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
