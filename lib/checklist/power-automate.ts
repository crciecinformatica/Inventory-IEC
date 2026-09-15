import { registrarAuditoria } from '@/lib/audit'
import { checklistUrl, delegate, publicAppOrigin, tituloSolicitacao } from '@/lib/checklists-validacao'

type ChecklistWebhookEvent = 'solicitacao_criada' | 'solicitacao_assumida' | 'solicitacao_finalizada'

type WebhookResult = {
  ok: boolean
  skipped?: boolean
  status?: number
  body?: unknown
  error?: string
}

const CREATE_WEBHOOK_ENV = 'CHECKLIST_POWER_AUTOMATE_CREATE_WEBHOOK_URL'
const STATUS_WEBHOOK_ENV = 'CHECKLIST_POWER_AUTOMATE_STATUS_WEBHOOK_URL'
const WEBHOOK_TIMEOUT_MS = 6000

function text(value: unknown) {
  if (value == null) return null
  const str = String(value).trim()
  return str || null
}

function targetName(solicitacao: any) {
  if (solicitacao.tipo_solicitacao === 'ESTOQUE') return tituloSolicitacao(solicitacao)
  return solicitacao.tipo_solicitacao === 'RACK'
    ? text(solicitacao.rack?.nome_switch) ?? 'Rack'
    : text(solicitacao.setor?.nome) ?? 'Setor'
}

function targetPayload(solicitacao: any) {
  if (solicitacao.tipo_solicitacao === 'RACK') {
    return {
      id: solicitacao.rack?.id ?? null,
      nome: text(solicitacao.rack?.nome_switch),
      local_fisico: text(solicitacao.rack?.localizacao),
    }
  }

  return {
    id: solicitacao.setor?.id ?? null,
    nome: text(solicitacao.setor?.nome),
  }
}

function checklistItemsFor(tipoSolicitacao: string) {
  if (tipoSolicitacao === 'RACK') return ['informações gerais', 'portas', 'ocupação']
  if (tipoSolicitacao === 'ESTOQUE') return ['conferência dos dispositivos', 'divergências']
  return ['máquinas', 'ramais', 'monitores', 'impressoras']
}

function bucketFor(tipoSolicitacao: string) {
  if (tipoSolicitacao === 'ESTOQUE') return 'Estoque'
  return tipoSolicitacao === 'RACK' ? 'Racks' : 'Setores'
}

function titleFor(solicitacao: any) {
  const tipo = ['RACK', 'ESTOQUE'].includes(solicitacao.tipo_solicitacao) ? solicitacao.tipo_solicitacao : 'SETOR'
  return `Checklist ${tipo} - ${targetName(solicitacao)}`
}

function descriptionFor(solicitacao: any) {
  const checklistName = text(solicitacao.checklist?.nome) ?? 'checklist de validação'
  const localidadeName = text(solicitacao.checklist?.localidade?.nome) ?? 'localidade'
  const alvo = targetName(solicitacao)

  if (solicitacao.tipo_solicitacao === 'RACK') {
    return [
      `Checklist: ${checklistName}.`,
      `Solicitação: Rack ${alvo}.`,
      `Localidade: ${localidadeName}.`,
      'Realizar a contagem e validação das portas do rack, conferindo ocupação, funcionalidade e usos.',
      'O preenchimento deve ser feito no inventário.',
    ].join(' ')
  }

  if (solicitacao.tipo_solicitacao === 'ESTOQUE') {
    return [
      `Checklist: ${checklistName}.`,
      `Solicitação: ${alvo}.`,
      `Localidade: ${localidadeName}.`,
      `Conferir todos os itens da unidade (${alvo.toLowerCase()}), marcando o que foi encontrado e registrando divergências.`,
      'O preenchimento deve ser feito no inventário.',
    ].join(' ')
  }

  return [
    `Checklist: ${checklistName}.`,
    `Solicitação: Setor ${alvo}.`,
    `Localidade: ${localidadeName}.`,
    'Revisar as estações de trabalho, incluindo máquinas, ramais, monitores e colaboradores vinculados.',
    'Também revisar os ativos setoriais independentes, como impressoras.',
    'O preenchimento deve ser feito no inventário.',
  ].join(' ')
}

function normalizedLink(solicitacao: any) {
  const saved = text(solicitacao.link_inventario)
  if (!saved) return checklistUrl(solicitacao.id)

  try {
    const url = new URL(saved)
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)
    if (!isLocal) return saved
  } catch {
    return saved
  }

  return publicAppOrigin() ? checklistUrl(solicitacao.id) : saved
}

function buildCreatePayload(solicitacao: any) {
  const localidade = solicitacao.checklist?.localidade
  const localidadeNome = text(localidade?.nome)
  const link = normalizedLink(solicitacao)

  return {
    origem: 'inventario-checklist',
    evento: 'solicitacao_criada' satisfies ChecklistWebhookEvent,
    checklist: {
      id: solicitacao.checklist?.id ?? solicitacao.checklist_validacao_id,
      nome: text(solicitacao.checklist?.nome),
      localidade: localidadeNome,
      localidade_id: localidade?.id ?? null,
    },
    solicitacao: {
      id: solicitacao.id,
      tipo: solicitacao.tipo_solicitacao,
      status_interno: solicitacao.status,
      planner_status: solicitacao.planner_status,
      responsavel_codPessoa: text(solicitacao.tecnico?.codigo_pessoa),
      setor: solicitacao.tipo_solicitacao === 'SETOR' ? targetPayload(solicitacao) : null,
      rack: solicitacao.tipo_solicitacao === 'RACK' ? targetPayload(solicitacao) : null,
      link_inventario: link,
    },
    card_planner: {
      planner_id: text(solicitacao.planner_task_id),
      titulo: titleFor(solicitacao),
      bucket: bucketFor(solicitacao.tipo_solicitacao),
      descricao: descriptionFor(solicitacao),
      prioridade: 'normal',
      checklist_itens: checklistItemsFor(solicitacao.tipo_solicitacao),
      links: [{ nome: 'Abrir no inventário', url: link }],
    },
  }
}

function buildStatusPayload(solicitacao: any, evento: Exclude<ChecklistWebhookEvent, 'solicitacao_criada'>) {
  return {
    origem: 'inventario-checklist',
    evento,
    solicitacao: {
      id: solicitacao.id,
      tipo: solicitacao.tipo_solicitacao,
      status_interno: solicitacao.status,
      planner_status: solicitacao.planner_status,
      responsavel_codPessoa: text(solicitacao.tecnico?.codigo_pessoa),
      setor: solicitacao.tipo_solicitacao === 'SETOR' ? targetPayload(solicitacao) : null,
      rack: solicitacao.tipo_solicitacao === 'RACK' ? targetPayload(solicitacao) : null,
      link_inventario: normalizedLink(solicitacao),
    },
    card_planner: {
      planner_id: text(solicitacao.planner_task_id),
    },
  }
}

function readWebhookUrl(envName: string) {
  return text(process.env[envName])
}

function parseBody(raw: string) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractPlannerId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = body as Record<string, any>
  return text(data.planner_id)
    ?? text(data.planner_task_id)
    ?? text(data.id)
    ?? text(data.card_planner?.planner_id)
    ?? text(data.card_planner?.planner_task_id)
}

function bodyForAudit(body: unknown) {
  if (body == null) return null
  if (typeof body === 'string') return body.slice(0, 2000)
  if (typeof body === 'object') return body as Record<string, unknown>
  return String(body)
}

async function postWebhook(url: string | null, payload: unknown): Promise<WebhookResult> {
  if (!url) return { ok: false, skipped: true, error: 'URL não configurada' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const raw = await response.text()
    return { ok: response.ok, status: response.status, body: parseBody(raw) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return { ok: false, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

async function safeAudit(params: {
  solicitacaoId: string
  descricao: string
  dados_anteriores?: Record<string, unknown> | null
  dados_novos?: Record<string, unknown> | null
}) {
  try {
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: params.solicitacaoId,
      acao: 'UPDATE',
      descricao: params.descricao,
      dados_anteriores: params.dados_anteriores ?? null,
      dados_novos: params.dados_novos ?? null,
      usuario_id: null,
      usuario_nome: 'Power Automate',
    })
  } catch (error) {
    console.warn('[checklist/power-automate] falha ao auditar integração', error)
  }
}

async function getSolicitacaoForWebhook(id: string) {
  return delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id },
    include: {
      checklist: { include: { localidade: { select: { id: true, nome: true } } } },
      setor: { select: { id: true, nome: true } },
      rack: { select: { id: true, nome_switch: true, localizacao: true } },
      tecnico: { select: { id: true, nome: true, codigo_pessoa: true } },
    },
  })
}

async function sendCreateWebhook(solicitacao: any) {
  const payload = buildCreatePayload(solicitacao)
  const result = await postWebhook(readWebhookUrl(CREATE_WEBHOOK_ENV), payload)
  const plannerId = result.ok ? extractPlannerId(result.body) : null

  if (plannerId && !solicitacao.planner_task_id) {
    await delegate('checklists_validacao_solicitacoes').update({
      where: { id: solicitacao.id },
      data: {
        planner_task_id: plannerId,
        planner_atualizado_em: new Date(),
        atualizado_em: new Date(),
      },
    })
  }

  await safeAudit({
    solicitacaoId: solicitacao.id,
    descricao: result.ok
      ? (plannerId ? 'Card Planner criado pelo Power Automate e vinculado ao checklist' : 'Webhook de criação enviado ao Power Automate')
      : (result.skipped ? 'Webhook de criação não enviado: URL do Power Automate não configurada' : 'Falha ao enviar webhook de criação ao Power Automate'),
    dados_anteriores: { planner_task_id: solicitacao.planner_task_id },
    dados_novos: {
      evento: 'solicitacao_criada',
      ok: result.ok,
      skipped: Boolean(result.skipped),
      status: result.status ?? null,
      erro: result.error ?? null,
      resposta: bodyForAudit(result.body),
      planner_task_id: plannerId ?? solicitacao.planner_task_id ?? null,
    },
  })
}

export async function notifyChecklistCreation(checklistId: string) {
  try {
    const solicitacoes = await delegate('checklists_validacao_solicitacoes').findMany({
      where: { checklist_validacao_id: checklistId },
      include: {
        checklist: { include: { localidade: { select: { id: true, nome: true } } } },
        setor: { select: { id: true, nome: true } },
        rack: { select: { id: true, nome_switch: true, localizacao: true } },
        tecnico: { select: { id: true, nome: true, codigo_pessoa: true } },
      },
    })

    await Promise.allSettled(solicitacoes.map(sendCreateWebhook))
  } catch (error) {
    console.warn('[checklist/power-automate] falha geral na notificação de criação', error)
  }
}

export async function notifyChecklistSolicitacaoStatus(
  solicitacaoId: string,
  evento: Exclude<ChecklistWebhookEvent, 'solicitacao_criada'>,
) {
  try {
    const solicitacao = await getSolicitacaoForWebhook(solicitacaoId)
    if (!solicitacao) return

    if (!text(solicitacao.planner_task_id)) {
      await safeAudit({
        solicitacaoId,
        descricao: 'Webhook de status não enviado: solicitação sem card Planner vinculado',
        dados_novos: { evento, motivo: 'planner_task_id ausente' },
      })
      return
    }

    const payload = buildStatusPayload(solicitacao, evento)
    const result = await postWebhook(readWebhookUrl(STATUS_WEBHOOK_ENV), payload)

    await safeAudit({
      solicitacaoId,
      descricao: result.ok
        ? `Webhook de status ${evento} enviado ao Power Automate`
        : (result.skipped ? 'Webhook de status não enviado: URL do Power Automate não configurada' : `Falha ao enviar webhook de status ${evento} ao Power Automate`),
      dados_novos: {
        evento,
        ok: result.ok,
        skipped: Boolean(result.skipped),
        status: result.status ?? null,
        erro: result.error ?? null,
        resposta: bodyForAudit(result.body),
        responsavel_codPessoa: text(solicitacao.tecnico?.codigo_pessoa),
        planner_task_id: text(solicitacao.planner_task_id),
      },
    })
  } catch (error) {
    console.warn('[checklist/power-automate] falha geral na notificação de status', error)
  }
}
