import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";

interface AlertRow {
  id: string;
  belt_id: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  source: string | null;
  created_at: string | null;
  conveyor_belts: { name: string } | null;
}

const timeAgo = (iso: string | null) => {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const lampByPriority: Record<string, string> = {
  critical: "bg-status-critical",
  warning: "bg-status-warning",
  info: "bg-status-info",
};

export const AlertsPanel = () => {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const { canManage } = useRole();
  const { toast } = useToast();

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel("alerts-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        fetchAlerts
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from("alerts")
      .select("*, conveyor_belts(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to fetch alerts", error);
      return;
    }
    setAlerts((data ?? []) as AlertRow[]);
  };

  const resolveAlert = async (alert: AlertRow) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("alerts")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq("id", alert.id);

    if (error) {
      toast({
        title: "Unable to resolve",
        description: "Only admins and operators can resolve alerts.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Alert Resolved", description: `"${alert.title}" marked as resolved.` });
    fetchAlerts();
  };

  const activeCount = alerts.filter((a) => a.status !== "resolved").length;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-display text-lg font-semibold tracking-wide">Active alerts</h3>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="lamp bg-status-warning" aria-hidden />
          {activeCount} pending
        </span>
      </div>

      <ScrollArea className="max-h-[560px]">
        <div>
          {alerts.length === 0 && (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No alerts yet. Live telemetry will raise one when a threshold is crossed.
            </p>
          )}
          {alerts.map((alert) => {
            const resolved = alert.status === "resolved";
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0",
                  resolved ? "bg-transparent" : "hover:bg-secondary/40"
                )}
              >
                <span
                  className={cn(
                    "lamp mt-1.5",
                    resolved ? "bg-status-operational" : lampByPriority[alert.priority] ?? "bg-muted"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4
                      className={cn(
                        "truncate text-sm font-medium text-foreground",
                        resolved && "text-muted-foreground line-through decoration-border"
                      )}
                    >
                      {alert.title}
                    </h4>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {alert.conveyor_belts?.name ?? "Unknown belt"}
                    <span className="ml-2 rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium capitalize text-foreground/80">
                      {resolved ? "resolved" : alert.priority}
                    </span>
                  </p>
                  {alert.description && (
                    <p className="pt-1 text-sm text-muted-foreground">{alert.description}</p>
                  )}
                </div>
                {!resolved && canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                    onClick={() => resolveAlert(alert)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Resolve
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
};