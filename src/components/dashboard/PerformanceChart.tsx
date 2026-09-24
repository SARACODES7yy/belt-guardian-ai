import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface BeltKey {
  id: string;
  name: string;
  key: string;
}

interface ChartRow {
  time: string;
  [beltKey: string]: string | number | undefined;
}

const bucketKey = (timestamp: string) =>
  new Date(timestamp).toISOString().slice(0, 13);

const shortKey = (name: string) =>
  name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export const PerformanceChart = () => {
  const [data, setData] = useState<ChartRow[]>([]);
  const [belts, setBelts] = useState<BeltKey[]>([]);

  useEffect(() => {
    fetchChart();

    const channel = supabase
      .channel("performance-chart")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sensor_readings" },
        fetchChart
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchChart = async () => {
    const { data: beltRows } = await supabase
      .from("conveyor_belts")
      .select("id, name");

    const beltKeys = (beltRows ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      key: shortKey(b.name),
    }));
    setBelts(beltKeys);

    if (beltKeys.length === 0) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("sensor_readings")
      .select("belt_id, load_percentage, timestamp")
      .gte("timestamp", since)
      .order("timestamp", { ascending: true });

    const bucketToBelt = new Map<string, Map<string, { sum: number; count: number }>>();

    for (const row of rows ?? []) {
      const key = beltKeys.find((b) => b.id === row.belt_id)?.key ?? row.belt_id;
      const bucket = bucketKey(row.timestamp ?? "");
      if (!bucketToBelt.has(bucket)) bucketToBelt.set(bucket, new Map());
      const perBelt = bucketToBelt.get(bucket)!;
      const current = perBelt.get(key) ?? { sum: 0, count: 0 };
      current.sum += Number(row.load_percentage);
      current.count += 1;
      perBelt.set(key, current);
    }

    const buckets = Array.from(bucketToBelt.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, perBelt]) => {
        const row: ChartRow = { time: new Date(bucket).toISOString().slice(11, 16) };
        for (const belt of beltKeys) {
          const agg = perBelt.get(belt.key);
          row[belt.key] = agg ? Math.round((agg.sum / agg.count) * 10) / 10 : undefined;
        }
        return row;
      });

    setData(buckets);
  };

  return (
    <Card className="p-6">
      <div className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-wide">
              24-hour load capacity trends
            </h3>
            <p className="text-sm text-muted-foreground">
              Load percentage across every belt in the fleet
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="lamp bg-status-info" aria-hidden />
            live
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Legend />
            {belts.map((belt, index) => (
              <Line
                key={belt.id}
                type="monotone"
                dataKey={belt.key}
                name={belt.name}
                stroke={`hsl(var(--chart-${(index % 5) + 1}))`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};