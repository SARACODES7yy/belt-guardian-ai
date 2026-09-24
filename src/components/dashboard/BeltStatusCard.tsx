import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BeltStatusCardProps {
  belt: {
    id: string;
    name: string;
    status: "operational" | "warning" | "critical" | "maintenance";
    speed: number;
    load: number;
    temperature: number;
    vibration: number;
    runtime: number;
  };
}

const lampStyles: Record<string, string> = {
  operational: "bg-status-operational",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  maintenance: "bg-status-maintenance",
};

const readoutStyles: Record<string, string> = {
  operational: "",
  warning: "text-status-warning",
  critical: "text-status-critical",
  maintenance: "text-status-maintenance",
};

export const BeltStatusCard = ({ belt }: BeltStatusCardProps) => {
  const lamp = lampStyles[belt.status] ?? "bg-muted";
  const fmt1 = (n: number) => (Number.isFinite(n) ? Number(n).toFixed(1) : String(n));
  const loadPct = Math.round(belt.load);

  return (
    <Card className="group overflow-hidden transition-colors hover:bg-secondary/40">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
        <span className="font-display text-base font-semibold uppercase tracking-[0.06em] text-foreground">
          {belt.name}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("lamp", lamp)} aria-hidden />
          <span className="text-xs font-medium text-muted-foreground capitalize">{belt.status}</span>
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className={cn("readout text-2xl", readoutStyles[belt.status])}>{fmt1(belt.speed)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Speed, m/s</p>
          </div>
          <div>
            <p className={cn("readout text-2xl", readoutStyles[belt.status])}>{fmt1(belt.temperature)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Temp, °C</p>
          </div>
          <div>
            <p
              className={cn(
                "readout text-2xl",
                belt.vibration > 5 ? "text-status-critical" : readoutStyles[belt.status]
              )}
            >
              {fmt1(belt.vibration)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Vibration, mm/s</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Load</span>
            <span className="font-medium text-foreground">{loadPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all", lamp)}
              style={{ width: `${Math.max(0, Math.min(100, belt.load))}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-medium">{belt.id}</span>
          <span>{belt.runtime}h runtime</span>
        </div>
      </div>
    </Card>
  );
};