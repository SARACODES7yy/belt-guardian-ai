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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BeltFormValues {
  name: string;
  location: string;
  status: string;
  speed: string;
  load_percentage: string;
  temperature: string;
  vibration: string;
  last_maintenance: string;
}

const EMPTY_FORM: BeltFormValues = {
  name: "",
  location: "",
  status: "operational",
  speed: "",
  load_percentage: "",
  temperature: "",
  vibration: "",
  last_maintenance: "",
};

export interface BeltFormBelt {
  id?: string;
  name?: string;
  location?: string;
  status?: string;
  speed?: number | string | null;
  load_percentage?: number | string | null;
  temperature?: number | string | null;
  vibration?: number | string | null;
  last_maintenance?: string | null;
}

interface BeltFormDialogProps {
  belt: BeltFormBelt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const toNum = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
};

const BeltFormDialog = ({ belt, open, onOpenChange, onSaved }: BeltFormDialogProps) => {
  const isEdit = Boolean(belt?.id);
  const [form, setForm] = useState<BeltFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      belt
        ? {
            name: belt.name ?? "",
            location: belt.location ?? "",
            status: belt.status || "operational",
            speed: belt.speed != null ? String(belt.speed) : "",
            load_percentage: belt.load_percentage != null ? String(belt.load_percentage) : "",
            temperature: belt.temperature != null ? String(belt.temperature) : "",
            vibration: belt.vibration != null ? String(belt.vibration) : "",
            last_maintenance: belt.last_maintenance ? belt.last_maintenance.slice(0, 10) : "",
          }
        : EMPTY_FORM
    );
  }, [open, belt]);

  const save = async () => {
    if (!form.name.trim() || !form.location.trim()) {
      toast({
        title: "Missing Fields",
        description: "Name and location are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      status: form.status,
      speed: toNum(form.speed),
      load_percentage: toNum(form.load_percentage),
      temperature: toNum(form.temperature),
      vibration: toNum(form.vibration),
      last_maintenance: form.last_maintenance ? new Date(form.last_maintenance).toISOString() : null,
    };

    setSaving(true);
    const { error } = isEdit
      ? await supabase.from("conveyor_belts").update(payload).eq("id", belt!.id!)
      : await supabase.from("conveyor_belts").insert(payload);
    setSaving(false);

    if (error) {
      toast({ title: isEdit ? "Update Failed" : "Create Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: isEdit ? "Belt Updated" : "Belt Added",
      description: `${payload.name} was ${isEdit ? "updated" : "added"} successfully.`,
    });
    onOpenChange(false);
    onSaved();
  };

  const set = (key: keyof BeltFormValues, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${belt?.name}` : "Add Belt"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the belt's details and current readings."
              : "Register a new conveyor belt and its current readings."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="belt-name">Name</Label>
            <Input
              id="belt-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Belt E-5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-location">Location</Label>
            <Input
              id="belt-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Section E - Smelter 2"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operational">Operational</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-last-maintenance">Last Maintenance</Label>
            <Input
              id="belt-last-maintenance"
              type="date"
              value={form.last_maintenance}
              onChange={(e) => set("last_maintenance", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-speed">Speed (m/s)</Label>
            <Input
              id="belt-speed"
              type="number"
              step="any"
              value={form.speed}
              onChange={(e) => set("speed", e.target.value)}
              placeholder="4.8"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-load">Load (%)</Label>
            <Input
              id="belt-load"
              type="number"
              step="any"
              value={form.load_percentage}
              onChange={(e) => set("load_percentage", e.target.value)}
              placeholder="78"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-temp">Temperature (°C)</Label>
            <Input
              id="belt-temp"
              type="number"
              step="any"
              value={form.temperature}
              onChange={(e) => set("temperature", e.target.value)}
              placeholder="42"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="belt-vibration">Vibration (mm/s)</Label>
            <Input
              id="belt-vibration"
              type="number"
              step="any"
              value={form.vibration}
              onChange={(e) => set("vibration", e.target.value)}
              placeholder="2.1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Belt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BeltFormDialog;
