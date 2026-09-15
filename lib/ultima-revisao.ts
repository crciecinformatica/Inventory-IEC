import { prisma } from '@/lib/prisma'
import { ChecklistError, delegate } from '@/lib/checklists-validacao'

export const TIPOS_DISPOSITIVO = ['MAQUINA', 'NOTEBOOK', 'APARELHO', 'IMPRESSORA', 'RAMAL', 'MONITOR', 'RACK'] as const
export type TipoDispositivo = (typeof TIPOS_DISPOSITIVO)[number]

const TABELAS: Record<TipoDispositivo, string> = {
  MAQUINA: 'maquinas',
  NOTEBOOK: 'notebooks',
  APARELHO: 'aparelhos',
  IMPRESSORA: 'impressoras',
  RAMAL: 'ramais',
  MONITOR: 'monitores',
  RACK: 'racks',
}

/** Datas de revisão lançadas manualmente antes do campo padrão existir. */
const DATA_MANUAL: Partial<Record<TipoDispositivo, string>> = {
  MAQUINA: 'data_revisao',
  NOTEBOOK: 'data_revisao',
  IMPRESSORA: 'revisao',
}

const CAMPOS_LABEL: Record<string, string> = {
  _item: 'Ativo',
  armazenamento: 'Armazenamento',
  endereco_ip: 'IP',
  endereco_mac: 'MAC',
  fabricante: 'Fabricante',
  localidade_id: 'Localidade',
  memoria: 'Memória',
  memoria_ram: 'Memória',
  modelo: 'Modelo',
  nome_host: 'Host',
  numero_patrimonio: 'Patrimônio',
  numero_ramal: 'Ramal',
  patrimonio: 'Patrimônio',
  patrimonio_cpu: 'Patrimônio',
  processador: 'Processador',
  serial: 'Serial',
  setor_id: 'Setor',
}

function displayValue(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  return String(value)
}

function isTipoDispositivo(value: string): value is TipoDispositivo {
  return (TIPOS_DISPOSITIVO as readonly string[]).includes(value)
}

async function nomeUsuario(id: string | null | undefined) {
  if (!id) return null
  const usuario = await prisma.usuarios.findUnique({ where: { id }, select: { nome: true } })
  return usuario?.nome ?? null
}

export async function buscarUltimaRevisao(tipoInformado: string, id: string) {
  const tipo = tipoInformado.toUpperCase()
  if (!isTipoDispositivo(tipo)) throw new ChecklistError('Tipo de dispositivo inválido')

  const ativo = await delegate(TABELAS[tipo]).findUnique({ where: { id } })
  if (!ativo) throw new ChecklistError('Dispositivo não encontrado', 404)

  const campoManual = DATA_MANUAL[tipo]
  const dataChecklist = ativo.checklist_revisado_em ?? (tipo === 'RACK' ? ativo.checklist_validado_em : null)
  const dataManual = campoManual ? ativo[campoManual] : null
  const checklistId: string | null = ativo.checklist_ultima_id ?? null

  if (!dataChecklist && !checklistId) {
    return {
      tipo,
      id,
      revisado_em: dataManual ?? null,
      origem: dataManual ? 'manual' : null,
      checklist: null,
      solicitacao: null,
      tecnico_nome: null,
      revisor_nome: null,
      alteracoes: [],
    }
  }

  const [checklist, tecnicoNome, revisorNome] = await Promise.all([
    checklistId
      ? delegate('checklists_validacao').findUnique({
        where: { id: checklistId },
        select: { id: true, nome: true, localidade: { select: { nome: true } } },
      })
      : null,
    nomeUsuario(ativo.checklist_tecnico_id),
    nomeUsuario(ativo.checklist_revisor_id),
  ])

  let solicitacao: { id: string; tipo_solicitacao: string; setor_nome: string | null } | null = null
  let alteracoes: Array<{ campo: string; antes: string | null; depois: string | null; tipo: string }> = []

  if (checklistId && tipo === 'RACK') {
    const row = await delegate('checklists_validacao_solicitacoes').findFirst({
      where: { checklist_validacao_id: checklistId, rack_id: id },
      select: { id: true, tipo_solicitacao: true },
    })
    if (row) solicitacao = { ...row, setor_nome: null }
  } else if (checklistId) {
    const item = await delegate('checklists_validacao_itens').findFirst({
      where: { referencia_id: id, solicitacao: { checklist_validacao_id: checklistId } },
      orderBy: { atualizado_em: 'desc' },
      include: {
        solicitacao: { select: { id: true, tipo_solicitacao: true, setor: { select: { nome: true } } } },
        diffs: { where: { status_revisao: 'aprovado', tipo_diff: { not: 'sem_divergencia' } }, orderBy: { criado_em: 'asc' } },
      },
    })
    if (item?.solicitacao) {
      solicitacao = { id: item.solicitacao.id, tipo_solicitacao: item.solicitacao.tipo_solicitacao, setor_nome: item.solicitacao.setor?.nome ?? null }
      alteracoes = (item.diffs ?? []).map((diff: any) => ({
        campo: CAMPOS_LABEL[diff.campo] ?? diff.campo,
        antes: diff.campo === '_item' ? null : displayValue(diff.valor_atual),
        depois: diff.campo === '_item' ? (diff.tipo_diff === 'novo' ? 'Cadastrado pelo checklist' : diff.tipo_diff === 'ausente' ? 'Não encontrado na conferência' : null) : displayValue(diff.valor_informado),
        tipo: diff.tipo_diff,
      }))
    }
  }

  return {
    tipo,
    id,
    revisado_em: dataChecklist ?? dataManual ?? null,
    origem: 'checklist',
    checklist: checklist ? { id: checklist.id, nome: checklist.nome, localidade_nome: checklist.localidade?.nome ?? null } : null,
    solicitacao,
    tecnico_nome: tecnicoNome,
    revisor_nome: revisorNome,
    alteracoes,
  }
}
