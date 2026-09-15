-- Campo padrão de última revisão em todos os dispositivos:
-- checklist_revisado_em (quando), checklist_ultima_id (qual checklist),
-- checklist_tecnico_id (quem conferiu) e checklist_revisor_id (quem aprovou).
ALTER TABLE public.notebooks
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

ALTER TABLE public.aparelhos
  ADD COLUMN IF NOT EXISTS checklist_ultima_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_tecnico_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisor_id uuid,
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

-- Racks usavam checklist_validado_em; passam a ter o mesmo nome dos demais.
ALTER TABLE public.racks
  ADD COLUMN IF NOT EXISTS checklist_revisado_em timestamptz;

UPDATE public.racks
SET checklist_revisado_em = checklist_validado_em
WHERE checklist_revisado_em IS NULL AND checklist_validado_em IS NOT NULL;
