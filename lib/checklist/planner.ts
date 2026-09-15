import { delegate, ChecklistError, sanitizeSolicitacao } from '@/lib/checklists-validacao'
import { registrarAuditoria } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

function text(value: unknown) {
  if (value == null) return null
  const str = String(value).trim()
  return str || null
}

function dateOrNow(value: unknown) {
  const raw = text(value)
  if (!raw) return new Date()
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new ChecklistError('Data inválida')
  return date
}

function normalizePlannerPayload(payload: any) {
  const solicitacao = payload?.solicitacao ?? {}
  const cardPlanner = payload?.card_planner ?? {}

  return {
    ...payload,
    planner_task_id: text(payload?.planner_task_id) ?? text(cardPlanner?.planner_task_id) ?? text(cardPlanner?.planner_id),
    tecnico_nome: text(payload?.tecnico_nome) ?? text(solicitacao?.responsavel_nome),
    tecnico_email: text(payload?.tecnico_email) ?? text(solicitacao?.responsavel_email),
    tecnico_codigo_pessoa:
      text(payload?.tecnico_codigo_pessoa)
      ?? text(solicitacao?.responsavel_codPessoa)
      ?? text(solicitacao?.responsavel_codigo_pessoa),
    atribuido_em: payload?.atribuido_em ?? solicitacao?.atribuido_em,
    concluido_em: payload?.concluido_em ?? solicitacao?.concluido_em,
  }
}

export async function findTecnico(payload: any) {
  const email = text(payload?.tecnico_email)
  const codigo = text(payload?.tecnico_codigo_pessoa)
  const nome = text(payload?.tecnico_nome)
  if (email) {
    const user = await prisma.usuarios.findFirst({ where: { email, ativo: true } })
    if (user) return user
  }
  if (codigo) {
    const user = await prisma.usuarios.findFirst({ where: { codigo_pessoa: codigo, ativo: true } })
    if (user) return user
  }
  if (nome) {
    const user = await prisma.usuarios.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, ativo: true } })
    if (user) return user
  }
  return null
}

export async function plannerAtribuirSolicitacao(id: string, payload: any) {
  payload = normalizePlannerPayload(payload)
  const tecnicoNome = text(payload?.tecnico_nome)
  const tecnicoEmail = text(payload?.tecnico_email)
  const tecnicoCodigo = text(payload?.tecnico_codigo_pessoa)
  if (!tecnicoNome && !tecnicoEmail && !tecnicoCodigo) {
    throw new ChecklistError('tecnico_nome, tecnico_email ou tecnico_codigo_pessoa é obrigatório')
  }
  const tecnico = await findTecnico(payload)
  if (!tecnico?.codigo_pessoa?.trim()) {
    throw new ChecklistError('Técnico não encontrado ou sem código de pessoa válido no inventário', 403)
  }
  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  if (atual.assumido_por && tecnico?.id && atual.assumido_por !== tecnico.id) {
    throw new ChecklistError('Solicitação já assumida por outro técnico no inventário', 409)
  }
  const data: Record<string, unknown> = {
    planner_status: 'assumido',
    planner_task_id: text(payload?.planner_task_id) ?? atual.planner_task_id,
    planner_atualizado_em: new Date(),
    atualizado_em: new Date(),
  }
  if (!atual.assumido_por && tecnico?.id) {
    data.status = 'assumida'
    data.assumido_por = tecnico.id
    data.assumido_em = dateOrNow(payload?.atribuido_em)
  }
  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data,
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  return sanitizeSolicitacao(solicitacao)
}

export async function plannerVincularSolicitacao(id: string, payload: any) {
  const plannerTaskId = text(payload?.planner_task_id)
  if (!plannerTaskId) throw new ChecklistError('planner_task_id é obrigatório')

  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  if (atual.planner_task_id && atual.planner_task_id !== plannerTaskId) {
    throw new ChecklistError('Solicitação já vinculada a outro ID do Planner', 409)
  }

  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data: {
      planner_task_id: plannerTaskId,
      planner_atualizado_em: new Date(),
      atualizado_em: new Date(),
    },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })

  await registrarAuditoria({
    tabela: 'checklists_validacao_solicitacoes',
    registro_id: id,
    acao: 'UPDATE',
    descricao: atual.planner_task_id
      ? 'ID do Planner confirmado pela integração Checklist'
      : 'ID do Planner vinculado pela integração Checklist',
    dados_anteriores: { planner_task_id: atual.planner_task_id, planner_status: atual.planner_status },
    dados_novos: { planner_task_id: plannerTaskId, planner_status: solicitacao.planner_status },
    usuario_id: null,
    usuario_nome: text(payload?.origem) ?? 'Power Automate',
  })

  return sanitizeSolicitacao(solicitacao)
}

export async function plannerConcluirSolicitacao(id: string, payload: any) {
  payload = normalizePlannerPayload(payload)
  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id }, include: { rack_resposta: true, _count: { select: { itens: true } } } })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  const podeFinalizarInterno = atual.tipo_solicitacao === 'RACK'
    ? Boolean(atual.rack_resposta)
    : atual._count.itens > 0
  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data: {
      planner_status: 'concluido',
      planner_task_id: text(payload?.planner_task_id) ?? atual.planner_task_id,
      planner_atualizado_em: new Date(),
      status: podeFinalizarInterno && atual.status !== 'revisada' ? 'finalizada' : atual.status,
      finalizado_em: podeFinalizarInterno ? (atual.finalizado_em ?? dateOrNow(payload?.concluido_em)) : atual.finalizado_em,
      atualizado_em: new Date(),
    },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  return sanitizeSolicitacao(solicitacao)
}
