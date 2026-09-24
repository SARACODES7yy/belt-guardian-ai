import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { riskScore, riskLabel } from "@/lib/telemetry";

interface BeltRisk {
  id: string;
  name: string;
  risk: number;
  label: string;
  status: string;
}

interface PredictionRow {
  id: string;
  analysis_id: string;
  machine_id: string;
  servicing_probability: number;
  risk_level: string;
  recommended_action: string | null;
  priority_score: number | null;
}

const palette = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const riskColor = (risk: number) =>
  risk > 70
    ? "hsl(var(--status-critical))"
    : risk > 40
    ? "hsl(var(--status-warning))"
    : "hsl(var(--status-operational))";

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
};

const Analytics = () => {
  const [risks, setRisks] = useState<BeltRisk[]>([]);
  const [breakdownHistory, setBreakdownHistory] = useState<{ month: string; count: number }[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<{ name: string; value: number }[]>([]);
  const [recommendations, setRecommendations] = useState<PredictionRow[]>([]);
  const [stats, setStats] = useState({
    activeCriticalAlerts: 0,
    correctiveCount: 0,
    activePredictions: 0,
    totalCost: 0,
  });

  useEffect(() => {
    fetchRisk();
    fetchBreakdownHistory();
    fetchMaintenance();
    fetchRecommendations();
    fetchStats();

    const channel = supabase
      .channel("analytics-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          fetchBreakdownHistory();
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conveyor_belts" },
        () => {
          fetchRisk();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRisk = async () => {
    const { data: belts } = await supabase
      .from("conveyor_belts")
      .select("id, name, status, load_percentage, temperature, vibration");

    setRisks(
      (belts ?? []).map((b) => {
        const risk = riskScore(
          Number(b.vibration ?? 0),
          Number(b.temperature ?? 0),
          Number(b.load_percentage ?? 0)
        );
        return {
          id: b.id,
          name: b.name,
          risk,
          label: riskLabel(risk),
          status: b.status,
        };
      })
    );
  };

  const fetchBreakdownHistory = async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setDate(1);

    const { data: rows } = await supabase
      .from("alerts")
      .select("created_at")
      .gte("created_at", since.toISOString());

    const months: { month: string; count: number }[] = [];
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = (row.created_at ?? "").slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        month: d.toLocaleString("default", { month: "short" }),
        count: map.get(key) ?? 0,
      });
    }
    setBreakdownHistory(months);
  };

  const fetchMaintenance = async () => {
    const { data: rows } = await supabase
      .from("maintenance_logs")
      .select("maintenance_type");

    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      map.set(row.maintenance_type, (map.get(row.maintenance_type) ?? 0) + 1);
    }
    setMaintenanceTypes(
      Array.from(map.entries()).map(([name, value]) => ({ name, value }))
    );
  };

  const fetchRecommendations = async () => {
    const { data: rows } = await supabase
      .from("predictions")
      .select("id, analysis_id, machine_id, servicing_probability, risk_level, recommended_action, priority_score")
      .order("servicing_probability", { ascending: false })
      .limit(100);

    const filtered = (rows ?? []).filter((p) =>
      p.risk_level === "high" || p.risk_level === "critical"
    );
    setRecommendations(
      filtered
        .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
        .slice(0, 5)
    );
  };

  const fetchStats = async () => {
    const [alertsRes, logsRes, predsRes] = await Promise.all([
      supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("priority", "critical")
        .eq("status", "active"),
      supabase.from("maintenance_logs").select("maintenance_type, cost"),
      supabase
        .from("predictions")
        .select("id, risk_level")
        .in("risk_level", ["high", "critical"]),
    ]);

    setStats({
      activeCriticalAlerts: alertsRes.count ?? 0,
      correctiveCount: (logsRes.data ?? []).filter(
        (l) => l.maintenance_type === "Corrective"
      ).length,
      activePredictions: predsRes.data?.length ?? 0,
      totalCost: (logsRes.data ?? []).reduce(
        (sum, l) => sum + Number(l.cost ?? 0),
        0
      ),
    });
  };

  const statItems = [
    { key: "critical", label: "Active critical alerts", value: stats.activeCriticalAlerts, lamp: "bg-status-critical" },
    { key: "predictions", label: "Active predictions", value: stats.activePredictions, lamp: "bg-status-warning" },
    { key: "corrective", label: "Corrective actions", value: stats.correctiveCount, lamp: "bg-status-operational" },
    { key: "cost", label: "Maintenance cost", value: `$${stats.totalCost.toLocaleString()}`, lamp: "bg-status-info" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
            Predictive analytics
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Live failure risk and maintenance optimization
          </p>
        </header>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-border bg-border lg:grid-cols-4">
          {statItems.map((stat) => (
            <div key={stat.key} className="flex items-center gap-3 bg-card p-4 md:p-5">
              <span className={cn("lamp", stat.lamp)} aria-hidden />
              <div className="min-w-0">
                <p className="readout text-2xl md:text-3xl">{stat.value}</p>
                <p className="truncate text-xs text-muted-foreground md:text-sm">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold tracking-wide">
                Breakdown risk assessment
              </h3>
              <span className="text-xs text-muted-foreground">live sensor probability</span>
            </div>
            <div className="mt-5 space-y-4">
              {risks.length === 0 && (
                <p className="text-sm text-muted-foreground">No belt data available.</p>
              )}
              {risks.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-sm font-medium md:w-40">{item.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.risk}%`, backgroundColor: riskColor(item.risk) }}
                    />
                  </div>
                  <span
                    className="readout w-12 shrink-0 text-right text-lg"
                    style={{ color: riskColor(item.risk) }}
                  >
                    {item.risk}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold tracking-wide">
                Alert history
              </h3>
              <span className="text-xs text-muted-foreground">last 6 months</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={breakdownHistory}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--secondary))" }} />
                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold tracking-wide">
                Maintenance distribution
              </h3>
              <span className="text-xs text-muted-foreground">by type</span>
            </div>
            {maintenanceTypes.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">
                No maintenance logs yet. Completing a work order records one.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={maintenanceTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                  >
                    {maintenanceTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold tracking-wide">
                Recommended actions
              </h3>
              <span className="text-xs text-muted-foreground">from AI analysis</span>
            </div>
            <div className="mt-4">
              {recommendations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Run an analysis on the Upload Analysis page to see AI recommendations.
                </p>
              )}
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <span
                    className={cn(
                      "lamp mt-1.5",
                      rec.risk_level === "critical" ? "bg-status-critical" : "bg-status-warning"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{rec.machine_id}</span>
                      <span className="shrink-0 rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium capitalize text-foreground/80">
                        {rec.risk_level} priority
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.recommended_action}</p>
                  </div>
                  <span className="readout shrink-0 text-lg">
                    {rec.servicing_probability}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Analytics;