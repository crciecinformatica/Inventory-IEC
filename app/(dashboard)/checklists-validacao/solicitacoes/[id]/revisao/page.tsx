'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  Boxes,
  GitCompareArrows,
  Laptop,
  ListChecks,
  Loader2,
  MessageSquare,
  Monitor,
  Phone,
  Printer,
  Send,
  Server,
  Smartphone,
  type LucideIcon,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ChecklistNavPills } from '@/components/checklists/checklist-nav-pills'
import { ChecklistContextOverview, type ChecklistContextMetric } from '@/components/checklists/checklist-context-overview'

type Diff = {
  id: string
  campo: string
  valor_atual: unknown
  valor_atual_label?: string | null
  valor_informado: unknown
  valor_informado_label?: string | null
  tipo_diff: string
  status_revisao: string
}

type ReviewSnapshotEntry = {
  label: string
  value: string
}

type Item = {
  id: string
  tipo_item: string
  identificador_informado: string | null
  dados_informados_json: Record<string, unknown>
  referencia_snapshot?: ReviewSnapshotEntry[]
  dados_informados_snapshot?: ReviewSnapshotEntry[]
  incidencia_primaria_snapshot?: ReviewSnapshotEntry[]
  incidencia_primaria_titulo?: string | null
  novo_primario?: boolean
  status_revisao: string
  diffs: Diff[]
}

type Solicitacao = {
  id: string
  checklist_validacao_id: string
  tipo_solicitacao: 'SETOR' | 'RACK' | 'ESTOQUE'
  titulo?: string
  status: string
  status_revisao: string
  setor_nome: string | null
  rack_nome: string | null
  revisor_nome?: string | null
  assimilada?: boolean
  assimilado_por_nome?: string | null
  assimilado_em?: string | null
  itens: Item[]
  comentarios?: ChecklistComentario[] | null
  rack_resposta: { dados_informados_json?: Record<string, unknown> } | null
  checklist: { nome: string; localidade?: { nome: string } }
}
type ChecklistComentario = { id?: string; autor_id?: string | null; autor_nome?: string | null; papel?: string | null; conteudo: string; created_at?: string | null }

type DiffWithItem = Diff & { item: Item }

const itemMeta: Record<string, { label: string; icon: LucideIcon; tone: string; softTone: string }> = {
  MAQUINA: {
    label: 'Máquina',
    icon: Monitor,
    tone: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
    softTone: 'border-blue-500/30 bg-blue-500/5',
  },
  RAMAL: {
    label: 'Ramal',
    icon: Phone,
    tone: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
    softTone: 'border-cyan-500/30 bg-cyan-500/5',
  },
  MONITOR: {
    label: 'Monitor',
    icon: Monitor,
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
    softTone: 'border-violet-500/30 bg-violet-500/5',
  },
  IMPRESSORA: {
    label: 'Impressora',
    icon: Printer,
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    softTone: 'border-emerald-500/30 bg-emerald-500/5',
  },
  NOTEBOOK: {
    label: 'Notebook',
    icon: Laptop,
    tone: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    softTone: 'border-sky-500/30 bg-sky-500/5',
  },
  APARELHO: {
    label: 'Aparelho',
    icon: Smartphone,
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    softTone: 'border-amber-500/30 bg-amber-500/5',
  },
}

const estoqueGroupLabels: Record<string, string> = {
  NOTEBOOK: 'Notebooks em estoque',
  APARELHO: 'Aparelhos em estoque',
}

const fieldLabels: Record<string, string> = {
  _item: 'Ativo',
  alocacao_atual: 'Alocação',
  armazenamento: 'Armazenamento',
  capacidade: 'Capacidade',
  colaboradores_estacao: 'Colaboradores',
  endereco_ip: 'IP',
  encontrado: 'Encontrado',
  endereco_mac: 'MAC',
  estacao_ref: 'Estação',
  fabricante: 'Fabricante',
  hostname: 'Host',
  ip: 'IP',
  local_fisico: 'Local físico',
  localidade_id: 'Localidade',
  maquina_hostname: 'Host da estação',
  maquina_id: 'Máquina vinculada',
  maquina_patrimonio: 'Patrimônio da estação',
  marca: 'Marca',
  memoria: 'Memória',
  memoria_ram: 'Memória',
  modelo: 'Modelo',
  nome: 'Nome',
  nome_rede: 'Nome/Rede',
  numero: 'Número',
  numero_patrimonio: 'Patrimônio',
  numero_ramal: 'Ramal',
  observacoes: 'Observações',
  patrimonio: 'Patrimônio',
  patrimonio_cpu: 'Patrimônio',
  processador: 'Processador',
  ramal_estacao: 'Ramal da estação',
  setor_id: 'Setor',
  serial: 'Serial',
  status: 'Status',
  status_observado: 'Status',
  tamanho: 'Tamanho',
}

const hiddenObjectKeys = new Set([
  'id',
  'codigo_interno',
  'colaboradores_estacao_ids',
  'checklist_validacao_item_id',
  'checklist_validacao_solicitacao_id',
  'criado_em',
  'criado_por',
  'preenchido_em',
  'preenchido_por',
  'referencia_id',
  'revisado_em',
  'revisado_por',
  'serial',
  'atualizado_em',
])

function statusBadge(status: string) {
  if (status === 'revisada' || status === 'aprovado') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  if (status === 'finalizada' || status === 'parcial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  if (status === 'recusado') return 'border-red-500/40 bg-red-500/10 text-red-200'
  return 'border-slate-700 bg-slate-800/80 text-slate-300'
}

function fieldLabel(field: string) {
  return fieldLabels[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isHiddenKey(key: string) {
  const normalized = key.toLowerCase()
  return hiddenObjectKeys.has(normalized) || normalized.endsWith('_id') || normalized.endsWith('_ids')
}

type FormattedObjectEntry = {
  key: string
  label: string
  value: string
}

function formatValue(value: unknown, field?: string): string {
  const parsed = parseMaybeJson(value)
  if (parsed == null || parsed === '') return 'Não informado'
  if (typeof parsed === 'boolean') return parsed ? 'Sim' : 'Não'
  if (Array.isArray(parsed)) return parsed.length ? parsed.map(item => formatValue(item)).join(', ') : 'Não informado'
  if (isRecord(parsed)) {
    const values = objectEntries(parsed)
    return values.length ? values.map(entry => `${entry.label}: ${entry.value}`).join(' · ') : 'Dados informados'
  }
  const text = String(parsed)
  if (isUuid(text) || (field && isHiddenKey(field))) return 'Referência vinculada'
  return text
}

function objectEntries(value: unknown): FormattedObjectEntry[] {
  const parsed = parseMaybeJson(value)
  if (!isRecord(parsed)) return []

  return Object.entries(parsed)
    .filter(([key, entryValue]) => !isHiddenKey(key) && entryValue !== undefined && entryValue !== null && entryValue !== '')
    .map(([key, entryValue]) => ({
      key,
      label: fieldLabel(key),
      value: formatValue(entryValue, key),
    }))
}

function itemTitle(item: Item) {
  const dados = item.dados_informados_json ?? {}
  const candidates = [
    item.identificador_informado,
    dados.hostname,
    dados.nome_host,
    dados.patrimonio,
    dados.nome_rede,
    dados.numero_ramal,
    dados.ramal_estacao,
    dados.ip,
  ]

  return candidates.map(value => formatValue(value)).find(value => value && value !== 'Não informado') ?? itemMeta[item.tipo_item]?.label ?? 'Ativo'
}

function stationLabel(item: Item) {
  const dados = item.dados_informados_json ?? {}
  const candidates = [dados.estacao_ref, dados.maquina_hostname, dados.hostname, dados.nome_host]
  const value = candidates.map(candidate => formatValue(candidate)).find(candidate => candidate && candidate !== 'Não informado')
  return value ?? null
}

function diffTitle(diff: DiffWithItem) {
  const assetLabel = itemMeta[diff.item.tipo_item]?.label ?? diff.item.tipo_item
  if (diff.campo === '_item' && diff.tipo_diff === 'novo') return `${assetLabel} novo`
  if (diff.campo === '_item' && diff.tipo_diff === 'ausente') return `${assetLabel} ausente`
  if (diff.campo === '_item' && diff.tipo_diff === 'sem_divergencia') return `${assetLabel} localizado`
  return fieldLabel(diff.campo)
}

function beforeFallback(diff: DiffWithItem) {
  if (diff.tipo_diff === 'novo') return 'Sem correspondência primária'
  if (diff.tipo_diff === 'sem_divergencia') return 'Ativo já cadastrado'
  return 'Não informado'
}

function afterFallback(diff: DiffWithItem) {
  if (diff.tipo_diff === 'ausente') return diff.item.dados_informados_json?.encontrado === false ? 'Não encontrado pelo técnico' : 'Não informado no checklist'
  if (diff.tipo_diff === 'sem_divergencia') return 'Confirmado pelo checklist'
  return 'Não informado'
}

function progressPercent(done: number, total: number) {
  if (total > 0) return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  return done > 0 ? 100 : 0
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function itemNeedsDecision(item: Item) {
  if (item.diffs.some(diff => diff.status_revisao === 'pendente')) return true
  return item.status_revisao === 'pendente' || item.status_revisao === 'parcial'
}

function groupKeyForItem(item: Item, estoque = false) {
  if (estoque) return `estoque:${item.tipo_item}`
  if (item.tipo_item === 'IMPRESSORA') return 'impressoras'
  return stationLabel(item) ? `estacao:${stationLabel(item)}` : `isolado:${item.id}`
}

function groupLabelForItem(item: Item, estoque = false) {
  if (estoque) return estoqueGroupLabels[item.tipo_item] ?? 'Dispositivos em estoque'
  if (item.tipo_item === 'IMPRESSORA') return 'Impressoras independentes'
  return stationLabel(item) ? `Estação ${stationLabel(item)}` : `Estação ${itemTitle(item)}`
}

function itemDataText(item: Item, keys: string[], fallback = '-') {
  const data = item.dados_informados_json ?? {}
  for (const key of keys) {
    const formatted = formatValue(data[key], key)
    if (formatted && formatted !== 'Não informado' && formatted !== 'Referência vinculada') return formatted
  }
  return fallback
}

function itemStatusLabel(item: Item, assimilated?: boolean) {
  if (assimilated && item.status_revisao === 'aprovado') return 'assimilado'
  if (assimilated && item.status_revisao === 'recusado') return 'recusado'
  if (item.status_revisao === 'aprovado') return 'aprovado'
  if (item.status_revisao === 'recusado') return 'recusado'
  if (item.status_revisao === 'parcial') return 'parcial'
  return itemNeedsDecision(item) ? 'pendente' : item.status_revisao
}

function itemStatusTone(status: string) {
  if (status === 'assimilado' || status === 'aprovado') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  if (status === 'recusado') return 'border-red-500/40 bg-red-500/10 text-red-200'
  if (status === 'parcial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  return 'border-slate-700 bg-slate-800/80 text-slate-300'
}

function stationPrimaryItem(items: Item[]) {
  return items.find(item => item.tipo_item === 'MAQUINA')
    ?? items.find(item => item.tipo_item !== 'IMPRESSORA')
    ?? items[0]
}

function stationGroupStatus(items: Item[], assimilated?: boolean) {
  if (assimilated && items.some(item => item.status_revisao === 'aprovado')) return 'assimilado'
  if (items.length > 0 && items.every(item => item.status_revisao === 'aprovado')) return 'aprovado'
  if (items.length > 0 && items.every(item => item.status_revisao === 'recusado')) return 'recusado'
  if (items.some(item => item.status_revisao === 'aprovado' || item.status_revisao === 'recusado' || item.status_revisao === 'parcial')) return 'parcial'
  return 'pendente'
}

function stationCounts(items: Item[]) {
  return {
    maquinas: items.filter(item => item.tipo_item === 'MAQUINA').length,
    ramais: items.filter(item => item.tipo_item === 'RAMAL').length,
    monitores: items.filter(item => item.tipo_item === 'MONITOR').length,
    impressoras: items.filter(item => item.tipo_item === 'IMPRESSORA').length,
  }
}

function ValuePanel({
  title,
  value,
  fallback,
  field,
  accent = 'slate',
}: {
  title: string
  value: unknown
  fallback: string
  field?: string
  accent?: 'slate' | 'blue' | 'emerald'
}) {
  const entries = objectEntries(value)
  const empty = value == null || value === ''
  const accentClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
    : accent === 'blue'
      ? 'border-blue-500/20 bg-blue-500/[0.06]'
      : 'border-slate-800 bg-slate-950/70'

  return (
    <div className={`min-h-28 rounded-xl border p-3 ${accentClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {entries.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {entries.map(entry => (
            <div key={entry.key} className="rounded-xl bg-slate-950/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{entry.label}</p>
              <p className="mt-0.5 break-words text-xs font-semibold text-slate-100">{entry.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={`mt-3 break-words text-sm font-semibold ${empty ? 'text-slate-500' : 'text-slate-100'}`}>
          {empty ? fallback : formatValue(value, field)}
        </p>
      )}
    </div>
  )
}

function SnapshotPanel({
  decisions,
  emptyText,
  entries,
  title,
  tone = 'slate',
}: {
  decisions?: Map<string, { id: string; status: string }>
  emptyText: string
  entries?: ReviewSnapshotEntry[]
  title: string
  tone?: 'blue' | 'slate'
}) {
  const borderClass = tone === 'blue' ? 'border-blue-500/25 bg-blue-500/[0.06]' : 'border-slate-800 bg-slate-950/60'

  return (
    <div className={`rounded-xl border p-3 ${borderClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      {entries?.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {entries.map(entry => {
            const decision = decisions?.get(entry.label)
            const decided = decision?.status === 'aprovado' || decision?.status === 'recusado'
            const decisionClass = decision?.status === 'aprovado'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : decision?.status === 'recusado'
                ? 'border-red-500/35 bg-red-500/10 text-red-200'
                : 'border-slate-800 bg-slate-900 text-slate-500'

            return (
            <div key={`${title}-${entry.label}`} className={`rounded-xl border bg-slate-950/70 px-3 py-2 transition ${decided ? decisionClass : 'border-transparent'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{entry.label}</p>
                {decision && (
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${decisionClass}`}
                    title={decision.status}
                    aria-label={`${entry.label}: ${decision.status}`}
                  >
                    {decision.status === 'aprovado' ? <Check className="h-3 w-3" /> : decision.status === 'recusado' ? <X className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                )}
              </div>
              <p className="mt-0.5 break-words text-xs font-semibold text-slate-100">{entry.value}</p>
            </div>
          )})}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500">{emptyText}</p>
      )}
    </div>
  )
}

function ItemInspectionPanel({ item }: { item: Item }) {
  const currentEntries = item.referencia_snapshot?.length
    ? item.referencia_snapshot
    : item.incidencia_primaria_snapshot
  const currentTitle = item.referencia_snapshot?.length
    ? 'Inventário atual'
    : item.incidencia_primaria_snapshot?.length
      ? 'Incidência primária'
      : 'Inventário atual'
  const proposedDecisions = new Map(
    item.diffs.map(diff => [fieldLabel(diff.campo), { id: diff.id, status: diff.status_revisao }]),
  )

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Inspeção do preenchimento</p>
          <h4 className="mt-1 text-sm font-bold text-white">Antes e proposta do checklist</h4>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-400">
          {item.diffs.length} campos na decisão
        </span>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
        <SnapshotPanel
          title={currentTitle}
          entries={currentEntries}
          emptyText="Sem correspondência primária."
        />
        <div className="hidden items-center justify-center xl:flex">
          <span className="rounded-full border border-slate-800 bg-slate-950 p-2 text-slate-500">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
        <SnapshotPanel
          title="Checklist propôs"
          entries={item.dados_informados_snapshot}
          emptyText="Sem dados estruturados no preenchimento."
          decisions={proposedDecisions}
          tone="blue"
        />
      </div>
    </div>
  )
}

function ActionButton({
  active,
  children,
  disabled,
  loading,
  onClick,
  tone,
}: {
  active: boolean
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  tone: 'approve' | 'refuse'
}) {
  const activeClass = tone === 'approve'
    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
    : 'border-red-400 bg-red-500/15 text-red-100'
  const idleClass = tone === 'approve'
    ? 'border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10'
    : 'border-red-500/30 text-red-200 hover:bg-red-500/10'

  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? activeClass : idleClass}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

function CompactDecisionButton({
  active,
  disabled,
  label,
  loading,
  onClick,
  tone,
}: {
  active: boolean
  disabled?: boolean
  label: string
  loading?: boolean
  onClick: () => void
  tone: 'approve' | 'refuse'
}) {
  const activeClass = tone === 'approve'
    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
    : 'border-red-400 bg-red-500/20 text-red-100'
  const idleClass = tone === 'approve'
    ? 'border-emerald-500/25 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10'
    : 'border-red-500/25 text-red-300 hover:border-red-400 hover:bg-red-500/10'
  const Icon = tone === 'approve' ? Check : X

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? activeClass : idleClass}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  )
}

function ChecklistCommentsPanel({
  comments,
  draft,
  loading,
  onChange,
  onSend,
}: {
  comments: ChecklistComentario[]
  draft: string
  loading?: boolean
  onChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <MessageSquare className="h-4 w-4 text-blue-400" />
            Comentários
          </h2>
          <p className="mt-1 text-sm text-slate-400">Conversa entre técnico e validação.</p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-400">{comments.length}</span>
      </div>
      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">Nenhum comentário ainda.</p>
        )}
        {comments.map((comment, index) => {
          const reviewer = comment.papel === 'revisor'
          return (
            <div key={comment.id ?? index} className={`rounded-2xl border p-3 ${reviewer ? 'border-blue-500/25 bg-blue-500/10' : 'border-slate-800 bg-slate-950/60'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-slate-100">{comment.autor_nome ?? 'Usuário'}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{reviewer ? 'Revisor' : 'Técnico'}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{comment.conteudo}</p>
              {comment.created_at && <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(comment.created_at)}</p>}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={event => onChange(event.target.value)}
          placeholder="Adicionar comentário..."
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || loading}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Enviar comentário"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </section>
  )
}

function DiffDecisionCard({
  canReview,
  diff,
  operation,
  onReview,
}: {
  canReview: boolean
  diff: DiffWithItem
  operation?: string | null
  onReview: (id: string, status: 'aprovado' | 'recusado') => void
}) {
  const approving = operation === `diff-${diff.id}-aprovado`
  const refusing = operation === `diff-${diff.id}-recusado`
  const reviewed = diff.status_revisao === 'aprovado' || diff.status_revisao === 'recusado'
  const reviewTone = diff.status_revisao === 'aprovado'
    ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
    : diff.status_revisao === 'recusado'
      ? 'border-red-500/35 bg-red-500/[0.06]'
      : 'border-slate-800 bg-slate-950/40'

  return (
    <div className={`rounded-xl border p-3 transition ${reviewTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{diff.tipo_diff.replace(/_/g, ' ')}</p>
          <h4 className="mt-1 text-sm font-bold text-white">{diffTitle(diff)}</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(diff.status_revisao)}`}>
            {diff.status_revisao === 'aprovado' && <Check className="h-3 w-3" />}
            {diff.status_revisao === 'recusado' && <X className="h-3 w-3" />}
            {diff.status_revisao}
          </span>
          {!reviewed && (
            <span className="hidden rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-200 sm:inline-flex">
              decidir
            </span>
          )}
          <div className="flex items-center gap-1">
            <CompactDecisionButton
              active={diff.status_revisao === 'aprovado'}
              disabled={!canReview}
              label={`Aprovar ${diffTitle(diff)}`}
              loading={approving}
              tone="approve"
              onClick={() => onReview(diff.id, 'aprovado')}
            />
            <CompactDecisionButton
              active={diff.status_revisao === 'recusado'}
              disabled={!canReview}
              label={`Recusar ${diffTitle(diff)}`}
              loading={refusing}
              tone="refuse"
              onClick={() => onReview(diff.id, 'recusado')}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
        <ValuePanel title="Inventário atual" value={diff.valor_atual_label ?? diff.valor_atual} fallback={beforeFallback(diff)} field={diff.campo} accent="slate" />
        <div className="hidden items-center justify-center xl:flex">
          <span className="rounded-full border border-slate-800 bg-slate-950 p-2 text-slate-500">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
        <ValuePanel title="Checklist informou" value={diff.valor_informado_label ?? diff.valor_informado} fallback={afterFallback(diff)} field={diff.campo} accent="blue" />
      </div>
    </div>
  )
}

function ItemReviewCard({
  assimilated,
  canReview,
  inspectionDefaultOpen = false,
  item,
  operation,
  onItemReview,
  onReview,
}: {
  assimilated?: boolean
  canReview: boolean
  inspectionDefaultOpen?: boolean
  item: Item
  operation?: string | null
  onItemReview: (id: string, status: 'aprovado' | 'recusado') => void
  onReview: (id: string, status: 'aprovado' | 'recusado') => void
}) {
  const meta = itemMeta[item.tipo_item] ?? itemMeta.MAQUINA
  const Icon = meta.icon
  const station = stationLabel(item)
  const pending = item.diffs.filter(diff => diff.status_revisao === 'pendente').length
  const [inspecting, setInspecting] = useState(inspectionDefaultOpen)
  const visualStatus = itemStatusLabel(item, assimilated)
  const isApproved = visualStatus === 'aprovado' || visualStatus === 'assimilado'
  const isRefused = visualStatus === 'recusado'
  const approving = operation === `item-${item.id}-aprovado`
  const refusing = operation === `item-${item.id}-recusado`

  useEffect(() => {
    setInspecting(inspectionDefaultOpen)
  }, [inspectionDefaultOpen, item.id])

  return (
    <article className={`rounded-2xl border bg-slate-900/70 p-3 transition sm:p-4 ${isApproved ? 'border-emerald-500/45 bg-emerald-500/[0.06]' : isRefused ? 'border-red-500/35 bg-red-500/[0.05]' : meta.softTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`rounded-xl border p-2.5 ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{meta.label}</p>
            <h3 className="mt-1 truncate text-lg font-bold text-white">{itemTitle(item)}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-400">
              {station && <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1">Estação {station}</span>}
              <span className={`rounded-full border px-3 py-1 ${itemStatusTone(visualStatus)}`}>{visualStatus}</span>
              <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1">{item.diffs.length} diffs</span>
              {pending > 0 && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200">{pending} pendentes</span>}
              {item.novo_primario && !assimilated && (
                <span className="rounded-full border border-blue-500/35 bg-blue-500/10 px-3 py-1 text-blue-200">
                  Novo sem incidência
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setInspecting(value => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-blue-500 hover:text-white"
          >
            <GitCompareArrows className="h-4 w-4" />
            {inspecting ? 'Ocultar inspeção' : 'Inspecionar'}
          </button>
          <ActionButton active={isApproved} disabled={!canReview} loading={approving} tone="approve" onClick={() => onItemReview(item.id, 'aprovado')}>
            {isApproved ? <CheckCircle2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {isApproved ? (assimilated ? 'Assimilado' : 'Aprovado') : 'Aprovar ativo'}
          </ActionButton>
          <ActionButton active={isRefused} disabled={!canReview} loading={refusing} tone="refuse" onClick={() => onItemReview(item.id, 'recusado')}>
            <X className="h-4 w-4" />
            {isRefused ? 'Recusado' : 'Recusar ativo'}
          </ActionButton>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {inspecting && <ItemInspectionPanel item={item} />}
        {item.diffs.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm font-semibold text-slate-400">
            Sem campos divergentes gerados. A decisão acontece no ativo completo.
          </div>
        )}
        {item.diffs.map(diff => (
          <DiffDecisionCard
            key={diff.id}
            canReview={canReview}
            diff={{ ...diff, item }}
            operation={operation}
            onReview={onReview}
          />
        ))}
      </div>
    </article>
  )
}

function StationReviewCard({
  assimilated,
  canReview,
  group,
  open,
  operation,
  onClose,
  onItemReview,
  onOpen,
  onReview,
}: {
  assimilated?: boolean
  canReview: boolean
  group: { key: string; label: string; items: Item[] }
  open: boolean
  operation?: string | null
  onClose: () => void
  onItemReview: (id: string, status: 'aprovado' | 'recusado') => void
  onOpen: () => void
  onReview: (id: string, status: 'aprovado' | 'recusado') => void
}) {
  const primary = stationPrimaryItem(group.items)
  const counts = stationCounts(group.items)
  const status = stationGroupStatus(group.items, assimilated)
  const decided = group.items.filter(item => item.status_revisao === 'aprovado' || item.status_revisao === 'recusado').length
  const pending = group.items.length - decided
  const approvedCount = group.items.filter(item => item.status_revisao === 'aprovado').length
  const refusedCount = group.items.filter(item => item.status_revisao === 'recusado').length
  const ramalItem = group.items.find(item => item.tipo_item === 'RAMAL')
  const monitorCount = counts.monitores
  const isPrinterGroup = group.key === 'impressoras'
  const isStockGroup = group.key.startsWith('estoque:')
  const stockType = isStockGroup ? group.key.slice('estoque:'.length) : null
  const GroupIcon = isStockGroup ? (itemMeta[stockType ?? '']?.icon ?? Boxes) : isPrinterGroup ? Printer : Monitor
  const missingCount = group.items.filter(item => item.dados_informados_json?.encontrado === false).length

  const summary = isStockGroup
    ? [
      { label: 'Conferidos', value: String(group.items.length - missingCount) },
      { label: 'Não encontrados', value: String(missingCount) },
      { label: 'Pendentes', value: String(Math.max(0, pending)) },
      ...(approvedCount > 0 ? [{ label: 'Aprovados', value: String(approvedCount) }] : []),
    ]
    : isPrinterGroup
    ? [
      { label: 'Impressoras', value: String(counts.impressoras) },
      { label: 'Pendentes', value: String(Math.max(0, pending)) },
      ...(approvedCount > 0 ? [{ label: 'Aprovadas', value: String(approvedCount) }] : []),
      ...(refusedCount > 0 ? [{ label: 'Recusadas', value: String(refusedCount) }] : []),
    ]
    : [
      { label: 'Patrimônio', value: primary ? itemDataText(primary, ['patrimonio', 'maquina_patrimonio']) : '-' },
      { label: 'IP', value: primary ? itemDataText(primary, ['ip', 'endereco_ip']) : '-' },
      { label: 'Modelo', value: primary ? itemDataText(primary, ['modelo']) : '-' },
      { label: 'Memória', value: primary ? itemDataText(primary, ['memoria', 'memoria_ram']) : '-' },
      { label: 'Armazenamento', value: primary ? itemDataText(primary, ['armazenamento']) : '-' },
      { label: 'Colaboradores', value: primary ? itemDataText(primary, ['colaboradores_estacao']) : '-' },
    ]

  return (
    <>
      <motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-3xl border bg-slate-950/30 p-5 transition ${status === 'assimilado'
        ? 'border-emerald-500/35'
        : status === 'recusado'
          ? 'border-red-500/30'
          : status === 'parcial'
            ? 'border-amber-500/30'
            : 'border-slate-800'
      }`}
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-blue-200">
                <GroupIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">{isStockGroup ? 'Revisão de estoque' : isPrinterGroup ? 'Grupo independente' : 'Estação de trabalho'}</p>
                <h3 className="mt-1 truncate text-2xl font-black text-white">{group.label.replace(/^Estação\s/, '')}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className={`rounded-full border px-3 py-1 ${itemStatusTone(status)}`}>{status}</span>
                  {approvedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      {approvedCount} aprovado{approvedCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-slate-300">{group.items.length} ativo{group.items.length !== 1 ? 's' : ''}</span>
                  {pending > 0 && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200">{pending} pendente{pending !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-blue-500 hover:text-white"
            >
              <Eye className="h-4 w-4" />
              {isStockGroup || isPrinterGroup ? 'Inspecionar grupo' : 'Inspecionar estação'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summary.map(entry => (
              <div key={entry.label} className="rounded-2xl bg-slate-900/80 px-4 py-3">
                <p className="text-sm font-semibold text-slate-400">{entry.label}</p>
                <p className="mt-1 line-clamp-2 text-base font-bold text-slate-100">{entry.value || '-'}</p>
              </div>
            ))}
          </div>
        </div>

        {isStockGroup ? (
        <aside className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-slate-400">
            <Boxes className="h-4 w-4" />
            Dispositivos
          </p>
          <ul className="mt-4 max-h-44 space-y-2 overflow-y-auto">
            {group.items.map(item => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/70 px-3 py-2 text-sm">
                <span className="truncate font-semibold text-slate-200">{itemTitle(item)}</span>
                <span className={`shrink-0 text-[11px] font-bold ${item.dados_informados_json?.encontrado === false ? 'text-red-300' : 'text-emerald-300'}`}>
                  {item.dados_informados_json?.encontrado === false ? 'ausente' : 'ok'}
                </span>
              </li>
            ))}
          </ul>
        </aside>
        ) : (
        <aside className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-slate-400">
            <Eye className="h-4 w-4" />
            Vínculos
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-950/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Phone className="h-4 w-4 text-cyan-300" />Ramal</p>
              <p className="mt-1 text-lg font-black text-white">{ramalItem ? itemTitle(ramalItem) : 'Sem ramal'}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Monitor className="h-4 w-4 text-violet-300" />Monitores</p>
              <p className="mt-1 text-lg font-black text-white">{monitorCount}/3</p>
            </div>
            {isPrinterGroup && (
              <div className="rounded-2xl bg-slate-950/70 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Printer className="h-4 w-4 text-emerald-300" />Impressoras</p>
                <p className="mt-1 text-lg font-black text-white">{counts.impressoras}</p>
              </div>
            )}
          </div>
        </aside>
        )}
      </div>

      </motion.article>
      <StationInspectionModal
        assimilated={assimilated}
        canReview={canReview}
        group={group}
        open={open}
        operation={operation}
        onClose={onClose}
        onItemReview={onItemReview}
        onReview={onReview}
      />
    </>
  )
}

function StationInspectionModal({
  assimilated,
  canReview,
  group,
  onClose,
  open,
  operation,
  onItemReview,
  onReview,
}: {
  assimilated?: boolean
  canReview: boolean
  group: { key: string; label: string; items: Item[] }
  onClose: () => void
  open: boolean
  operation?: string | null
  onItemReview: (id: string, status: 'aprovado' | 'recusado') => void
  onReview: (id: string, status: 'aprovado' | 'recusado') => void
}) {
  const status = stationGroupStatus(group.items, assimilated)
  const approvedCount = group.items.filter(item => item.status_revisao === 'aprovado').length
  const refusedCount = group.items.filter(item => item.status_revisao === 'recusado').length
  const pendingCount = group.items.filter(item => itemNeedsDecision(item)).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm lg:items-center lg:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/60 lg:h-[86vh] lg:rounded-3xl"
          >
            <header className="shrink-0 border-b border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">{group.key.startsWith('estoque:') ? 'Inspeção do estoque' : group.key === 'impressoras' ? 'Inspeção do grupo' : 'Inspeção da estação'}</p>
                  <h2 className="mt-1 truncate text-2xl font-black text-white">{group.label}</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className={`rounded-full border px-3 py-1 ${itemStatusTone(status)}`}>{status}</span>
                    <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-slate-300">{group.items.length} ativos</span>
                    {approvedCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        {approvedCount} aprovados
                      </span>
                    )}
                    {refusedCount > 0 && <span className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-red-200">{refusedCount} recusados</span>}
                    {pendingCount > 0 && <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-amber-200">{pendingCount} pendentes</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-700 text-slate-300 transition hover:border-blue-500 hover:text-white"
                  aria-label="Fechar inspeção"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-4">
                {group.items.map(item => (
                  <ItemReviewCard
                    key={item.id}
                    assimilated={assimilated}
                    canReview={canReview}
                    inspectionDefaultOpen
                    item={item}
                    operation={operation}
                    onItemReview={onItemReview}
                    onReview={onReview}
                  />
                ))}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function ChecklistSolicitacaoRevisaoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<Solicitacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [operation, setOperation] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [inspectionGroupKey, setInspectionGroupKey] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSending, setCommentSending] = useState(false)

  const loadedIdRef = useRef<string | null>(null)
  const load = useCallback(async () => {
    // Recargas após cada decisão mantêm a tela montada, preservando rolagem e a inspeção aberta.
    const firstLoad = loadedIdRef.current !== params.id
    if (firstLoad) setLoading(true)
    const res = await fetch(`/api/checklists-validacao-solicitacoes/${params.id}?review=1`, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    loadedIdRef.current = params.id
    setLoading(false)
  }, [params.id])

  useEffect(() => { void load() }, [load])

  async function action(
    url: string,
    method = 'POST',
    body?: Record<string, unknown>,
    messages: { loading: string; success: string; key?: string } = {
      loading: 'Processando revisão...',
      success: 'Revisão atualizada.',
    },
  ) {
    setOperation(messages.key ?? 'operation')
    const toastId = toast.loading(messages.loading)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro na operação')
        return
      }
      toast.success(messages.success)
      await load()
    } finally {
      toast.dismiss(toastId)
      setOperation(null)
    }
  }

  async function sendComment() {
    const comentario = commentDraft.trim()
    if (!comentario) return
    setCommentSending(true)
    try {
      const res = await fetch(`/api/checklists-validacao-solicitacoes/${params.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisao: 'comentar', comentario }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Erro ao enviar comentário')
        return
      }
      setCommentDraft('')
      toast.success('Comentário enviado.')
      await load()
    } finally {
      setCommentSending(false)
    }
  }

  const diffs = useMemo(() => data?.itens.flatMap(item => item.diffs.map(diff => ({ ...diff, item }))) ?? [], [data])
  const canReview = Boolean((data?.status === 'finalizada' || data?.status === 'revisada') && !data?.assimilada)
  const stationGroups = useMemo(() => {
    const groups = new Map<string, { items: Item[]; label: string }>()
    const order = { MAQUINA: 0, RAMAL: 1, MONITOR: 2, IMPRESSORA: 3, NOTEBOOK: 4, APARELHO: 5 } as Record<string, number>
    const estoque = data?.tipo_solicitacao === 'ESTOQUE'
    for (const item of data?.itens ?? []) {
      const key = groupKeyForItem(item, estoque)
      const current = groups.get(key) ?? { label: groupLabelForItem(item, estoque), items: [] }
      current.items.push(item)
      groups.set(key, current)
    }
    return Array.from(groups.entries()).map(([key, group]) => ({
      key,
      label: group.label,
      items: group.items.sort((a, b) => (order[a.tipo_item] ?? 99) - (order[b.tipo_item] ?? 99)),
    }))
  }, [data?.itens, data?.tipo_solicitacao])

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-10 py-6 text-sm font-semibold text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
        Carregando revisão...
      </div>
    )
  }
  if (!data) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Solicitação não encontrada.</div>

  const reviewedDiffs = diffs.filter(diff => diff.status_revisao === 'aprovado' || diff.status_revisao === 'recusado').length
  const approvedDiffs = diffs.filter(diff => diff.status_revisao === 'aprovado').length
  const refusedDiffs = diffs.filter(diff => diff.status_revisao === 'recusado').length
  const pendingDiffs = Math.max(0, diffs.length - reviewedDiffs)
  const allItemsApproved = data.tipo_solicitacao !== 'RACK' && data.itens.length > 0 && data.itens.every(item => item.status_revisao === 'aprovado')
  const rackReviewed = data.status_revisao === 'aprovado' || data.status_revisao === 'recusado'
  const reviewOverviewMetrics: ChecklistContextMetric[] = data.tipo_solicitacao === 'RACK'
    ? [
      {
        icon: Server,
        label: 'Resposta',
        value: data.rack_resposta ? '1/1' : '0/1',
        percent: data.rack_resposta ? 100 : 0,
        helper: data.rack_resposta ? 'resposta salva' : 'sem resposta',
      },
      {
        icon: ClipboardCheck,
        label: 'Decisão',
        value: rackReviewed ? '1/1' : '0/1',
        percent: rackReviewed ? 100 : 0,
        helper: `revisão ${data.status_revisao}`,
        tone: rackReviewed ? 'emerald' : 'slate',
      },
    ]
    : [
      {
        icon: ListChecks,
        label: 'Ativos',
        value: data.itens.length,
        percent: data.itens.length ? 100 : 0,
        helper: `${data.itens.length} ativos enviados`,
      },
      {
        icon: GitCompareArrows,
        label: 'Diffs',
        value: diffs.length,
        percent: diffs.length ? 100 : 0,
        helper: `${diffs.length} mudanças detectadas`,
        tone: 'violet',
      },
      {
        icon: ClipboardCheck,
        label: 'Revisados',
        value: `${reviewedDiffs}/${diffs.length}`,
        percent: progressPercent(reviewedDiffs, diffs.length),
        helper: `${progressPercent(reviewedDiffs, diffs.length)}% decididos`,
        tone: 'amber',
      },
      {
        icon: CheckCircle2,
        label: 'Aprovados',
        value: approvedDiffs,
        percent: progressPercent(approvedDiffs, diffs.length),
        helper: `${approvedDiffs} aprovados`,
        tone: 'emerald',
      },
      {
        icon: X,
        label: 'Recusados',
        value: refusedDiffs,
        percent: progressPercent(refusedDiffs, diffs.length),
        helper: `${refusedDiffs} recusados`,
        tone: 'slate',
      },
    ]

  const title = data.titulo ?? data.setor_nome ?? data.rack_nome ?? 'Solicitação'

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-10">
      <ChecklistNavPills className="hidden lg:block" items={[
        { label: 'Checklists', href: '/checklists-validacao' },
        { label: 'Fila de revisão', href: '/checklists-validacao/revisao' },
        { label: title },
      ]} />

      <PageHeader
        title={`Revisão · ${title}`}
        description={`${data.checklist?.nome ?? 'Checklist'} · ${data.status} · revisão ${data.status_revisao}`}
      >
        <button
          type="button"
          disabled={redirecting}
          onClick={() => {
            setRedirecting(true)
            router.push(`/checklists-validacao/solicitacoes/${data.id}`)
          }}
          className="hidden items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500 hover:text-white disabled:cursor-wait disabled:opacity-60 sm:inline-flex"
        >
          {redirecting && <Loader2 className="h-4 w-4 animate-spin" />}
          Preenchimento
        </button>
      </PageHeader>

      <ChecklistContextOverview
        eyebrow="Overview da validação"
        title={data.tipo_solicitacao === 'RACK' ? 'Aceite geral do rack' : 'Revisão dos ativos'}
        description={data.tipo_solicitacao === 'RACK'
          ? `Solicitação ${data.status} · revisão ${data.status_revisao}`
          : `${reviewedDiffs}/${diffs.length} campos decididos · ${data.itens.length} ativos enviados`}
        metrics={reviewOverviewMetrics}
      />

      <ChecklistCommentsPanel
        comments={data.comentarios ?? []}
        draft={commentDraft}
        loading={commentSending}
        onChange={setCommentDraft}
        onSend={sendComment}
      />

      {!canReview && (
        <div className={`rounded-2xl border p-4 text-sm ${data.assimilada ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
          <div className="flex items-start gap-3">
            {data.assimilada ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="font-semibold">{data.assimilada ? 'Solicitação assimilada' : 'Solicitação ainda não concluída'}</p>
              <p className={data.assimilada ? 'text-emerald-100/80' : 'text-amber-100/80'}>
                {data.assimilada
                  ? `Mudanças aplicadas por ${data.assimilado_por_nome ?? 'administrador'} em ${formatDateTime(data.assimilado_em)}. O retorno fica disponível apenas na auditoria.`
                  : 'A revisão administrativa só fica disponível depois que um técnico finalizar a solicitação.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {data.tipo_solicitacao === 'RACK' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-bold text-white">Resposta do rack</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {objectEntries(data.rack_resposta?.dados_informados_json ?? {}).map(entry => (
                <div key={entry.key} className="rounded-2xl bg-slate-950/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{entry.label}</p>
                  <p className="mt-1 font-semibold text-white">{entry.value}</p>
                </div>
              ))}
              {!data.rack_resposta && <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500 md:col-span-2">Nenhuma resposta salva para este rack.</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white"><ClipboardCheck className="h-4 w-4 text-emerald-400" />Decisão</h2>
            <p className="mt-1 text-sm text-slate-400">Racks usam aceite geral: aprovado assimila tudo, recusado não altera o inventário.</p>
            {data.revisor_nome && (
              <p className="mt-3 rounded-2xl bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-300">
                Revisado por {data.revisor_nome}
              </p>
            )}
            {data.assimilada && (
              <p className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                Assimilado por {data.assimilado_por_nome ?? 'administrador'} em {formatDateTime(data.assimilado_em)}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <ActionButton active={data.status_revisao === 'aprovado'} disabled={!canReview || Boolean(operation)} loading={operation === 'rack-approve'} tone="approve" onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/revisar-rack`, 'PATCH', { status_revisao: 'aprovado' }, {
                loading: 'Aprovando rack...',
                success: 'Rack aprovado para assimilação.',
                key: 'rack-approve',
              })}>
                <Check className="h-4 w-4" />
                Aprovar rack
              </ActionButton>
              <ActionButton active={data.status_revisao === 'recusado'} disabled={!canReview || Boolean(operation)} loading={operation === 'rack-refuse'} tone="refuse" onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/revisar-rack`, 'PATCH', { status_revisao: 'recusado' }, {
                loading: 'Recusando rack...',
                success: 'Rack recusado na revisão.',
                key: 'rack-refuse',
              })}>
                <X className="h-4 w-4" />
                Recusar rack
              </ActionButton>
              <button disabled={!canReview || data.status_revisao !== 'aprovado' || Boolean(operation)} onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/assimilar-rack`, 'POST', undefined, {
                loading: 'Assimilando rack e gerando auditoria...',
                success: 'Rack assimilado e auditado no inventário.',
                key: 'rack-assimilate',
              })} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45">
                {operation === 'rack-assimilate' && <Loader2 className="h-4 w-4 animate-spin" />}
                Assimilar rack
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white"><GitCompareArrows className="h-5 w-5 text-blue-400" />Ativos e diferenças</h2>
                <p className="text-sm text-slate-400">Cada ativo pode ser decidido por completo ou campo a campo.</p>
              </div>
              <button disabled={!canReview || Boolean(operation)} onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/gerar-diff`, 'POST', undefined, {
                loading: 'Gerando diffs da solicitação...',
                success: 'Diffs recalculados.',
                key: 'gerar-diff',
              })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45">
                {operation === 'gerar-diff' && <Loader2 className="h-4 w-4 animate-spin" />}
                Gerar diff
              </button>
            </div>

            <motion.div layout className="mt-5 space-y-5">
              <AnimatePresence mode="popLayout">
                {stationGroups.map(group => (
                  <StationReviewCard
                    key={group.key}
                    assimilated={data.assimilada}
                    canReview={Boolean(canReview) && !operation}
                    group={group}
                    open={inspectionGroupKey === group.key}
                    operation={operation}
                    onClose={() => setInspectionGroupKey(null)}
                    onItemReview={(id, status) => action(`/api/checklists-validacao-itens/${id}/revisar`, 'PATCH', { status_revisao: status }, {
                      loading: status === 'aprovado' ? 'Aprovando ativo...' : 'Recusando ativo...',
                      success: status === 'aprovado' ? 'Ativo marcado como aprovado.' : 'Ativo marcado como recusado.',
                      key: `item-${id}-${status}`,
                    })}
                    onOpen={() => setInspectionGroupKey(group.key)}
                    onReview={(id, status) => action(`/api/checklists-validacao-diffs/${id}/revisar`, 'PATCH', { status_revisao: status }, {
                      loading: status === 'aprovado' ? 'Aprovando campo...' : 'Recusando campo...',
                      success: status === 'aprovado' ? 'Campo aprovado.' : 'Campo recusado.',
                      key: `diff-${id}-${status}`,
                    })}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
            {data.itens.length === 0 && <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-500">Nenhum ativo enviado para revisão.</p>}
          </section>

          <aside className="h-fit rounded-3xl border border-slate-800 bg-slate-900/70 p-5 xl:sticky xl:top-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white"><Database className="h-4 w-4 text-emerald-400" />Assimilação</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Somente campos aprovados serão aplicados no inventário. Campos recusados continuam apenas no histórico do checklist.</p>
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 px-4 py-3">
                <span className="text-slate-400">Aprovados</span>
                <strong className="text-emerald-300">{approvedDiffs}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 px-4 py-3">
                <span className="text-slate-400">Recusados</span>
                <strong className="text-red-300">{refusedDiffs}</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 px-4 py-3">
                <span className="text-slate-400">Pendentes</span>
                <strong className="text-amber-300">{pendingDiffs}</strong>
              </div>
            </div>
            {data.revisor_nome && (
              <div className="mt-3 rounded-2xl bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-300">
                Revisado por {data.revisor_nome}
              </div>
            )}
            {data.assimilada && (
              <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                Assimilado por {data.assimilado_por_nome ?? 'administrador'} em {formatDateTime(data.assimilado_em)}
              </div>
            )}
            <button disabled={!canReview || data.itens.length === 0 || allItemsApproved || Boolean(operation)} onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/aprovar-tudo`, 'POST', undefined, {
              loading: 'Aprovando todos os ativos enviados...',
              success: 'Todos os ativos enviados foram aprovados.',
              key: 'aprovar-tudo',
            })} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-45">
              {operation === 'aprovar-tudo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar tudo
            </button>
            <button disabled={!canReview || approvedDiffs === 0 || Boolean(operation)} onClick={() => action(`/api/checklists-validacao-solicitacoes/${params.id}/assimilar`, 'POST', undefined, {
              loading: 'Assimilando mudanças e gerando auditorias...',
              success: 'Mudanças aceitas no inventário e auditadas.',
              key: 'assimilar',
            })} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45">
              {operation === 'assimilar' && <Loader2 className="h-4 w-4 animate-spin" />}
              Assimilar aprovados
            </button>
          </aside>
        </div>
      )}

      <AnimatePresence>
        {(redirecting || operation === 'assimilar' || operation === 'rack-assimilate' || operation === 'aprovar-tudo') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md rounded-3xl border border-emerald-500/25 bg-slate-900 p-6 text-center shadow-2xl shadow-slate-950/40"
            >
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-300" />
              <h2 className="mt-4 text-lg font-black text-white">{redirecting ? 'Abrindo preenchimento' : operation === 'aprovar-tudo' ? 'Aprovando revisão' : 'Assimilando no inventário'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {redirecting
                  ? 'Carregando a tela operacional da solicitação.'
                  : operation === 'aprovar-tudo'
                    ? 'Marcando todos os ativos e campos enviados como aprovados.'
                  : 'Aplicando mudanças aprovadas e registrando auditorias individuais.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
