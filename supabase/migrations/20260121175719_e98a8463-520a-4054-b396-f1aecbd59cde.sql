-- Store trained ML model artifacts (logistic regression + decision tree) for inference
CREATE TABLE IF NOT EXISTS public.ml_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  model_key text NOT NULL UNIQUE,
  model_type text NOT NULL, -- e.g. 'logistic_regression' | 'decision_tree'
  params jsonb NOT NULL,   -- model weights/tree, plus feature schema
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb, -- accuracy, auc, etc.
  is_active boolean NOT NULL DEFAULT false,
  trained_by uuid NOT NULL
);

ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active models for inference
CREATE POLICY "ML models: read authenticated"
ON public.ml_models
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only doctors can create models
CREATE POLICY "ML models: doctors insert"
ON public.ml_models
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'doctor'::public.app_role)
  AND trained_by = auth.uid()
);

-- Only doctors can update models (including activating)
CREATE POLICY "ML models: doctors update"
ON public.ml_models
FOR UPDATE
USING (public.has_role(auth.uid(), 'doctor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'doctor'::public.app_role));

-- Maintain updated_at
CREATE TRIGGER set_ml_models_updated_at
BEFORE UPDATE ON public.ml_models
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Helper: set a single model active (doctor-only)
CREATE OR REPLACE FUNCTION public.set_active_ml_model(_model_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'doctor'::public.app_role) THEN
    RAISE EXCEPTION 'Only doctors can activate models';
  END IF;

  UPDATE public.ml_models SET is_active = false WHERE is_active = true;
  UPDATE public.ml_models SET is_active = true WHERE model_key = _model_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Model not found: %', _model_key;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_ml_model(text) TO authenticated;
