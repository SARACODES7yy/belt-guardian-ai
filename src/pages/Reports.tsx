import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSVPredictions, downloadPDFPredictions, type ExportPrediction } from "@/lib/report";
import { useToast } from "@/hooks/use-toast";

interface KpiSummary {
  total_belts: number | null;
  operational_belts: number | null;
  warning_belts: number | null;
  critical_belts: number | null;
  fleet_availability: number | null;
  total_maintenance: number | null;
  corrective_count: number | null;
  preventive_count: number | null;
  predictive_count: number | null;
  mttr_hours: number | null;
  mtbf_hours: number | null;
  total_downtime_hours: number | null;
  total_cost: number | null;
  active_alerts: number | null;
  active_critical_alerts: number | null;
  open_work_orders: number | null;
}

interface AnalysisRow {
  id: string;
  file_name: string | null;
  created_at: string | null;
  summary: unknown;
  predictions: {
    machine_id: string;
    servicing_probability: number;
    risk_level: string;
    key_indicators: unknown;
    recommended_action: string | null;
    priority_score: number | null;
  }[];
}

const Reports = () => {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [coreCounts, setCoreCounts] = useState({
    criticalAlerts: 0,
    openWorkOrders: 0,
    criticalPredictions: 0,
    resolvedAlerts: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchKpi();
    fetchReports();
  }, []);

  const fetchKpi = async () => {
    const { data } = await supabase.from("kpi_summary").select("*").limit(1);
    if (data && data.length > 0) {
      setKpi(data[0] as KpiSummary);
    }
  };

  const fetchReports = async () => {
    const { data: analysesRes } = await supabase
      .from("analyses")
      .select("id, file_name, created_at, summary, predictions(machine_id, servicing_probability, risk_level, key_indicators, recommended_action, priority_score)")
      .order("created_at", { ascending: false })
      .limit(5);

    setAnalyses((analysesRes ?? []) as unknown as AnalysisRow[]);

    const [criticalAlerts, openOrders, preds, resolved] = await Promise.all([
      supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("priority", "critical")
        .eq("status", "active"),
      supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("predictions").select("id").or("risk_level.eq.high,risk_level.eq.critical"),
      supabase.from("alerts").select("id", { count: "exact", head: true }).eq("status", "resolved"),
    ]);

    setCoreCounts({
      criticalAlerts: criticalAlerts.count ?? 0,
      openWorkOrders: openOrders.count ?? 0,
      criticalPredictions: preds.data?.length ?? 0,
      resolvedAlerts: resolved.count ?? 0,
    });
  };

  const exportAnalysis = (analysis: AnalysisRow, type: "csv" | "pdf") => {
    const predictions: ExportPrediction[] = analysis.predictions.map((p) => ({
      machineId: p.machine_id,
      servicingProbability: Number(p.servicing_probability),
      riskLevel: p.risk_level,
      keyIndicators: p.key_indicators as string[],
      recommendedAction: p.recommended_action ?? "",
      priorityScore: Number(p.priority_score ?? 0),
    }));
    const base = `analysis-${analysis.id.slice(0, 8)}`;

    if (type === "csv") {
      downloadCSVPredictions(predictions, base);
    } else {
      downloadPDFPredictions(
        predictions,
        {
          totalMachines: predictions.length,
          criticalMachines: predictions.filter((p) => p.riskLevel === "critical").length,
        },
        "Machine Servicing Analysis Report",
        base
      );
    }
    toast({
      title: "Report Downloaded",
      description: `${analysis.file_name ?? "Analysis report"} exported successfully.`,
    });
  };

  const kpiItems = kpi
    ? [
        {
          metric: "Fleet availability",
          value: `${kpi.fleet_availability?.toFixed(1) ?? "—"}%`,
          trend: "up" as const,
          change: `${kpi.operational_belts ?? 0}/${kpi.total_belts ?? 0} belts`,
        },
        {
          metric: "MTBF",
          value: kpi.mtbf_hours ? `${kpi.mtbf_hours.toFixed(1)} hrs` : "—",
          trend: "up" as const,
          change: "between failures",
        },
        {
          metric: "MTTR",
          value: kpi.mttr_hours ? `${kpi.mttr_hours.toFixed(1)} hrs` : "—",
          trend: "down" as const,
          change: `${kpi.total_downtime_hours?.toFixed(1) ?? 0} hrs total`,
        },
        {
          metric: "Maintenance cost",
          value: `$${(kpi.total_cost ?? 0).toLocaleString()}`,
          trend: "up" as const,
          change: `${kpi.total_maintenance ?? 0} actions`,
        },
        {
          metric: "Active alerts",
          value: `${kpi.active_alerts ?? 0}`,
          trend: "down" as const,
          change: `${kpi.active_critical_alerts ?? 0} critical`,
        },
        {
          metric: "Maintenance mix",
          value: `${(kpi.preventive_count ?? 0) + (kpi.predictive_count ?? 0)}/${kpi.total_maintenance ?? 0}`,
          trend: "up" as const,
          change: "preventive and predictive",
        },
      ]
    : [];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-status-operational" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-status-critical" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
            Management reports
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Executive KPIs and performance analytics from live data
          </p>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-semibold tracking-wide">
              Key performance indicators
            </h2>
            <Button onClick={() => exportAnalysis(analyses[0], "pdf")} disabled={!analyses[0]}>
              <Download className="h-4 w-4" />
              Export KPI report
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
            {kpiItems.map((kpi) => (
              <div key={kpi.metric} className="bg-card p-5">
                <p className="text-xs text-muted-foreground">{kpi.metric}</p>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <p className="readout text-2xl md:text-3xl">{kpi.value}</p>
                  <div className="flex items-center gap-1.5 pb-0.5 text-xs text-muted-foreground">
                    {getTrendIcon(kpi.trend)}
                    <span
                      className={
                        kpi.trend === "up"
                          ? "text-status-operational"
                          : kpi.trend === "down"
                          ? "text-status-critical"
                          : "text-muted-foreground"
                      }
                    >
                      {kpi.change}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {!kpi && (
              <div className="bg-card p-5 text-sm text-muted-foreground">
                No KPI data yet. Telemetry populates after the dashboard has been running.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-semibold tracking-wide">Recent reports</h2>
            <Link to="/upload">
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Generate new report
              </Button>
            </Link>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No analyses yet. Upload a CSV to generate your first report.
                    </TableCell>
                  </TableRow>
                )}
                {analyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      {analysis.file_name ?? `Analysis ${analysis.id.slice(0, 8)}`}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium text-foreground/80">
                        Forecast
                      </span>
                    </TableCell>
                    <TableCell>
                      {analysis.created_at
                        ? new Date(analysis.created_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-xs text-foreground/80">
                        <span className="lamp bg-status-operational" aria-hidden />
                        completed
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => exportAnalysis(analysis, "csv")}
                        >
                          <Download className="h-4 w-4" />
                          CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => exportAnalysis(analysis, "pdf")}
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold tracking-wide">
              Executive summary
            </h3>
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-muted-foreground">
                Generated from live sensor data, work orders, and maintenance logs.
              </p>
              <p className="text-muted-foreground">
                {kpi
                  ? `${kpi.total_belts ?? 0} conveyor belts tracked. Fleet availability is ${kpi.fleet_availability?.toFixed(1) ?? "—"}% with ${kpi.active_critical_alerts ?? 0} critical alert${(kpi.active_critical_alerts ?? 0) === 1 ? "" : "s"} active. ${kpi.total_maintenance ?? 0} maintenance actions recorded at a total cost of $${(kpi.total_cost ?? 0).toLocaleString()}.`
                  : "No live data available yet."}
              </p>
              <p className="text-muted-foreground">
                {coreCounts.criticalPredictions > 0
                  ? `${coreCounts.criticalPredictions} high/critical predictions are pending review — address the highest priority items first.`
                  : "No pending high-risk predictions. Run a CSV analysis to generate maintenance forecasts."}
              </p>
              <p className="text-muted-foreground">
                {coreCounts.resolvedAlerts > 0
                  ? `${coreCounts.resolvedAlerts} alerts have been acknowledged and resolved by the operations team.`
                  : "Resolve active alerts from the dashboard panel to keep the fleet healthy."}
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold tracking-wide">
              Critical insights
            </h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-[6px] border border-border p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="lamp bg-status-warning" aria-hidden />
                  Open work orders
                </p>
                <p className="mt-2 text-sm font-medium">Awaiting assignment or completion</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {coreCounts.openWorkOrders > 0
                    ? `${coreCounts.openWorkOrders} work order${coreCounts.openWorkOrders === 1 ? "" : "s"} need a technician.`
                    : "No open work orders. High-risk AI predictions create work orders automatically."}
                </p>
              </div>

              <div className="rounded-[6px] border border-border p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="lamp bg-status-critical" aria-hidden />
                  Fleet health
                </p>
                <p className="mt-2 text-sm font-medium">Active critical alerts</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {coreCounts.criticalAlerts > 0
                    ? `${coreCounts.criticalAlerts} critical alert${coreCounts.criticalAlerts === 1 ? "" : "s"} active. Sensor thresholds have been breached.`
                    : "No critical alerts active. Live telemetry monitors vibration, temperature, and load thresholds."}
                </p>
              </div>

              <div className="rounded-[6px] border border-border p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="lamp bg-status-info" aria-hidden />
                  Maintenance mix
                </p>
                <p className="mt-2 text-sm font-medium">Planned versus reactive work</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {kpi && (kpi.preventive_count ?? 0) > 0
                    ? `${kpi.preventive_count} preventive and ${kpi.predictive_count ?? 0} predictive actions recorded.`
                    : "No preventive maintenance recorded yet. Completing work orders on belts populates the maintenance log."}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Reports;