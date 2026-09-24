-- Feature expansion: analyses, predictions, work orders, alert source, KPI view

-- ---------------------------------------------------------------------------
-- analyses - persisted AI analysis runs
-- ---------------------------------------------------------------------------
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT,
  summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analyses"
  ON public.analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analyses"
  ON public.analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
  ON public.analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- predictions - per-machine results belonging to an analysis
-- ---------------------------------------------------------------------------
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE NOT NULL,
  machine_id TEXT NOT NULL,
  servicing_probability NUMERIC NOT NULL,
  risk_level TEXT NOT NULL,
  key_indicators JSONB DEFAULT '[]'::jsonb,
  recommended_action TEXT,
  priority_score NUMERIC
);

CREATE INDEX predictions_analysis_id_idx ON public.predictions (analysis_id);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analyses predictions"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = predictions.analysis_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create predictions for their own analyses"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = predictions.analysis_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete predictions for their own analyses"
  ON public.predictions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = predictions.analysis_id AND a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- work_orders - generated from predictions or created manually
-- ---------------------------------------------------------------------------
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belt_id UUID REFERENCES public.conveyor_belts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view work orders"
  ON public.work_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and operators can create work orders"
  ON public.work_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Admins and operators can update work orders"
  ON public.work_orders FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- ---------------------------------------------------------------------------
-- alerts - add source to distinguish system threshold alerts from AI/manual
-- ---------------------------------------------------------------------------
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system';

-- Index to speed up deduplication lookups during telemetry simulation
CREATE INDEX IF NOT EXISTS alerts_belt_title_active_idx
  ON public.alerts (belt_id, title)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- sensor_readings - widen insert to authenticated users so the browser-based
-- telemetry simulator can write for any signed-in user.
-- NOTE: this project ships a browser-driven simulation instead of real IoT.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and operators can insert readings" ON public.sensor_readings;
CREATE POLICY "Authenticated users can insert readings"
  ON public.sensor_readings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- conveyor_belts - widen update so the simulator can refresh live metrics for
-- any signed-in user. Real deployments should revert to role-gated policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and operators can update belts" ON public.conveyor_belts;
CREATE POLICY "Authenticated users can update belts"
  ON public.conveyor_belts FOR UPDATE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Enable realtime for new tables
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.analyses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;

-- ---------------------------------------------------------------------------
-- kpi_summary - aggregate view backing the Reports KPI engine
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.kpi_summary AS
WITH maintenance_stats AS (
  SELECT
    COUNT(*) AS total_maintenance,
    COUNT(*) FILTER (WHERE maintenance_type = 'Corrective') AS corrective_count,
    COUNT(*) FILTER (WHERE maintenance_type = 'Preventive') AS preventive_count,
    COUNT(*) FILTER (WHERE maintenance_type = 'Predictive') AS predictive_count,
    COALESCE(AVG(downtime_hours) FILTER (WHERE downtime_hours IS NOT NULL), 0) AS avg_downtime_hours,
    COALESCE(SUM(downtime_hours) FILTER (WHERE downtime_hours IS NOT NULL), 0) AS total_downtime_hours,
    COALESCE(SUM(cost) FILTER (WHERE cost IS NOT NULL), 0) AS total_cost,
    COALESCE(MAX(performed_at), NOW() - INTERVAL '30 days') AS first_maintenance
  FROM public.maintenance_logs
),
maintenance_age AS (
  SELECT
    CASE WHEN total_maintenance > 0
      THEN EXTRACT(EPOCH FROM (NOW() - first_maintenance)) / GREATEST(corrective_count, 1)
      ELSE 0
    END / 3600.0 AS mtbf_hours
  FROM maintenance_stats
),
fleet AS (
  SELECT
    COUNT(*) AS total_belts,
    COUNT(*) FILTER (WHERE status = 'operational') AS operational_belts,
    COUNT(*) FILTER (WHERE status = 'warning') AS warning_belts,
    COUNT(*) FILTER (WHERE status = 'critical') AS critical_belts
  FROM public.conveyor_belts
),
alert_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'active') AS active_alerts,
    COUNT(*) FILTER (WHERE status = 'active' AND priority = 'critical') AS active_critical_alerts
  FROM public.alerts
),
work_order_stats AS (
  SELECT COUNT(*) FILTER (WHERE status = 'open') AS open_work_orders
  FROM public.work_orders
)
SELECT
  f.total_belts,
  f.operational_belts,
  f.warning_belts,
  f.critical_belts,
  CASE WHEN f.total_belts > 0 THEN (f.operational_belts::numeric / f.total_belts) * 100 ELSE 0 END AS fleet_availability,
  ms.total_maintenance,
  ms.corrective_count,
  ms.preventive_count,
  ms.predictive_count,
  ms.avg_downtime_hours AS mttr_hours,
  ma.mtbf_hours,
  ms.total_downtime_hours,
  ms.total_cost,
  al.active_alerts,
  al.active_critical_alerts,
  wo.open_work_orders
FROM maintenance_stats ms, maintenance_age ma, fleet f, alert_stats al, work_order_stats wo;

GRANT SELECT ON public.kpi_summary TO authenticated;