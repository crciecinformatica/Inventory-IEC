import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { getChecklistTecnicoApto } from '@/lib/checklist/tecnico'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import { calcularCoberturaSolicitacao, delegate, enrichSolicitacaoForReview, getSolicitacaoAssimilationAudit, itensDoEscopo, listarEstoquePrevisto, sanitizeSolicitacao } from '@/lib/checklists-validacao'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

function existingComentarios(value: unknown) {
  return Array.isArray(value) ? value : []
}

function buildComentario(texto: unknown, autor: { usuario_id: string | null; usuario_nome: string | null }, papel: 'tecnico' | 'revisor') {
  const conteudo = typeof texto === 'string' ? texto.trim() : ''
  if (!conteudo) return null
  return {
    id: randomUUID(),
    autor_id: autor.usuario_id,
    autor_nome: autor.usuario_nome ?? 'Usuário',
    papel,
    conteudo,
    created_at: new Date().toISOString(),
  }
}

async function getChecklistComentarios(id: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ comentarios: unknown }>>`
      SELECT comentarios FROM public.checklists_validacao_solicitacoes WHERE id = ${id}::uuid
    `
    return existingComentarios(rows[0]?.comentarios)
  } catch (error) {
    console.warn('[checklist comentarios] coluna indisponível', error)
    return []
  }
}

async function setChecklistComentarios(id: string, comentarios: unknown[]) {
  await prisma.$executeRaw`
    UPDATE public.checklists_validacao_solicitacoes
    SET comentarios = ${JSON.stringify(comentarios)}::jsonb,
        atualizado_em = now()
    WHERE id = ${id}::uuid
  `
}

export async function GET(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { id } = await params
    const reviewMode = new URL(request.url).searchParams.get('review') === '1'
    const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({
      where: { id },
      include: {
        checklist: { include: { localidade: { select: { id: true, nome: true } } } },
        setor: { select: { id: true, nome: true } },
        rack: {
          select: {
            id: true,
            nome_switch: true,
            localizacao: true,
            quantidade_portas: true,
            portas_em_uso: true,
            portas_academicas: true,
            portas_vlan_impressoras: true,
            localidade_id: true,
            localidade_rel: { select: { id: true, nome: true } },
          },
        },
        tecnico: { select: { id: true, nome: true, email: true } },
        revisor: { select: { id: true, nome: true } },
        itens: { orderBy: { criado_em: 'desc' }, include: { diffs: { orderBy: { criado_em: 'asc' } } } },
        rack_resposta: true,
        _count: { select: { itens: true, diffs: true } },
      },
    })
    if (!solicitacao) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
    const [cobertura, assimilacaoAudit, comentarios, impressorasEscopo, estoquePrevisto] = await Promise.all([
      calcularCoberturaSolicitacao(solicitacao),
      getSolicitacaoAssimilationAudit(id),
      getChecklistComentarios(id),
      solicitacao.restringir_impressoras && solicitacao.impressora_ids?.length
        ? prisma.impressoras.findMany({
          where: { id: { in: solicitacao.impressora_ids } },
          select: { id: true, nome_host: true, endereco_ip: true, modelo: true },
          orderBy: { nome_host: 'asc' },
        })
        : Promise.resolve([]),
      solicitacao.tipo_solicitacao === 'ESTOQUE' && solicitacao.checklist?.localidade_id
        ? listarEstoquePrevisto(solicitacao.checklist.localidade_id, itensDoEscopo(solicitacao))
        : Promise.resolve(null),
    ])
    const user = session.user as { id?: string | null; perfil?: string | null }
    const isAdmin = isPrivilegedProfile(user.perfil)
    const tecnicoApto = await getChecklistTecnicoApto(user.id)
    const assimilada = Boolean(assimilacaoAudit)
    const pode_editar = ['aberta', 'assumida'].includes(solicitacao.status)
      && (isAdmin || (!!solicitacao.assumido_por && solicitacao.assumido_por === user.id))
    const assumida_pelo_usuario = !!solicitacao.assumido_por && solicitacao.assumido_por === user.id
    const assumida_por_outro = !!solicitacao.assumido_por && solicitacao.assumido_por !== user.id
    const pode_assumir = Boolean(tecnicoApto) && !solicitacao.assumido_por && solicitacao.status === 'aberta'
    const pode_finalizar = ['aberta', 'assumida'].includes(solicitacao.status) && (isAdmin || assumida_pelo_usuario || (!solicitacao.assumido_por && Boolean(tecnicoApto)))
    const pode_reabrir = !assimilada && ['finalizada', 'revisada'].includes(solicitacao.status) && (isAdmin || assumida_pelo_usuario)
    const payload = {
      ...solicitacao,
      comentarios,
      impressoras_escopo: impressorasEscopo,
      estoque_previsto: estoquePrevisto,
      assimilada,
      assimilado_por_nome: assimilacaoAudit?.usuario_nome ?? null,
      assimilado_em: assimilacaoAudit?.created_at ?? null,
      assumida_pelo_usuario,
      assumida_por_outro,
      cobertura,
      pode_assumir,
      bloqueio_assumir: !tecnicoApto ? 'Usuário sem código de pessoa válido para assumir checklist.' : null,
      pode_editar,
      pode_finalizar,
      pode_reabrir,
    }
    const result = reviewMode ? await enrichSolicitacaoForReview(payload) : payload
    return NextResponse.json(sanitizeSolicitacao(result))
  } catch (error) {
    console.error('[GET /api/checklists-validacao-solicitacoes/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const decisao = String(body?.decisao ?? body?.acao ?? '').toLowerCase()
    if (decisao !== 'comentar' && decisao !== 'comentario') {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
    if (!solicitacao) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

    const sessionUser = session.user as { id?: string | null; perfil?: string | null }
    const isAdmin = isPrivilegedProfile(sessionUser.perfil)
    const canComment = isAdmin || (!!solicitacao.assumido_por && solicitacao.assumido_por === sessionUser.id)
    if (!canComment) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const auditUser = await getAuditSession()
    const comentario = buildComentario(body?.comentario, auditUser, isAdmin ? 'revisor' : 'tecnico')
    if (!comentario) return NextResponse.json({ error: 'Comentário vazio' }, { status: 400 })

    const comentariosAtuais = await getChecklistComentarios(id)
    const comentarios = [...comentariosAtuais, comentario]
    await setChecklistComentarios(id, comentarios)
    const atualizada = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })

    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: 'Comentário adicionado à solicitação de checklist',
      dados_anteriores: { comentarios: comentarios.slice(0, -1) },
      dados_novos: { comentario },
      usuario_id: auditUser.usuario_id,
      usuario_nome: auditUser.usuario_nome,
    })

    return NextResponse.json(sanitizeSolicitacao({ ...atualizada, comentarios }))
  } catch (error) {
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
