import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, Sparkles, SlidersHorizontal, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import type { BeltThresholdRow } from "@/lib/telemetry";
import AlertThresholdsDialog from "@/components/belts/AlertThresholdsDialog";
import AiDiagnosticDialog from "@/components/belts/AiDiagnosticDialog";
import BeltFormDialog from "@/components/belts/BeltFormDialog";

interface Belt {
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

const statusBadge: Record<string, string> = {
  operational: "bg-status-operational text-status-operational-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  critical: "bg-status-critical text-status-critical-foreground",
};

const Belts = () => {
  const [belts, setBelts] = useState<Belt[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, BeltThresholdRow>>({});
  const [loading, setLoading] = useState(true);
  const [thresholdsFor, setThresholdsFor] = useState<Belt | null>(null);
  const [diagnosticFor, setDiagnosticFor] = useState<Belt | null>(null);
  const [editingBelt, setEditingBelt] = useState<Belt | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingBelt, setDeletingBelt] = useState<Belt | null>(null);

  const { canManage } = useRole();
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from("conveyor_belts")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setBelts((data ?? []) as Belt[]);
    }

    const { data: thresholdRows } = await supabase
      .from("belt_thresholds")
      .select("*");
    const map: Record<string, BeltThresholdRow> = {};
    for (const row of (thresholdRows ?? []) as (BeltThresholdRow & { belt_id: string })[]) {
      map[row.belt_id] = row;
    }
    setThresholds(map);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("belts-management")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conveyor_belts" },
        fetchData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const deleteBelt = async () => {
    if (!deletingBelt) return;
    const { error } = await supabase
      .from("conveyor_belts")
      .delete()
      .eq("id", deletingBelt.id);
    if (error) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Belt Deleted", description: `${deletingBelt.name} was removed.` });
      fetchData();
    }
    setDeletingBelt(null);
  };

  const formatCell = (belt: Belt) => ({
    speed: belt.speed != null ? `${Number(belt.speed).toFixed(1)} m/s` : "—",
    load: belt.load_percentage != null ? `${Math.round(Number(belt.load_percentage))}%` : "—",
    temp: belt.temperature != null ? `${Math.round(Number(belt.temperature))}°C` : "—",
    vibration: belt.vibration != null ? `${Number(belt.vibration).toFixed(1)} mm/s` : "—",
    lastMaintenance: belt.last_maintenance
      ? new Date(belt.last_maintenance).toLocaleDateString()
      : "—",
  });

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
              Belt Management
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Add, update, and configure alert thresholds for conveyor belts
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setShowAddForm(true)} className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              Add Belt
            </Button>
          )}
        </header>

        {!canManage && (
          <div className="rounded-[6px] border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
            You have view-only access. Ask an admin or operator to make changes.
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-[6px]" />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[6px] border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Speed</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Temp</TableHead>
                  <TableHead>Vibration</TableHead>
                  <TableHead>Last Maintenance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {belts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No belts registered yet.
                    </TableCell>
                  </TableRow>
                )}
                {belts.map((belt) => {
                  const cells = formatCell(belt);
                  return (
                    <TableRow key={belt.id}>
                      <TableCell className="font-semibold">
                        <Link
                          to={`/belts/${belt.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {belt.name}
                        </Link>
                      </TableCell>
                      <TableCell>{belt.location}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                            statusBadge[belt.status] ?? "bg-secondary text-secondary-foreground"
                          )}
                        >
                          {belt.status}
                        </span>
                      </TableCell>
                      <TableCell>{cells.speed}</TableCell>
                      <TableCell>{cells.load}</TableCell>
                      <TableCell>{cells.temp}</TableCell>
                      <TableCell>{cells.vibration}</TableCell>
                      <TableCell>{cells.lastMaintenance}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`AI Diagnostic — ${belt.name}`}
                            onClick={() => setDiagnosticFor(belt)}
                          >
                            <Sparkles className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Alert Thresholds — ${belt.name}`}
                            onClick={() => setThresholdsFor(belt)}
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={`Edit ${belt.name}`}
                                onClick={() => setEditingBelt(belt)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={`Delete ${belt.name}`}
                                onClick={() => setDeletingBelt(belt)}
                              >
                                <Trash2 className="h-4 w-4 text-status-critical" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {thresholdsFor && (
          <AlertThresholdsDialog
            belt={{ id: thresholdsFor.id, name: thresholdsFor.name }}
            thresholds={thresholds[thresholdsFor.id] ?? null}
            canManage={canManage}
            open
            onOpenChange={(open) => !open && setThresholdsFor(null)}
            onSaved={fetchData}
          />
        )}

        {diagnosticFor && (
          <AiDiagnosticDialog
            belt={diagnosticFor}
            thresholds={thresholds[diagnosticFor.id] ?? null}
            open
            onOpenChange={(open) => !open && setDiagnosticFor(null)}
          />
        )}

        {(showAddForm || editingBelt) && (
          <BeltFormDialog
            belt={editingBelt ?? null}
            open
            onOpenChange={(open) => {
              if (!open) {
                setShowAddForm(false);
                setEditingBelt(null);
              }
            }}
            onSaved={fetchData}
          />
        )}

        <AlertDialog
          open={Boolean(deletingBelt)}
          onOpenChange={(open) => !open && setDeletingBelt(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deletingBelt?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the belt along with its sensor readings, alerts, and
                maintenance logs. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteBelt}
                className="bg-status-critical text-status-critical-foreground hover:bg-status-critical/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Belts;
