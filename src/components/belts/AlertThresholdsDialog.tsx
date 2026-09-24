import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { BeltThresholdRow } from "@/lib/telemetry";

const ROWS: { label: string; warnKey: keyof BeltThresholdRow; critKey: keyof BeltThresholdRow }[] = [
  { label: "Temperature (°C)", warnKey: "temp_warn", critKey: "temp_crit" },
  { label: "Vibration (mm/s)", warnKey: "vibration_warn", critKey: "vibration_crit" },
  { label: "Load (%)", warnKey: "load_warn", critKey: "load_crit" },
  { label: "Speed (m/s)", warnKey: "speed_warn", critKey: "speed_crit" },
];

interface AlertThresholdsDialogProps {
  belt: { id: string; name: string };
  thresholds: BeltThresholdRow | null;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const AlertThresholdsDialog = ({
  belt,
  thresholds,
  canManage,
  open,
  onOpenChange,
  onSaved,
}: AlertThresholdsDialogProps) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const row of ROWS) {
      next[row.warnKey] = thresholds?.[row.warnKey] != null ? String(thresholds[row.warnKey]) : "";
      next[row.critKey] = thresholds?.[row.critKey] != null ? String(thresholds[row.critKey]) : "";
    }
    setValues(next);
  }, [open, thresholds]);

  const save = async () => {
    setSaving(true);
    const payload: Record<string, number | null> = {};
    for (const row of ROWS) {
      for (const key of [row.warnKey, row.critKey]) {
        const raw = values[key]?.trim();
        payload[key] = raw === "" || raw == null || Number.isNaN(Number(raw)) ? null : Number(raw);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("belt_thresholds")
      .upsert(
        {
          belt_id: belt.id,
          ...payload,
          updated_by: user?.id ?? null,
        },
        { onConflict: "belt_id" }
      );

    setSaving(false);
    if (error) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Thresholds Saved", description: `Alert thresholds updated for ${belt.name}.` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alert Thresholds — {belt.name}</DialogTitle>
          <DialogDescription>
            Empty fields fall back to global defaults. Warning &lt; Critical for rising metrics; for
            speed, lower values trigger alerts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_100px_100px] items-center gap-3">
              <span className="text-sm font-medium">{row.label}</span>
              <Input
                type="number"
                step="any"
                placeholder="Warn"
                disabled={!canManage}
                value={values[row.warnKey] ?? ""}
                onChange={(e) => setValues({ ...values, [row.warnKey]: e.target.value })}
              />
              <Input
                type="number"
                step="any"
                placeholder="Crit"
                disabled={!canManage}
                value={values[row.critKey] ?? ""}
                onChange={(e) => setValues({ ...values, [row.critKey]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canManage && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Thresholds"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AlertThresholdsDialog;
