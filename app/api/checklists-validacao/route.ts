import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, requireAdmin } from '@/lib/auth'
import { ChecklistError, createChecklist, delegate, publicAppOrigin } from '@/lib/checklists-validacao'
import { getAuditSession } from '@/lib/audit'
import { notifyChecklistCreation } from '@/lib/checklist/power-automate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function originFromRequest(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : null
  return publicAppOrigin(forwardedOrigin ?? new URL(request.url).origin)
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 20)))
    const status = searchParams.get('status') || ''
    const where = status ? { status } : {}
    const [data, total] = await Promise.all([
      delegate('checklists_validacao').findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { criado_em: 'desc' },
        include: {
          localidade: { select: { nome: true } },
          solicitacoes: { select: { status: true, status_revisao: true } },
          _count: { select: { solicitacoes: true } },
        },
      }),
      delegate('checklists_validacao').count({ where }),
    ])
    return NextResponse.json({
      data: data.map((item: any) => ({
        ...item,
        localidade_nome: item.localidade?.nome ?? null,
        total_solicitacoes: item._count?.solicitacoes ?? 0,
        finalizadas: item.solicitacoes.filter((s: any) => s.status === 'finalizada' || s.status === 'revisada').length,
        revisadas: item.solicitacoes.filter((s: any) => s.status === 'revisada').length,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[GET /api/checklists-validacao]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { usuario_id, usuario_nome } = await getAuditSession()
    const body = await request.json()
    const checklist = await createChecklist({
      nome: body?.nome,
      localidade_id: body?.localidade_id,
      incluir_racks: Boolean(body?.incluir_racks),
      setores: body?.setores,
      setor_ids: body?.setor_ids,
      impressora_ids: body?.impressora_ids,
      rack_ids: body?.rack_ids,
      estoque: body?.estoque,
      data_inicio: body?.data_inicio ?? null,
      origin: originFromRequest(request),
      user: { id: usuario_id, nome: usuario_nome },
    })
    await notifyChecklistCreation(checklist.id)
    return NextResponse.json(checklist, { status: 201 })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklists-validacao]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
