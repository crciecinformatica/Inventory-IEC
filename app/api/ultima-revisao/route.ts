import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ChecklistError } from '@/lib/checklists-validacao'
import { buscarUltimaRevisao } from '@/lib/ultima-revisao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') ?? ''
    const id = searchParams.get('id') ?? ''
    if (!tipo || !id) return NextResponse.json({ error: 'tipo e id são obrigatórios' }, { status: 400 })
    const data = await buscarUltimaRevisao(tipo, id)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[GET /api/ultima-revisao]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
