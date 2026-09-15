import { ChecklistError } from '@/lib/checklists-validacao'
import { prisma } from '@/lib/prisma'

export type ChecklistTecnicoApto = {
  id: string
  nome: string
  codigo_pessoa: string
  /** Código gerado para o perfil de desenvolvimento, que não tem pessoa real vinculada. */
  codigo_ficticio: boolean
}

/** Prefixo que identifica códigos de pessoa fictícios de desenvolvimento. */
export const CODIGO_PESSOA_FICTICIO_PREFIXO = 'DEV-'

function codigoFicticio(usuarioId: string) {
  return `${CODIGO_PESSOA_FICTICIO_PREFIXO}${usuarioId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

export async function getChecklistTecnicoApto(usuarioId?: string | null): Promise<ChecklistTecnicoApto | null> {
  if (!usuarioId) return null

  const usuario = await prisma.usuarios.findUnique({
    where: { id: usuarioId },
    select: { id: true, nome: true, codigo_pessoa: true, ativo: true, perfil: true },
  })
  if (!usuario?.ativo) return null

  const codigoPessoa = usuario.codigo_pessoa?.trim()
  if (codigoPessoa) {
    return {
      id: usuario.id,
      nome: usuario.nome,
      codigo_pessoa: codigoPessoa,
      codigo_ficticio: codigoPessoa.startsWith(CODIGO_PESSOA_FICTICIO_PREFIXO),
    }
  }

  // Perfil dev não tem pessoa real: recebe um código fictício para conseguir assumir solicitações.
  if (usuario.perfil === 'dev') {
    return { id: usuario.id, nome: usuario.nome, codigo_pessoa: codigoFicticio(usuario.id), codigo_ficticio: true }
  }

  return null
}

export async function ensureChecklistTecnicoApto(usuarioId?: string | null) {
  const tecnico = await getChecklistTecnicoApto(usuarioId)
  if (!tecnico) {
    throw new ChecklistError('Para assumir solicitações, o usuário precisa estar vinculado a um código de pessoa válido.', 403)
  }

  // Persiste o código fictício na primeira vez, para integrações que leem o técnico da solicitação.
  if (tecnico.codigo_ficticio) {
    await prisma.usuarios.updateMany({
      where: { id: tecnico.id, OR: [{ codigo_pessoa: null }, { codigo_pessoa: '' }] },
      data: { codigo_pessoa: tecnico.codigo_pessoa },
    })
  }

  return tecnico
}
