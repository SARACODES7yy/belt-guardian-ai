import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, UserCheck, PlayCircle, CheckCircle2, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";

interface WorkOrderRow {
  id: string;
  belt_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string | null;
  due_date: string | null;
  created_at: string | null;
  completed_at: string | null;
  belt: { name: string } | null;
}

const statusLamp: Record<string, string> = {
  open: "bg-status-warning",
  in_progress: "bg-status-info",
  completed: "bg-status-operational",
};

const WorkOrders = () => {
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [belts, setBelts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    belt_id: "",
    title: "",
    description: "",
    priority: "medium",
  });
  const { canManage } = useRole();
  const { toast } = useToast();

  useEffect(() => {
    fetchOrders();
    fetchBelts();

    const channel = supabase
      .channel("work-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, fetchOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select("*, conveyor_belts(name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch work orders", error);
    } else {
      setOrders((data ?? []) as unknown as WorkOrderRow[]);
    }
    setLoading(false);
  };

  const fetchBelts = async () => {
    const { data } = await supabase.from("conveyor_belts").select("id, name").order("name");
    setBelts((data ?? []) as { id: string; name: string }[]);
  };

  const createOrder = async () => {
    if (!form.title.trim()) {
      toast({ title: "Missing Title", description: "A title is required.", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("work_orders").insert({
      belt_id: form.belt_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      created_by: user?.id ?? null,
    });

    if (error) {
      toast({ title: "Create Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Work Order Created", description: "New maintenance work order added." });
    setShowForm(false);
    setForm({ belt_id: "", title: "", description: "", priority: "medium" });
    fetchOrders();
  };

  const assignToMe = async (order: WorkOrderRow) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("work_orders")
      .update({ assigned_to: user?.id ?? null })
      .eq("id", order.id);
    if (error) return toastError(error.message);
    toast({ title: "Assigned", description: `Assigned "${order.title}" to you.` });
    fetchOrders();
  };

  const startOrder = async (order: WorkOrderRow) => {
    const { error } = await supabase
      .from("work_orders")
      .update({ status: "in_progress" })
      .eq("id", order.id);
    if (error) return toastError(error.message);
    toast({ title: "Started", description: `"${order.title}" marked in progress.` });
    fetchOrders();
  };

  const completeOrder = async (order: WorkOrderRow) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("work_orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) return toastError(error.message);

    if (order.belt_id) {
      await supabase.from("maintenance_logs").insert({
        belt_id: order.belt_id,
        performed_by: user?.id ?? (order.created_by ?? ""),
        maintenance_type: order.priority === "critical" ? "Corrective" : "Preventive",
        description: `${order.title}: ${order.description ?? ""}`.trim(),
        downtime_hours: order.priority === "critical" ? 2 : 0,
      });
    }

    toast({ title: "Completed", description: `"${order.title}" completed and logged.` });
    fetchOrders();
  };

  const toastError = (message: string) =>
    toast({ title: "Action Failed", description: message, variant: "destructive" });

  const priorityChip = (priority: string) => (
    <span
      className={`rounded-[4px] px-1.5 py-px text-[11px] font-medium capitalize ${
        priority === "critical"
          ? "bg-status-critical/15 text-status-critical"
          : priority === "high"
          ? "bg-status-warning/15 text-status-warning"
          : "bg-secondary text-foreground/80"
      }`}
    >
      {priority}
    </span>
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
              Maintenance work orders
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Tasks from AI predictions and maintenance planning
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setShowForm((v) => !v)} className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              New work order
            </Button>
          )}
        </header>

        {showForm && canManage && (
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">Create work order</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Belt</label>
                <Select value={form.belt_id} onValueChange={(v) => setForm({ ...form, belt_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a belt (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {belts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Replace drive belt tensioner"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detailed work to be performed"
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

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-[6px]" />
            ))}
          </div>
        )}

        {!loading && orders.length === 0 && (
          <Card className="p-10 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No work orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              High and critical AI predictions auto-create work orders, or create one manually.
            </p>
          </Card>
        )}

        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} className="p-5">
              <div className="space-y-3">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-semibold tracking-wide">{order.title}</h3>
                      {priorityChip(order.priority)}
                      <span className="flex items-center gap-1.5 text-xs font-medium capitalize text-foreground/80">
                        <span className={`lamp ${statusLamp[order.status] ?? "bg-muted"}`} aria-hidden />
                        {order.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium text-foreground/80">
                        {order.belt?.name ?? "No belt assigned"}
                      </span>
                      <span>{order.assigned_to ? "Assigned" : "Unassigned"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.status === "open" && order.assigned_to == null && canManage && (
                      <Button variant="outline" size="sm" onClick={() => assignToMe(order)}>
                        <UserCheck className="h-4 w-4" />
                        Assign to me
                      </Button>
                    )}
                    {order.status === "open" && canManage && (
                      <Button variant="outline" size="sm" onClick={() => startOrder(order)}>
                        <PlayCircle className="h-4 w-4" />
                        Start
                      </Button>
                    )}
                    {order.status !== "completed" && canManage && (
                      <Button size="sm" onClick={() => completeOrder(order)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
                {order.description && (
                  <p className="text-sm text-muted-foreground">{order.description}</p>
                )}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {order.created_at && (
                    <span>Created {new Date(order.created_at).toLocaleString()}</span>
                  )}
                  {order.due_date && (
                    <span>Due {new Date(order.due_date).toLocaleDateString()}</span>
                  )}
                  {order.completed_at && (
                    <span>Completed {new Date(order.completed_at).toLocaleString()}</span>
                  )}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkOrders;