-- Escopo granular do checklist: cada solicitação setorial pode restringir
-- quais impressoras do setor serão validadas. Solicitações existentes ficam
-- com restringir_impressoras = false e continuam contemplando todas.
ALTER TABLE public.checklists_validacao_solicitacoes
  ADD COLUMN IF NOT EXISTS restringir_impressoras boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impressora_ids uuid[] NOT NULL DEFAULT '{}';
