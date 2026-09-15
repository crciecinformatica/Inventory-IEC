import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoEditable, gerarDiffSolicitacao } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import { notifyChecklistSolicitacaoStatus } from '@/lib/checklist/power-automate'
import { isChecklistIntegrationAuthorized } from '@/lib/checklist/auth'
import { plannerConcluirSolicitacao } from '@/lib/checklist/planner'
import { ensureChecklistTecnicoApto } from '@/lib/checklist/tecnico'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

function tokenSource(request: Request) {
  if (request.headers.get('authorization')?.toLowerCase().startsWith('bearer ')) return 'bearer'
  if (request.headers.get('x-api-key')) return 'x-api-key'
  return 'none'
}

function payloadSummary(payload: any) {
  const solicitacao = payload?.solicitacao ?? {}
  const cardPlanner = payload?.card_planner ?? {}
  return {
    keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    has_planner_task_id: Boolean(payload?.planner_task_id ?? cardPlanner?.planner_task_id ?? cardPlanner?.planner_id),
    concluido_em: payload?.concluido_em ?? solicitacao?.concluido_em ?? null,
  }
}

function logIntegration(event: string, details: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const line = JSON.stringify({
    scope: 'checklist.integration',
    route: 'checklists-validacao-solicitacoes.finalizar',
    event,
    ...details,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

async function handleExternalFinalizar(request: Request, { params }: Props) {
  const { id } = await params
  const payload = await request.json().catch(() => ({}))
  const requestId = request.headers.get('x-vercel-id') ?? request.headers.get('x-ms-correlation-id') ?? null
  logIntegration('received', {
    solicitacao_id: id,
    method: request.method,
    request_id: requestId,
    auth: tokenSource(request),
    payload: payloadSummary(payload),
  })
  try {
    const result = await plannerConcluirSolicitacao(id, payload)
    logIntegration('success', {
      solicitacao_id: id,
      request_id: requestId,
      status: result.status,
      planner_status: result.planner_status,
      has_planner_task_id: Boolean(result.planner_task_id),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChecklistError) {
      logIntegration('rejected', {
        solicitacao_id: id,
        request_id: requestId,
        status: error.status,
        error: error.message,
        payload: payloadSummary(payload),
      }, 'warn')
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logIntegration('failed', { solicitacao_id: id, request_id: requestId, error }, 'error')
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

async function handleInternalFinalizar({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)
    const atual = await ensureSolicitacaoEditable(id, { id: usuario_id, nome: usuario_nome }, isAdmin)
    if (atual.tipo_solicitacao === 'SETOR' || atual.tipo_solicitacao === 'ESTOQUE') await gerarDiffSolicitacao(id)
    const now = new Date()
    const shouldAssignOnFinish = !atual.assumido_por && Boolean(usuario_id)
    if (shouldAssignOnFinish) await ensureChecklistTecnicoApto(usuario_id)
    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: {
        status: 'finalizada',
        finalizado_em: now,
        atualizado_em: now,
        ...(shouldAssignOnFinish ? { assumido_por: usuario_id, assumido_em: now } : {}),
      },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: shouldAssignOnFinish ? 'Solicitação atribuída automaticamente e finalizada' : 'Solicitação finalizada',
      dados_anteriores: atual,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })
    await notifyChecklistSolicitacaoStatus(id, 'solicitacao_finalizada')
    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/finalizar]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: Props) {
  if (isChecklistIntegrationAuthorized(request)) return handleExternalFinalizar(request, props)
  return handleInternalFinalizar(props)
}

export async function POST(request: Request, props: Props) {
  if (isChecklistIntegrationAuthorized(request)) return handleExternalFinalizar(request, props)
  return handleInternalFinalizar(props)
}
