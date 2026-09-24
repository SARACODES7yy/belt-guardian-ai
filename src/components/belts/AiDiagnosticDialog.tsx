import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { riskLabel, resolveThresholds, type BeltThresholdRow } from "@/lib/telemetry";
import { useToast } from "@/hooks/use-toast";

interface BeltRow {
  id: string;
  name: string;
  location: string;
  status: string;
  speed: number | null;
  load_percentage: number | null;
  temperature: number | null;
  vibration: number | null;
  last_maintenance: string | null;
}

interface Diagnostic {
  riskScore: number;
  riskLevel: string;
  status: string;
  rootCauses: string[];
  recommendedActions: string[];
  summary: string;
}

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  key: string;
  title: string;
  status: StepStatus;
  result?: string;
}

const STEP_TITLES = [
  "Reading live sensor snapshot",
  "Analyzing historical readings",
  "Reviewing alert history",
  "Inspecting maintenance records",
  "Correlating findings",
];

const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
};

const riskBadgeClass = (level: string): string => {
  if (level === "critical" || level === "high") {
    return "bg-status-critical text-status-critical-foreground";
  }
  if (level === "medium") {
    return "bg-status-warning text-status-warning-foreground";
  }
  return "bg-primary text-primary-foreground";
};

interface AiDiagnosticDialogProps {
  belt: BeltRow;
  thresholds: BeltThresholdRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AiDiagnosticDialog = ({ belt, thresholds, open, onOpenChange }: AiDiagnosticDialogProps) => {
  const [steps, setSteps] = useState<Step[]>([]);
  const [report, setReport] = useState<Diagnostic | null>(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const setStep = (key: string, update: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...update } : s)));

  const runDiagnostic = useCallback(async () => {
    setReport(null);
    setSteps(STEP_TITLES.map((title, i) => ({ key: String(i), title, status: "pending" })));
    setRunning(true);

    try {
      const t = resolveThresholds(thresholds);
      const snapshot = [
        { metric: "temp", value: belt.temperature, unit: "°C", warn: t.temperatureWarning, crit: t.temperatureCritical },
        { metric: "vibration", value: belt.vibration, unit: "mm/s", warn: t.vibrationWarning, crit: t.vibrationCritical },
        { metric: "load", value: belt.load_percentage, unit: "%", warn: t.loadWarning, crit: t.loadCritical },
        { metric: "speed", value: belt.speed, unit: "m/s", warn: t.speedWarning, crit: t.speedCritical, inverted: true },
      ];

      // Step 1 — live snapshot
      setStep("0", { status: "running" });
      await new Promise((r) => setTimeout(r, 350));
      const breaches = snapshot.filter((m) =>
        m.inverted
          ? m.value != null && Number(m.value) < m.warn
          : m.value != null && Number(m.value) > m.warn
      );
      const result0 = breaches.length === 0
        ? `All metrics within thresholds (temp ${Number(belt.temperature).toFixed(0)}°C, vibration ${Number(belt.vibration).toFixed(1)}mm/s, load ${Number(belt.load_percentage).toFixed(0)}%, speed ${Number(belt.speed).toFixed(1)}m/s).`
        : `Threshold breaches: ${breaches.map((m) => `${m.metric} ${Number(m.value).toFixed(1)}${m.unit} vs ${m.inverted ? "min" : "limit"} ${m.warn}${m.unit}`).join("; ")}.`;
      setStep("0", { status: "done", result: result0 });

      // Step 2 — historical readings
      setStep("1", { status: "running" });
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: readings, error: readingsError } = await supabase
        .from("sensor_readings")
        .select("timestamp, speed, load_percentage, temperature, vibration")
        .eq("belt_id", belt.id)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });
      if (readingsError) throw readingsError;
      const count = readings?.length ?? 0;
      const result1 = count === 0
        ? "Only 0 reading(s) available in the last 30 days — trend analysis needs more history. Upload sensor CSVs or connect live telemetry for deeper analysis."
        : `${count} reading(s) available in the last 30 days — latest: temp ${Number(readings![count - 1].temperature).toFixed(1)}°C, vibration ${Number(readings![count - 1].vibration).toFixed(1)}mm/s, load ${Number(readings![count - 1].load_percentage).toFixed(0)}%, speed ${Number(readings![count - 1].speed).toFixed(1)}m/s.`;
      setStep("1", { status: "done", result: result1 });

      // Step 3 — alert history
      setStep("2", { status: "running" });
      const { data: alerts, error: alertsError } = await supabase
        .from("alerts")
        .select("title, priority, status, created_at, description")
        .eq("belt_id", belt.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (alertsError) throw alertsError;
      const activeCount = (alerts ?? []).filter((a) => a.status === "active").length;
      const result2 = (alerts ?? []).length === 0
        ? "No alerts recorded for this belt."
        : `${alerts!.length} alert(s) recorded (${activeCount} active), most recent: "${alerts![0].title}".`;
      setStep("2", { status: "done", result: result2 });

      // Step 4 — maintenance records
      setStep("3", { status: "running" });
      const { data: logs, error: logsError } = await supabase
        .from("maintenance_logs")
        .select("maintenance_type, description, performed_at, downtime_hours, cost")
        .eq("belt_id", belt.id)
        .order("performed_at", { ascending: false })
        .limit(20);
      if (logsError) throw logsError;
      const sinceService = daysSince(belt.last_maintenance);
      const result3 = (logs ?? []).length === 0
        ? `No maintenance has been logged${sinceService != null ? `; belt record says last serviced ${new Date(belt.last_maintenance!).toLocaleDateString()} (${sinceService} days ago)` : ""}.`
        : `${logs!.length} maintenance log(s); most recent: ${logs![0].maintenance_type} on ${logs![0].performed_at ? new Date(logs![0].performed_at).toLocaleDateString() : "unknown date"}.`;
      setStep("3", { status: "done", result: result3 });

      // Step 5 — correlate findings via AI
      setStep("4", { status: "running" });
      const { data: fnData, error: fnError } = await supabase.functions.invoke("diagnose-belt", {
        body: {
          belt,
          thresholds,
          recentReadings: readings ?? [],
          alerts: alerts ?? [],
          maintenanceLogs: logs ?? [],
        },
      });
      if (fnError) throw fnError;
      if (!fnData?.success) {
        throw new Error(fnData?.error ?? "Diagnostic failed");
      }
      setStep("4", { status: "done", result: "Analysis complete." });
      setReport(fnData.diagnostic as Diagnostic);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Diagnostic failed";
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error", result: message } : s))
      );
      toast({ title: "AI Diagnostic Failed", description: message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [belt, thresholds, toast]);

  useEffect(() => {
    if (open) {
      runDiagnostic();
    }
  }, [open, runDiagnostic]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Diagnostic — {belt.name}
          </DialogTitle>
          <DialogDescription>
            The agent investigates sensor trends, thresholds, alerts, and maintenance history, then
            produces a root-cause report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.key} className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  {step.status === "done" && (
                    <CheckCircle2 className="h-5 w-5 text-status-operational" />
                  )}
                  {step.status === "running" && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {step.status === "error" && <XCircle className="h-5 w-5 text-status-critical" />}
                  {step.status === "pending" && (
                    <span className="block h-5 w-5 rounded-full border border-border" />
                  )}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{step.title}</p>
                  {step.result && (
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        step.status === "error" && "text-status-critical"
                      )}
                    >
                      {step.result}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {report && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    riskBadgeClass(report.riskLevel)
                  )}
                >
                  Risk {Math.round(report.riskScore)}/100 — {riskLabel(report.riskScore)}
                </span>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
                  — {report.status}
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display text-base font-semibold tracking-wide">
                  Root Cause Analysis
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {report.rootCauses.map((cause, i) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display text-base font-semibold tracking-wide">
                  Recommended Actions
                </h3>
                {report.recommendedActions.length === 0 ? (
                  <p className="pl-5 text-sm text-muted-foreground">None.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {report.recommendedActions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display text-base font-semibold tracking-wide">Summary</h3>
                <p className="text-sm text-muted-foreground">{report.summary}</p>
              </div>

              <Button variant="outline" onClick={runDiagnostic} disabled={running} className="gap-2">
                <Sparkles className="h-4 w-4" />
                {running ? "Running…" : "Re-run Diagnostic"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiDiagnosticDialog;
