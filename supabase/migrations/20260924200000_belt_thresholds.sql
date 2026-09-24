-- Per-belt alert thresholds. NULL values fall back to the client-side global
-- defaults in src/lib/telemetry.ts.
CREATE TABLE public.belt_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belt_id UUID REFERENCES public.conveyor_belts(id) ON DELETE CASCADE NOT NULL UNIQUE,
  temp_warn DECIMAL,
  temp_crit DECIMAL,
  vibration_warn DECIMAL,
  vibration_crit DECIMAL,
  load_warn DECIMAL,
  load_crit DECIMAL,
  speed_warn DECIMAL,
  speed_crit DECIMAL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.belt_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view belt thresholds"
  ON public.belt_thresholds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and operators can insert belt thresholds"
  ON public.belt_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Admins and operators can update belt thresholds"
  ON public.belt_thresholds FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Admins and operators can delete belt thresholds"
  ON public.belt_thresholds FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER update_belt_thresholds_updated_at
  BEFORE UPDATE ON public.belt_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Belt management: align conveyor_belts insert/delete with the other
-- operational tables so admins AND operators can add/remove belts.
DROP POLICY IF EXISTS "Admins can insert belts" ON public.conveyor_belts;

CREATE POLICY "Admins and operators can insert belts"
  ON public.conveyor_belts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Admins and operators can delete belts"
  ON public.conveyor_belts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
