-- Alert rules for machine-wise threshold monitoring
-- --------------------------------------------------------
-- Allows operators to set custom thresholds per machine and receive Telegram notifications

-- alert_rules - per-machine threshold alert rules
CREATE TABLE public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  machine_id TEXT NOT NULL, -- belt name for lookup
  metric TEXT NOT NULL CHECK (metric IN ('servicing_probability', 'load_percentage', 'risk_level')),
  threshold_value NUMERIC NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte')),
  message_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alert rules"
  ON public.alert_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own alert rules"
  ON public.alert_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alert rules"
  ON public.alert_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alert rules"
  ON public.alert_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for efficient querying
CREATE INDEX alert_rules_machine_id_enabled_idx ON public.alert_rules (machine_id, enabled);