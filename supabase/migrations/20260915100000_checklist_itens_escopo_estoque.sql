-- Escopo por item da estação e solicitação de revisão de estoque.
-- itens_escopo vazio mantém o comportamento anterior (todos os itens do tipo).
ALTER TABLE public.checklists_validacao_solicitacoes
  ADD COLUMN IF NOT EXISTS itens_escopo text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.checklists_validacao_solicitacoes
  DROP CONSTRAINT IF EXISTS check_checklist_solicitacao_tipo;
ALTER TABLE public.checklists_validacao_solicitacoes
  ADD CONSTRAINT check_checklist_solicitacao_tipo
    CHECK (tipo_solicitacao IN ('SETOR', 'RACK', 'ESTOQUE'));

ALTER TABLE public.checklists_validacao_solicitacoes
  DROP CONSTRAINT IF EXISTS check_checklist_solicitacao_alvo;
ALTER TABLE public.checklists_validacao_solicitacoes
  ADD CONSTRAINT check_checklist_solicitacao_alvo
    CHECK (
      (tipo_solicitacao = 'SETOR' AND setor_id IS NOT NULL AND rack_id IS NULL)
      OR
      (tipo_solicitacao = 'RACK' AND rack_id IS NOT NULL AND setor_id IS NULL)
      OR
      (tipo_solicitacao = 'ESTOQUE' AND setor_id IS NULL AND rack_id IS NULL)
    );

ALTER TABLE public.checklists_validacao_itens
  DROP CONSTRAINT IF EXISTS check_checklist_item_tipo;
ALTER TABLE public.checklists_validacao_itens
  ADD CONSTRAINT check_checklist_item_tipo
    CHECK (tipo_item IN ('MAQUINA', 'RAMAL', 'MONITOR', 'IMPRESSORA', 'NOTEBOOK', 'APARELHO'));
