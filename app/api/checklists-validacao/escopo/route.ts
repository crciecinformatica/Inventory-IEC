import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { listarEscopoLocalidade } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const localidadeId = new URL(request.url).searchParams.get('localidade_id')
    if (!localidadeId) return NextResponse.json({ error: 'localidade_id é obrigatório' }, { status: 400 })
    const escopo = await listarEscopoLocalidade(localidadeId)
    return NextResponse.json(escopo, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[GET /api/checklists-validacao/escopo]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
