import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Gauge, Thermometer, Activity, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { riskScore, riskLabel } from "@/lib/telemetry";

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
  updated_at: string | null;
}

interface ReadingRow {
  speed: number;
  load_percentage: number;
  temperature: number;
  vibration: number;
  timestamp: string | null;
}

interface AlertRow {
  id: string;
  title: string;
  priority: string;
  description: string;
  status: string;
  created_at: string | null;
}

interface LogRow {
  id: string;
  maintenance_type: string;
  description: string | null;
  downtime_hours: number | null;
  cost: number | null;
  performed_at: string | null;
}

interface PredictionRow {
  id: string;
  machine_id: string;
  servicing_probability: number;
  risk_level: string;
  recommended_action: string | null;
  priority_score: number | null;
}

const chartTooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
};

const riskLamp = (risk: number) =>
  risk > 70 ? "bg-status-critical" : risk > 40 ? "bg-status-warning" : "bg-status-operational";

const BeltDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [belt, setBelt] = useState<BeltRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" });
  const { canManage } = useRole();
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    fetchBelt();
    fetchReadings();
    fetchAlerts();
    fetchLogs();

    const channel = supabase
      .channel(`belt-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conveyor_belts", filter: `id=eq.${id}` }, fetchBelt)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_readings", filter: `belt_id=eq.${id}` }, fetchReadings)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    fetchPredictions();
  }, [belt?.name]);

  const fetchBelt = async () => {
    if (!id) return;
    const { data } = await supabase.from("conveyor_belts").select("*").eq("id", id).single();
    setBelt(data as BeltRow | null);
  };

  const fetchReadings = async () => {
    if (!id) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("sensor_readings")
      .select("speed, load_percentage, temperature, vibration, timestamp")
      .eq("belt_id", id)
      .gte("timestamp", since)
      .order("timestamp", { ascending: true })
      .limit(200);
    setReadings((data ?? []) as ReadingRow[]);
  };

  const fetchAlerts = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("alerts")
      .select("id, title, priority, description, status, created_at")
      .eq("belt_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAlerts((data ?? []) as AlertRow[]);
  };

  const fetchLogs = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("maintenance_logs")
      .select("id, maintenance_type, description, downtime_hours, cost, performed_at")
      .eq("belt_id", id)
      .order("performed_at", { ascending: false })
      .limit(20);
    setLogs((data ?? []) as LogRow[]);
  };

  const fetchPredictions = async () => {
    if (!belt) return;
    const { data } = await supabase
      .from("predictions")
      .select("id, machine_id, servicing_probability, risk_level, recommended_action, priority_score")
      .ilike("machine_id", belt.name)
      .order("servicing_probability", { ascending: false })
      .limit(5);
    setPredictions((data ?? []) as PredictionRow[]);
  };

  const createOrder = async () => {
    if (!belt) return;
    if (!form.title.trim()) {
      toast({ title: "Missing Title", description: "A title is required.", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("work_orders").insert({
      belt_id: belt.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      created_by: user?.id ?? null,
    });
    if (error) {
      toast({ title: "Create Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Work Order Created", description: `Work order added for ${belt.name}.` });
    setShowForm(false);
    setForm({ title: "", description: "", priority: "medium" });
  };

  if (!belt) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="mx-auto max-w-[1400px] space-y-4">
          <Skeleton className="h-40 w-full rounded-[6px]" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[6px]" />
          ))}
        </div>
      </div>
    );
  }

  const risk = riskScore(
    Number(belt.vibration ?? 0),
    Number(belt.temperature ?? 0),
    Number(belt.load_percentage ?? 0)
  );

  const statusChip =
    belt.status === "critical"
      ? "bg-status-critical/15 text-status-critical"
      : belt.status === "warning"
      ? "bg-status-warning/15 text-status-warning"
      : "bg-status-operational/15 text-status-operational";

  const fmt1 = (n: number) => (Number.isFinite(n) ? Number(n).toFixed(1) : String(n));
  const metrics = [
    { key: "speed", icon: Gauge, label: "Speed", value: belt.speed != null ? fmt1(Number(belt.speed)) : "—", unit: "m/s" },
    { key: "load", icon: TrendingUp, label: "Load", value: belt.load_percentage != null ? `${Math.round(Number(belt.load_percentage))}` : "—", unit: "%" },
    { key: "temperature", icon: Thermometer, label: "Temperature", value: belt.temperature != null ? `${Math.round(Number(belt.temperature))}` : "—", unit: "°C" },
    { key: "vibration", icon: Activity, label: "Vibration", value: belt.vibration != null ? fmt1(Number(belt.vibration)) : "—", unit: "mm/s" },
  ];

  const charts: { key: keyof ReadingRow; label: string; color: string; unit: string }[] = [
    { key: "speed", label: "Speed", color: "hsl(var(--chart-1))", unit: " m/s" },
    { key: "load_percentage", label: "Load", color: "hsl(var(--chart-2))", unit: "%" },
    { key: "temperature", label: "Temperature", color: "hsl(var(--chart-3))", unit: "°C" },
    { key: "vibration", label: "Vibration", color: "hsl(var(--chart-4))", unit: " mm/s" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <Link to="/">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>

        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
                {belt.name}
              </h1>
              <span className={cn("rounded-[4px] px-1.5 py-px text-[11px] font-medium capitalize", statusChip)}>
                {belt.status}
              </span>
              <span className="flex items-center gap-1.5 rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium text-foreground/80">
                <span className={cn("lamp", riskLamp(risk))} aria-hidden />
                {riskLabel(risk)} risk, {risk}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{belt.location}</p>
          </div>
          {canManage && !showForm && (
            <Button onClick={() => setShowForm(true)} className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              Create work order
            </Button>
          )}
        </header>

        {showForm && canManage && (
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">
              New work order for {belt.name}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Replace worn belt segment"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details of the work required"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createOrder}>Create</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-border bg-border lg:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.key} className="flex items-center gap-3 bg-card p-4 md:p-5">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="readout text-2xl md:text-3xl">
                    {metric.value}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">{metric.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h2 className="mb-4 font-display text-xl font-semibold tracking-wide">Sensor trends</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {charts.map((chart) => (
              <Card key={chart.key} className="p-6">
                <h3 className="font-display text-lg font-semibold tracking-wide">
                  {chart.label}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={readings}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(t: string) => new Date(t).toISOString().slice(11, 16)}
                      interval={Math.max(1, Math.floor(readings.length / 6))}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelFormatter={(t: string) => new Date(t).toLocaleString()}
                      formatter={(value: number) => [`${value}${chart.unit}`, chart.label]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={chart.key as string}
                      name={chart.label}
                      stroke={chart.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">Alert history</h2>
            <div className="mt-4">
              {alerts.length === 0 && (
                <p className="text-sm text-muted-foreground">No alerts recorded for this belt.</p>
              )}
              {alerts.map((alert) => (
                <div key={alert.id} className="border-b border-border py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium capitalize">
                      {alert.title}
                    </p>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "lamp",
                          alert.status === "resolved"
                            ? "bg-status-operational"
                            : alert.priority === "critical"
                            ? "bg-status-critical"
                            : alert.priority === "warning"
                            ? "bg-status-warning"
                            : "bg-status-info"
                        )}
                        aria-hidden
                      />
                      <span className="capitalize">{alert.status}</span>
                    </span>
                  </div>
                  {alert.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.created_at ? new Date(alert.created_at).toLocaleString() : "—"}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">Maintenance log</h2>
            <div className="mt-4">
              {logs.length === 0 && (
                <p className="text-sm text-muted-foreground">No maintenance recorded for this belt.</p>
              )}
              {logs.map((log) => (
                <div key={log.id} className="border-b border-border py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium text-foreground/80">
                      {log.maintenance_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {log.performed_at ? new Date(log.performed_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  {log.description && <p className="mt-1 text-sm text-muted-foreground">{log.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Downtime {log.downtime_hours ?? 0}h, cost ${log.cost ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-wide">AI forecasts</h2>
          </div>
          <div className="mt-4">
            {predictions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No AI predictions for this belt yet. Run a CSV analysis and match the machine ID to the belt name.
              </p>
            )}
            {predictions.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{p.machine_id}</p>
                  <p className="text-sm text-muted-foreground">{p.recommended_action ?? "No action specified"}</p>
                  <span
                    className={cn(
                      "inline-block rounded-[4px] px-1.5 py-px text-[11px] font-medium capitalize",
                      p.risk_level === "critical"
                        ? "bg-status-critical/15 text-status-critical"
                        : p.risk_level === "high" || p.risk_level === "medium"
                        ? "bg-status-warning/15 text-status-warning"
                        : "bg-status-operational/15 text-status-operational"
                    )}
                  >
                    {p.risk_level} risk
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="readout text-2xl">{p.servicing_probability}%</p>
                  <p className="text-xs text-muted-foreground">servicing probability</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BeltDetail;