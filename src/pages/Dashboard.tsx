import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BeltStatusCard } from "@/components/dashboard/BeltStatusCard";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { useToast } from "@/hooks/use-toast";
import { useTelemetrySimulator } from "@/hooks/useTelemetrySimulator";

interface Belt {
  id: string;
  name: string;
  location: string;
  status: string;
  speed: number;
  load_percentage: number;
  temperature: number;
  vibration: number;
}

const statLamps: Record<string, string> = {
  operational: "bg-status-operational",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  total: "bg-muted",
};

const Dashboard = () => {
  const [belts, setBelts] = useState<Belt[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useTelemetrySimulator(true);

  const fetchBelts = async () => {
    try {
      const { data, error } = await supabase
        .from("conveyor_belts")
        .select("*")
        .order("name");

      if (error) throw error;
      setBelts(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load belts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBelts();

    const channel = supabase
      .channel("conveyor_belts_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conveyor_belts",
        },
        () => {
          fetchBelts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBelts]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading fleet status…</p>
      </div>
    );
  }

  const stats = [
    { key: "operational", label: "Operational", value: belts.filter((b) => b.status === "operational").length },
    { key: "warning", label: "Warning", value: belts.filter((b) => b.status === "warning").length },
    { key: "critical", label: "Critical", value: belts.filter((b) => b.status === "critical").length },
    { key: "total", label: "Total belts", value: belts.length },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
            Fleet status
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Real-time monitoring and predictive maintenance for every belt
          </p>
        </header>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-border bg-border lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.key} className="flex items-center gap-3 bg-card p-4 md:p-5">
              <span className={cn("lamp", statLamps[stat.key])} aria-hidden />
              <div className="min-w-0">
                <p className="readout text-2xl md:text-3xl">{stat.value}</p>
                <p className="truncate text-xs text-muted-foreground md:text-sm">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold tracking-wide">Belt status</h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="lamp bg-status-info" aria-hidden />
                telemetry live
              </span>
            </div>
            <div className="rise grid grid-cols-1 gap-4 md:grid-cols-2">
              {belts.map((belt) => (
                <Link key={belt.id} to={`/belts/${belt.id}`} className="block">
                  <BeltStatusCard
                    belt={{
                      id: belt.name,
                      name: belt.name,
                      status: belt.status as "operational" | "warning" | "critical",
                      speed: Number(belt.speed),
                      load: Number(belt.load_percentage),
                      temperature: Number(belt.temperature),
                      vibration: Number(belt.vibration),
                      runtime: 0,
                    }}
                  />
                </Link>
              ))}
            </div>
          </div>

          <AlertsPanel />
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold tracking-wide">Performance</h2>
          <PerformanceChart />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;