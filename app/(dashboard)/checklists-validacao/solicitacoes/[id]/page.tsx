'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Laptop,
  ListChecks,
  Loader2,
  MessageSquare,
  Monitor,
  Phone,
  Plus,
  Printer,
  Save,
  Server,
  Send,
  Smartphone,
  UserCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ChecklistNavPills } from '@/components/checklists/checklist-nav-pills'
import { ChecklistMobileBottomNav } from '@/components/checklists/checklist-mobile-bottom-nav'
import { ChecklistContextOverview, type ChecklistContextMetric } from '@/components/checklists/checklist-context-overview'
import { PlannerSyncBadge } from '@/components/checklists/checklist-overview-cards'
import { LocalidadeSelect } from '@/components/modals/localidade-select'
import { usePermission } from '@/hooks/use-permission'
import { ChecklistEstoquePanel, type EstoquePrevisto, type TipoEstoque } from '@/components/checklists/checklist-estoque-panel'

type Diff = { id: string; campo: string; valor_atual: unknown; valor_informado: unknown; tipo_diff: string; status_revisao: string }
type Item = { id: string; tipo_item: string; referencia_id?: string | null; identificador_informado: string | null; dados_informados_json: Record<string, unknown>; status_revisao: string; diffs: Diff[] }
type Cobertura = {
  previsto: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; racks: number; portas: number }
  preenchido: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; rack: number }
  percentual: number
}
type Solicitacao = {
  id: string
  checklist_validacao_id: string
  tipo_solicitacao: 'SETOR' | 'RACK' | 'ESTOQUE'
  titulo?: string
  itens_escopo?: string[]
  estoque_previsto?: EstoquePrevisto | null
  status: string
  status_revisao: string
  planner_status: string
  planner_task_id?: string | null
  assumido_por?: string | null
  assumida_pelo_usuario?: boolean
  assumida_por_outro?: boolean
  pode_assumir?: boolean
  bloqueio_assumir?: string | null
  pode_editar?: boolean
  pode_finalizar?: boolean
  pode_reabrir?: boolean
  setor_nome: string | null
  rack_nome: string | null
  tecnico_nome: string | null
  link_inventario: string | null
  itens: Item[]
  rack: any
  rack_resposta: any
  comentarios?: ChecklistComentario[] | null
  cobertura?: Cobertura
  restringir_impressoras?: boolean
  impressoras_escopo?: Array<{ id: string; nome_host: string | null; endereco_ip: string | null; modelo: string | null }>
  checklist: { nome: string; localidade?: { id?: string; nome: string } }
}
type ChecklistComentario = { id?: string; autor_id?: string | null; autor_nome?: string | null; papel?: string | null; conteudo: string; created_at?: string | null }

type TipoItem = 'MAQUINA' | 'RAMAL' | 'MONITOR' | 'IMPRESSORA' | 'NOTEBOOK' | 'APARELHO'
type ModalMode = 'ESTACAO' | 'IMPRESSORA' | null
type StationStep = 'maquina' | 'colaboradores' | 'ramal' | 'monitores'
type SidebarKind = 'MONITOR' | 'RAMAL' | 'IMPRESSORA'
type FieldConfig = { key: string; label: string; placeholder?: string; type?: string; required?: boolean; span?: 'full' }
type ColaboradorOption = { id: string; nome: string; codigo?: number | null; email?: string | null; setor_nome?: string | null }
type RamalOption = { id: string; numero_ramal: string; setor_nome?: string | null; alocacao_ativa?: { colaborador?: { nome?: string | null } | null } | null }

const stationDefaults = {
  patrimonio: '',
  hostname: '',
  ip: '',
  modelo: '',
  armazenamento: '',
  memoria: '',
  processador: '',
  status_observado: 'Em uso',
  observacoes: '',
  ramal_numero: '',
  ramal_observacoes: '',
  monitor_1_patrimonio: '',
  monitor_1_marca: '',
  monitor_1_tamanho: '',
  monitor_2_patrimonio: '',
  monitor_2_marca: '',
  monitor_2_tamanho: '',
  monitor_3_patrimonio: '',
  monitor_3_marca: '',
  monitor_3_tamanho: '',
}

const printerDefaults = {
  patrimonio: '',
  nome_rede: '',
  ip: '',
  modelo: '',
  status_observado: 'Em uso',
  observacoes: '',
}

const rackPortOptions = [8, 16, 24, 48]

function numericValue(value: unknown) {
  const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function progressPercent(done: number, total: number) {
  if (total > 0) return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  return done > 0 ? 100 : 0
}

type RackPortVisualKind = 'printer-vlan' | 'occupied' | 'reserved' | 'free'

function rackPortVisualKind(index: number, printerVlanPorts: number, occupiedNetworkPorts: number, reservedPorts: number, totalPorts: number): RackPortVisualKind {
  const position = index + 1
  if (position <= printerVlanPorts) return 'printer-vlan'
  if (position <= printerVlanPorts + occupiedNetworkPorts) return 'occupied'
  if (position > totalPorts - reservedPorts) return 'reserved'
  return 'free'
}

function rackPortVisualClass(kind: RackPortVisualKind) {
  if (kind === 'printer-vlan') return 'bg-emerald-500 shadow-emerald-950/20'
  if (kind === 'reserved') return 'bg-amber-400 shadow-amber-950/20'
  if (kind === 'occupied') return 'bg-blue-500 shadow-blue-950/20'
  return 'bg-slate-200 dark:bg-slate-700'
}

function formatCommentDate(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function formatRackDateTime(value?: string | Date | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const stationSteps: Array<{ key: StationStep; icon: LucideIcon; label: string }> = [
  { key: 'maquina', icon: Monitor, label: 'Máquina' },
  { key: 'colaboradores', icon: Users, label: 'Colaboradores' },
  { key: 'ramal', icon: Phone, label: 'Ramal' },
  { key: 'monitores', icon: Monitor, label: 'Monitores' },
]

function fieldValue(value: unknown) {
  if (value == null || value === '') return '-'
  return String(value)
}

function stationRefForItem(item: Item) {
  return fieldValue(item.dados_informados_json.estacao_ref ?? item.dados_informados_json.hostname ?? item.identificador_informado)
}

function cleanForm(form: Record<string, string>) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))
}

function hasAnyValue(values: Array<string | null | undefined>) {
  return values.some(value => String(value ?? '').trim().length > 0)
}

function statusBadge(status: string) {
  if (status === 'revisada' || status === 'aprovado') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'finalizada' || status === 'parcial') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
  if (status === 'assumida') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
  if (status === 'recusado') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function inputClass() {
  return 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
}

function InputField({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (value: string) => void }) {
  return (
    <label className={`space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 ${field.span === 'full' ? 'md:col-span-2' : ''}`}>
      <span>{field.label}{field.required && <span className="text-blue-600"> *</span>}</span>
      {field.span === 'full' ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          required={field.required}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      ) : (
        <input
          type={field.type ?? 'text'}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className={inputClass()}
        />
      )}
    </label>
  )
}

function RackNumberField({
  helper,
  label,
  max,
  onChange,
  value,
}: {
  helper?: string
  label: string
  max?: number
  onChange: (value: string) => void
  value: string
}) {
  const current = numericValue(value)
  const update = (next: number) => {
    const bounded = Math.max(0, max != null ? Math.min(max, next) : next)
    onChange(String(bounded || ''))
  }

  return (
    <label className="block rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => update(current - 1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
          aria-label={`Diminuir ${label}`}
        >
          -
        </button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={event => update(numericValue(event.target.value))}
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-lg font-bold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          onClick={() => update(current + 1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>
    </label>
  )
}

function RackQuickSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: Array<string | number>
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {options.map(option => {
          const optionValue = String(option)
          const selected = value === optionValue
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`h-11 rounded-xl border px-3 text-sm font-bold transition active:scale-[0.98] ${
                selected
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm shadow-blue-950/20'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {optionValue}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({
  active,
  color,
  description,
  done,
  icon: Icon,
  onAdd,
  onSelect,
  pendingLabel,
  title,
  total,
}: {
  active: boolean
  color: string
  description: string
  done: number
  icon: LucideIcon
  onAdd: () => void
  onSelect: () => void
  pendingLabel: string
  title: string
  total: number
}) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : done > 0 ? 100 : 0
  const isComplete = total > 0 ? done >= total : done > 0
  const isEmerald = color.includes('emerald')
  const accentText = isEmerald ? 'text-emerald-500' : 'text-blue-500'
  const accentSoft = isEmerald
    ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/15'
    : 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/15'
  const activeClass = isEmerald
    ? 'border-emerald-500/70 bg-emerald-500/[0.08] shadow-emerald-950/10 dark:border-emerald-500/60 dark:bg-emerald-500/[0.10]'
    : 'border-blue-500/70 bg-blue-500/[0.08] shadow-blue-950/10 dark:border-blue-500/60 dark:bg-blue-500/[0.10]'
  const idleClass = 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
  const progressClass = isEmerald ? 'bg-emerald-500' : 'bg-blue-600'

  return (
    <motion.article
      layout
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5 ${active ? activeClass : idleClass}`}
      style={{ order: active ? 0 : 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accentSoft}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold leading-tight text-slate-950 dark:text-white">{title}</h3>
              {isComplete && (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                  completo
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-black dark:border-slate-700 dark:bg-slate-950/50 ${active ? accentText : 'text-slate-500'}`}>
          {done}/{total}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <span>{pendingLabel}</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
          <motion.div
            layout
            className={`h-full rounded-full ${progressClass}`}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-400">
          Selecionar tarefa
        </span>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onAdd()
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-950 shadow-sm transition hover:border-blue-300 hover:text-blue-700 active:scale-95 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-950"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>
    </motion.article>
  )
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
      {children}
    </div>
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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            Comentários
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Conversa entre preenchimento e revisão.</p>
        </div>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 dark:border-slate-800">
          {comments.length}
        </span>
      </div>
      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
            Nenhum comentário ainda.
          </p>
        )}
        {comments.map((comment, index) => {
          const reviewer = comment.papel === 'revisor'
          return (
            <div key={comment.id ?? index} className={`rounded-xl border p-3 ${reviewer ? 'border-blue-500/25 bg-blue-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{comment.autor_nome ?? 'Usuário'}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{reviewer ? 'Revisor' : 'Técnico'}</span>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{comment.conteudo}</p>
              {comment.created_at && <p className="mt-1 text-[10px] text-slate-400">{formatCommentDate(comment.created_at)}</p>}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={event => onChange(event.target.value)}
          placeholder="Adicionar comentário..."
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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

function ActionButton({
  children,
  disabled = false,
  icon: Icon,
  onClick,
  title,
  tone = 'secondary',
  type = 'button',
}: {
  children: string
  disabled?: boolean
  icon?: LucideIcon
  onClick?: () => void
  title?: string
  tone?: 'primary' | 'secondary' | 'success'
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 sm:h-10 ${
        tone === 'primary'
          ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20 hover:bg-blue-500'
          : tone === 'success'
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {Icon && <Icon className={`h-4 w-4 ${Icon === Loader2 ? 'animate-spin' : ''}`} />}
      {children}
    </button>
  )
}

function SoftCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold transition active:scale-[0.99] ${
        checked
          ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-slate-700'
      }`}
      aria-pressed={checked}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
        checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
      }`}>
        {checked && <CheckCircle2 className="h-4 w-4" />}
      </span>
      <span>{label}</span>
    </button>
  )
}

export default function ChecklistSolicitacaoPage() {
  const params = useParams<{ id: string }>()
  const { isAdmin } = usePermission()
  const [data, setData] = useState<Solicitacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileChecklistView, setMobileChecklistView] = useState<'fill' | 'preview'>('fill')
  const [activeTask, setActiveTask] = useState<'ESTACAO' | 'IMPRESSORA'>('ESTACAO')
  const [sidebarKind, setSidebarKind] = useState<SidebarKind>('MONITOR')
  const [sidebarPage, setSidebarPage] = useState(0)
  const [inspectedStation, setInspectedStation] = useState<Item | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingRamalItemId, setEditingRamalItemId] = useState<string | null>(null)
  const [editingMonitorItemIds, setEditingMonitorItemIds] = useState<string[]>([])
  const [stationStep, setStationStep] = useState<StationStep>('maquina')
  const [stationForm, setStationForm] = useState<Record<string, string>>(stationDefaults)
  const [printerForm, setPrinterForm] = useState<Record<string, string>>(printerDefaults)
  const [rackForm, setRackForm] = useState<Record<string, string>>({})
  const [rackLocationOptions, setRackLocationOptions] = useState<string[]>([])
  const [rackObs, setRackObs] = useState('')
  const [colaboradorSearch, setColaboradorSearch] = useState('')
  const [colaboradorLoading, setColaboradorLoading] = useState(false)
  const [colaboradorResults, setColaboradorResults] = useState<ColaboradorOption[]>([])
  const [selectedColaboradores, setSelectedColaboradores] = useState<ColaboradorOption[]>([])
  const [semColaborador, setSemColaborador] = useState(false)
  const [ramalSearch, setRamalSearch] = useState('')
  const [ramalLoading, setRamalLoading] = useState(false)
  const [ramalResults, setRamalResults] = useState<RamalOption[]>([])
  const [selectedRamal, setSelectedRamal] = useState<RamalOption | null>(null)
  const [semRamal, setSemRamal] = useState(false)
  const [semMonitores, setSemMonitores] = useState(false)
  const [monitorCount, setMonitorCount] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [celebration, setCelebration] = useState<string | null>(null)
  const escopo = data?.itens_escopo ?? ['MAQUINA', 'MONITOR', 'RAMAL', 'COLABORADOR', 'IMPRESSORA']
  const inclui = (item: string) => escopo.includes(item)
  const cpuNoEscopo = inclui('MAQUINA')
  const estacaoNoEscopo = ['MAQUINA', 'MONITOR', 'RAMAL', 'COLABORADOR'].some(inclui)
  const visibleStationSteps = stationSteps.filter(({ key }) => (
    key === 'maquina'
    || (key === 'colaboradores' && inclui('COLABORADOR'))
    || (key === 'ramal' && inclui('RAMAL'))
    || (key === 'monitores' && inclui('MONITOR'))
  ))

  const loadedIdRef = useRef<string | null>(null)
  const load = useCallback(async () => {
    // Só a primeira carga (ou troca de solicitação) mostra o placeholder; recargas após salvar
    // atualizam os dados no lugar, sem desmontar a tela nem perder a rolagem.
    const firstLoad = loadedIdRef.current !== params.id
    if (firstLoad) setLoading(true)
    const res = await fetch(`/api/checklists-validacao-solicitacoes/${params.id}`, { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json()
      setData(json)
      if (json.tipo_solicitacao === 'RACK') {
        const rackData = json.rack_resposta?.dados_informados_json ?? {}
        setRackForm({
          nome_switch: String(rackData.nome_switch ?? json.rack?.nome_switch ?? ''),
          localidade_id: String(rackData.localidade_id ?? json.rack?.localidade_id ?? json.checklist?.localidade?.id ?? ''),
          localidade_nome: String(rackData.localidade_nome ?? json.rack?.localidade_rel?.nome ?? json.checklist?.localidade?.nome ?? ''),
          localizacao: String(rackData.localizacao ?? json.rack?.localizacao ?? ''),
          quantidade_portas: String(rackData.quantidade_portas ?? json.rack?.quantidade_portas ?? ''),
          portas_em_uso: String(rackData.portas_em_uso ?? json.rack?.portas_em_uso ?? ''),
          portas_academicas: String(rackData.portas_academicas ?? rackData.portas_rede ?? json.rack?.portas_academicas ?? ''),
          portas_vlan_impressoras: String(rackData.portas_vlan_impressoras ?? rackData.portas_vlan ?? json.rack?.portas_vlan_impressoras ?? ''),
          portas_reservadas: String(rackData.portas_reservadas ?? rackData.portas_reserva ?? ''),
        })
        setRackObs(json.rack_resposta?.observacoes ?? '')
      }
    }
    loadedIdRef.current = params.id
    setLoading(false)
  }, [params.id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const localidadeId = rackForm.localidade_id?.trim()
    if (data?.tipo_solicitacao !== 'RACK' || !localidadeId) {
      setRackLocationOptions([])
      return
    }
    let cancelled = false
    async function loadRackLocations() {
      const res = await fetch(`/api/racks?localidade_id=${encodeURIComponent(localidadeId)}&limit=500`)
      if (!res.ok || cancelled) return
      const json = await res.json().catch(() => ({}))
      const options = Array.from(new Set(
        ((json.data ?? []) as Array<{ localizacao?: string | null }>)
          .map(item => item.localizacao?.trim())
          .filter((value): value is string => Boolean(value))
      )).sort((a, b) => a.localeCompare(b, 'pt-BR'))
      setRackLocationOptions(options)
    }
    void loadRackLocations()
    return () => { cancelled = true }
  }, [data?.tipo_solicitacao, rackForm.localidade_id])

  useEffect(() => {
    setSidebarPage(0)
  }, [sidebarKind])

  useEffect(() => {
    const query = colaboradorSearch.trim()
    if (query.length < 2 || semColaborador) {
      setColaboradorResults([])
      setColaboradorLoading(false)
      return
    }
    let cancelled = false
    setColaboradorLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/colaboradores?search=${encodeURIComponent(query)}&limit=8&status=ativo`)
        if (!res.ok || cancelled) return
        const json = await res.json()
        setColaboradorResults(json.data ?? [])
      } finally {
        if (!cancelled) setColaboradorLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      setColaboradorLoading(false)
      window.clearTimeout(timer)
    }
  }, [colaboradorSearch, semColaborador])

  useEffect(() => {
    const query = ramalSearch.trim()
    if (query.length < 2 || semRamal) {
      setRamalResults([])
      setRamalLoading(false)
      return
    }
    let cancelled = false
    setRamalLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/ramais?search=${encodeURIComponent(query)}&limit=8`)
        if (!res.ok || cancelled) return
        const json = await res.json()
        setRamalResults(json.data ?? [])
      } finally {
        if (!cancelled) setRamalLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      setRamalLoading(false)
      window.clearTimeout(timer)
    }
  }, [ramalSearch, semRamal])

  function showCelebration(message: string) {
    setCelebration(message)
    window.setTimeout(() => setCelebration(null), 2200)
  }

  async function action(url: string, method = 'POST', body?: any, successMessage?: string, loadingKey = 'action') {
    setActionLoading(loadingKey)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? 'Erro na operação')
        return
      }
      if (successMessage) showCelebration(successMessage)
      await load()
    } finally {
      setActionLoading(null)
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
        toast.error((await res.json().catch(() => ({}))).error ?? 'Erro ao enviar comentário')
        return
      }
      setCommentDraft('')
      await load()
    } finally {
      setCommentSending(false)
    }
  }

  async function saveItem(tipo_item: TipoItem, dados: Record<string, unknown>, itemId?: string | null) {
    const res = await fetch(itemId ? `/api/checklists-validacao-itens/${itemId}` : `/api/checklists-validacao-solicitacoes/${params.id}/itens`, {
      method: itemId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo_item, dados }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro ao salvar item')
  }

  async function deleteItem(itemId: string) {
    const res = await fetch(`/api/checklists-validacao-itens/${itemId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro ao remover item')
  }

  function canEditSolicitation() {
    if (data?.pode_editar) return true

    if (data?.assumida_por_outro) {
      toast.warning('Solicitação assumida por outro técnico', {
        description: data.tecnico_nome
          ? `Responsável atual: ${data.tecnico_nome}. Apenas essa pessoa pode preencher.`
          : 'Apenas o técnico responsável pode preencher esta solicitação.',
      })
      return false
    }

    if (data?.status === 'finalizada' || data?.status === 'revisada') {
      toast.warning('Solicitação finalizada', {
        description: 'Reabra a solicitação antes de alterar o preenchimento.',
      })
      return false
    }

    toast.warning('Assuma a solicitação para preencher', {
      description: 'O preenchimento só fica disponível para o técnico responsável.',
    })
    return false
  }

  function openModal(mode: Exclude<ModalMode, null>) {
    if (!canEditSolicitation()) return
    setEditingItemId(null)
    setEditingRamalItemId(null)
    setEditingMonitorItemIds([])
    setActiveTask(mode)
    setModalMode(mode)
    if (mode === 'ESTACAO') setStationStep('maquina')
  }

  function openEditStation(item: Item) {
    if (!canEditSolicitation()) return
    const dados = item.dados_informados_json ?? {}
    const stationRef = stationRefForItem(item)
    const relatedRamais = itemsByType.RAMAL.filter(related => stationRefForItem(related) === stationRef)
    const relatedMonitors = itemsByType.MONITOR.filter(related => stationRefForItem(related) === stationRef).slice(0, 3)
    const colaboradoresNomes = String(dados.colaboradores_estacao ?? '')
    const colaboradoresIds = String(dados.colaboradores_estacao_ids ?? '').split(',').map(value => value.trim()).filter(Boolean)
    resetStationState()
    setEditingItemId(item.id)
    setEditingRamalItemId(relatedRamais[0]?.id ?? null)
    setEditingMonitorItemIds(relatedMonitors.map(monitor => monitor.id))
    setStationForm(current => ({
      ...current,
      patrimonio: String(dados.patrimonio ?? ''),
      hostname: String(dados.hostname ?? ''),
      ip: String(dados.ip ?? ''),
      modelo: String(dados.modelo ?? ''),
      armazenamento: String(dados.armazenamento ?? ''),
      memoria: String(dados.memoria ?? ''),
      processador: String(dados.processador ?? ''),
      status_observado: String(dados.status_observado ?? 'Em uso'),
      observacoes: String(dados.observacoes ?? ''),
      ramal_observacoes: String(relatedRamais[0]?.dados_informados_json?.observacoes ?? ''),
      monitor_1_patrimonio: String(relatedMonitors[0]?.dados_informados_json?.patrimonio ?? relatedMonitors[0]?.dados_informados_json?.codigo_interno ?? ''),
      monitor_1_marca: String(relatedMonitors[0]?.dados_informados_json?.marca ?? ''),
      monitor_1_tamanho: String(relatedMonitors[0]?.dados_informados_json?.tamanho ?? relatedMonitors[0]?.dados_informados_json?.modelo ?? ''),
      monitor_2_patrimonio: String(relatedMonitors[1]?.dados_informados_json?.patrimonio ?? relatedMonitors[1]?.dados_informados_json?.codigo_interno ?? ''),
      monitor_2_marca: String(relatedMonitors[1]?.dados_informados_json?.marca ?? ''),
      monitor_2_tamanho: String(relatedMonitors[1]?.dados_informados_json?.tamanho ?? relatedMonitors[1]?.dados_informados_json?.modelo ?? ''),
      monitor_3_patrimonio: String(relatedMonitors[2]?.dados_informados_json?.patrimonio ?? relatedMonitors[2]?.dados_informados_json?.codigo_interno ?? ''),
      monitor_3_marca: String(relatedMonitors[2]?.dados_informados_json?.marca ?? ''),
      monitor_3_tamanho: String(relatedMonitors[2]?.dados_informados_json?.tamanho ?? relatedMonitors[2]?.dados_informados_json?.modelo ?? ''),
    }))
    if (colaboradoresNomes && colaboradoresNomes !== 'Sem colaborador') {
      setSemColaborador(false)
      setSelectedColaboradores(colaboradoresNomes.split(',').map((nome, index) => ({
        id: colaboradoresIds[index] ?? `manual-${index}-${nome.trim()}`,
        nome: nome.trim(),
      })).filter(colaborador => colaborador.nome))
    } else {
      setSemColaborador(true)
    }
    if (relatedRamais[0]) {
      const numero = String(relatedRamais[0].dados_informados_json.numero_ramal ?? relatedRamais[0].identificador_informado ?? '')
      setSemRamal(false)
      setRamalSearch(numero)
      setSelectedRamal({
        id: relatedRamais[0].referencia_id ?? String(relatedRamais[0].dados_informados_json.referencia_id ?? relatedRamais[0].id),
        numero_ramal: numero,
      })
    } else {
      setSemRamal(true)
    }
    setSemMonitores(relatedMonitors.length === 0)
    setMonitorCount(relatedMonitors.length >= 3 ? 3 : relatedMonitors.length >= 2 ? 2 : 1)
    setModalMode('ESTACAO')
    setActiveTask('ESTACAO')
    setStationStep('maquina')
  }

  function closeModal() {
    setModalMode(null)
    setEditingItemId(null)
    setEditingRamalItemId(null)
    setEditingMonitorItemIds([])
  }

  function openEditPrinter(item: Item) {
    if (!canEditSolicitation()) return
    const dados = item.dados_informados_json ?? {}
    setEditingItemId(item.id)
    setPrinterForm({
      patrimonio: String(dados.patrimonio ?? ''),
      nome_rede: String(dados.nome_rede ?? ''),
      ip: String(dados.ip ?? ''),
      modelo: String(dados.modelo ?? ''),
      status_observado: String(dados.status_observado ?? 'Em uso'),
      observacoes: String(dados.observacoes ?? ''),
    })
    setModalMode('IMPRESSORA')
    setActiveTask('IMPRESSORA')
  }

  function resetStationState() {
    setStationForm(stationDefaults)
    setSelectedColaboradores([])
    setColaboradorSearch('')
    setColaboradorResults([])
    setSemColaborador(false)
    setSelectedRamal(null)
    setRamalSearch('')
    setRamalResults([])
    setSemRamal(false)
    setSemMonitores(false)
    setMonitorCount(1)
    setEditingRamalItemId(null)
    setEditingMonitorItemIds([])
    setStationStep('maquina')
  }

  function addColaborador(colaborador: ColaboradorOption) {
    setSelectedColaboradores(current => current.some(item => item.id === colaborador.id) ? current : [...current, colaborador])
    setColaboradorSearch('')
    setColaboradorResults([])
    setSemColaborador(false)
  }

  function removeColaborador(id: string) {
    setSelectedColaboradores(current => current.filter(item => item.id !== id))
  }

  function selectRamal(ramal: RamalOption) {
    setSelectedRamal(ramal)
    setRamalSearch(ramal.numero_ramal)
    setRamalResults([])
    setSemRamal(false)
  }

  async function saveStation(event?: FormEvent, forceEmptyStation = false) {
    event?.preventDefault()
    setSaving(true)
    try {
      const isEditing = Boolean(editingItemId)
      const stationRef = stationForm.hostname.trim() || stationForm.patrimonio.trim()
      if (!stationRef) {
        setSaving(false)
        setStationStep('maquina')
        toast.warning('Informe o host ou o patrimônio da estação')
        return
      }
      const colaboradoresNoEscopo = inclui('COLABORADOR')
      const ramalNoEscopo = inclui('RAMAL')
      const monitoresNoEscopo = inclui('MONITOR')
      const colaboradoresNomes = !colaboradoresNoEscopo ? '' : semColaborador ? 'Sem colaborador' : selectedColaboradores.map(item => item.nome).join(', ')
      const colaboradoresIds = colaboradoresNoEscopo ? selectedColaboradores.map(item => item.id).join(',') : ''
      const ramalNumero = !ramalNoEscopo || semRamal ? '' : (selectedRamal?.numero_ramal || ramalSearch.trim())
      const hasColaboradorVinculo = colaboradoresNoEscopo && !semColaborador && selectedColaboradores.length > 0
      const hasRamalVinculo = ramalNoEscopo && !semRamal && ramalNumero.length > 0
      const hasMonitorVinculo = monitoresNoEscopo && !semMonitores && Array.from({ length: monitorCount }, (_, item) => item + 1).some(index => hasAnyValue([
        stationForm[`monitor_${index}_patrimonio`],
        stationForm[`monitor_${index}_marca`],
        stationForm[`monitor_${index}_tamanho`],
      ]))
      if ((colaboradoresNoEscopo || ramalNoEscopo) && !hasColaboradorVinculo && !hasRamalVinculo && !forceEmptyStation) {
        setSaving(false)
        toast.warning('Enviar estação sem vínculos?', {
          description: hasMonitorVinculo
            ? 'A estação possui monitor, mas nenhum colaborador ou ramal foi informado.'
            : 'Nenhum colaborador, ramal ou monitor foi informado para esta estação.',
          action: {
            label: 'Enviar',
            onClick: () => {
              void saveStation(undefined, true)
            },
          },
        })
        return
      }
      const maquina = cleanForm({
        patrimonio: stationForm.patrimonio,
        hostname: stationForm.hostname,
        ...(cpuNoEscopo ? {
          ip: stationForm.ip,
          modelo: stationForm.modelo,
          armazenamento: stationForm.armazenamento,
          memoria: stationForm.memoria,
          processador: stationForm.processador,
          status_observado: stationForm.status_observado,
        } : {}),
        colaboradores_estacao: colaboradoresNomes,
        colaboradores_estacao_ids: colaboradoresIds,
        alocacao_atual: colaboradoresNomes,
        ramal_estacao: !ramalNoEscopo ? '' : semRamal ? 'Sem ramal' : ramalNumero,
        observacoes: stationForm.observacoes,
      })
      await saveItem('MAQUINA', { ...maquina, estacao_ref: stationRef, ...(cpuNoEscopo ? {} : { somente_referencia: true }) }, editingItemId)

      if (!ramalNoEscopo) {
        // Ramal fora do escopo: nada a registrar.
      } else if (semRamal || !ramalNumero) {
        if (editingRamalItemId) await deleteItem(editingRamalItemId)
      } else {
        await saveItem('RAMAL', cleanForm({
          referencia_id: selectedRamal?.id ?? '',
          numero_ramal: ramalNumero,
          alocacao: stationRef,
          estacao_ref: stationRef,
          colaboradores_estacao: colaboradoresNomes,
          colaboradores_estacao_ids: colaboradoresIds,
          observacoes: stationForm.ramal_observacoes,
        }), editingRamalItemId)
      }

      if (monitoresNoEscopo && semMonitores) {
        for (const itemId of editingMonitorItemIds) await deleteItem(itemId)
      }

      for (const index of !monitoresNoEscopo || semMonitores ? [] : Array.from({ length: monitorCount }, (_, item) => item + 1)) {
        const patrimonio = stationForm[`monitor_${index}_patrimonio`]
        const marca = stationForm[`monitor_${index}_marca`]
        const tamanho = stationForm[`monitor_${index}_tamanho`]
        if (!hasAnyValue([patrimonio, marca, tamanho])) continue
        await saveItem('MONITOR', cleanForm({
          patrimonio,
          marca,
          tamanho,
          maquina_hostname: stationForm.hostname,
          estacao_ref: stationRef,
          colaboradores_estacao: colaboradoresNomes,
          colaboradores_estacao_ids: colaboradoresIds,
        }), editingMonitorItemIds[index - 1])
      }

      if (monitoresNoEscopo && !semMonitores) {
        for (const itemId of editingMonitorItemIds.slice(monitorCount)) await deleteItem(itemId)
      }

      resetStationState()
      setEditingItemId(null)
      setModalMode(null)
      showCelebration(isEditing ? 'Estação e vínculos atualizados' : 'Preenchimento enviado')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar estação')
    } finally {
      setSaving(false)
    }
  }

  async function savePrinter(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveItem('IMPRESSORA', cleanForm(printerForm), editingItemId)
      setPrinterForm(printerDefaults)
      setEditingItemId(null)
      setModalMode(null)
      showCelebration(editingItemId ? 'Impressora atualizada' : 'Impressora enviada')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar impressora')
    } finally {
      setSaving(false)
    }
  }

  async function saveRack(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const dados = cleanForm({
        ...rackForm,
        portas_livres: String(Math.max(0, numericValue(rackForm.quantidade_portas) - numericValue(rackForm.portas_em_uso))),
      })
      const res = await fetch(`/api/checklists-validacao-solicitacoes/${params.id}/rack-resposta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dados, observacoes: rackObs }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar rack')
      setData(current => current ? {
        ...current,
        rack_resposta: json,
        cobertura: current.cobertura ? {
          ...current.cobertura,
          preenchido: { ...current.cobertura.preenchido, rack: 1 },
          percentual: current.cobertura.percentual,
        } : current.cobertura,
      } : current)
      showCelebration('Validação do rack salva')
      void load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar rack')
    } finally {
      setSaving(false)
    }
  }

  async function generateMonitorCode(targetKey = 'monitor_1_patrimonio') {
    const res = await fetch('/api/monitores/gerar-codigo-interno', { method: 'POST' })
    const json = await res.json()
    if (json.codigo_interno) setStationForm(current => ({ ...current, [targetKey]: json.codigo_interno }))
  }

  const itemsByType = useMemo(() => {
    const grouped: Record<TipoItem, Item[]> = { MAQUINA: [], RAMAL: [], MONITOR: [], IMPRESSORA: [], NOTEBOOK: [], APARELHO: [] }
    for (const item of data?.itens ?? []) grouped[item.tipo_item as TipoItem]?.push(item)
    return grouped
  }, [data])

  const stationLinksByRef = useMemo(() => {
    const map = new Map<string, { ramais: Item[]; monitores: Item[] }>()
    const ensure = (estacao: string) => {
      if (!map.has(estacao)) map.set(estacao, { ramais: [], monitores: [] })
      return map.get(estacao)!
    }
    for (const maquina of itemsByType.MAQUINA) ensure(stationRefForItem(maquina))
    for (const ramal of itemsByType.RAMAL) ensure(stationRefForItem(ramal)).ramais.push(ramal)
    for (const monitor of itemsByType.MONITOR) ensure(stationRefForItem(monitor)).monitores.push(monitor)
    return map
  }, [itemsByType])

  const sidebarItems = useMemo(() => {
    if (sidebarKind === 'RAMAL') return itemsByType.RAMAL
    if (sidebarKind === 'IMPRESSORA') return itemsByType.IMPRESSORA
    return itemsByType.MONITOR
  }, [itemsByType, sidebarKind])

  const sidebarPageSize = 5
  const sidebarTotalPages = Math.max(1, Math.ceil(sidebarItems.length / sidebarPageSize))
  const sidebarSafePage = Math.min(sidebarPage, sidebarTotalPages - 1)
  const sidebarVisibleItems = sidebarItems.slice(sidebarSafePage * sidebarPageSize, sidebarSafePage * sidebarPageSize + sidebarPageSize)

  const coverage = data?.cobertura
  const machineExpected = coverage?.previsto.maquinas ?? 0
  const printerExpected = coverage?.previsto.impressoras ?? 0
  const machineDone = coverage?.preenchido.maquinas ?? itemsByType.MAQUINA.length
  const printerDone = coverage?.preenchido.impressoras ?? itemsByType.IMPRESSORA.length
  const coverageRows: Array<{ label: string; done: number; total: number; icon: LucideIcon }> = data?.tipo_solicitacao === 'ESTOQUE'
    ? [
      { label: 'Notebooks', done: coverage?.preenchido.notebooks ?? 0, total: coverage?.previsto.notebooks ?? 0, icon: Laptop, item: 'NOTEBOOK' },
      { label: 'Aparelhos', done: coverage?.preenchido.aparelhos ?? 0, total: coverage?.previsto.aparelhos ?? 0, icon: Smartphone, item: 'APARELHO' },
    ].filter(row => inclui(row.item))
    : [
      { label: 'Estações', done: machineDone, total: coverage?.previsto.maquinas ?? 0, icon: Monitor, item: 'ESTACAO' },
      { label: 'Ramais', done: coverage?.preenchido.ramais ?? 0, total: coverage?.previsto.ramais ?? 0, icon: Phone, item: 'RAMAL' },
      { label: 'Monitores', done: coverage?.preenchido.monitores ?? 0, total: coverage?.previsto.monitores ?? 0, icon: Monitor, item: 'MONITOR' },
      { label: 'Impressoras', done: printerDone, total: printerExpected, icon: Printer, item: 'IMPRESSORA' },
    ].filter(row => row.item === 'ESTACAO' ? estacaoNoEscopo : inclui(row.item))
  const rackTotalPorts = numericValue(rackForm.quantidade_portas)
  const rackUsedPorts = Math.min(rackTotalPorts || Number.MAX_SAFE_INTEGER, numericValue(rackForm.portas_em_uso))
  const rackFreePorts = Math.max(0, rackTotalPorts - rackUsedPorts)
  const rackReservedPorts = Math.min(rackFreePorts || rackTotalPorts || Number.MAX_SAFE_INTEGER, numericValue(rackForm.portas_reservadas))
  const rackPrinterVlanPorts = Math.min(rackTotalPorts || Number.MAX_SAFE_INTEGER, numericValue(rackForm.portas_vlan_impressoras))
  const rackUsagePercent = rackTotalPorts > 0 ? Math.min(100, Math.round((rackUsedPorts / rackTotalPorts) * 100)) : 0
  const rackPreviewPortTotal = Math.min(rackTotalPorts || 0, 48)
  const rackPreviewReservedPorts = Math.min(rackReservedPorts, rackPreviewPortTotal)
  const rackPreviewPrinterVlanPorts = Math.min(rackPrinterVlanPorts, rackUsedPorts, rackPreviewPortTotal - rackPreviewReservedPorts)
  const rackPreviewOccupiedNetworkPorts = Math.min(Math.max(0, rackUsedPorts - rackPreviewPrinterVlanPorts), Math.max(0, rackPreviewPortTotal - rackPreviewPrinterVlanPorts - rackPreviewReservedPorts))
  const rackPreviewFreePorts = Math.max(0, rackPreviewPortTotal - rackPreviewPrinterVlanPorts - rackPreviewOccupiedNetworkPorts - rackPreviewReservedPorts)
  const rackPreviewLegend = [
    { label: 'Rede ocupada', value: rackPreviewOccupiedNetworkPorts, className: 'bg-blue-500' },
    { label: 'VLAN impressoras', value: rackPreviewPrinterVlanPorts, className: 'bg-emerald-500' },
    { label: 'Reservadas', value: rackPreviewReservedPorts, className: 'bg-amber-400' },
    { label: 'Livres', value: rackPreviewFreePorts, className: 'bg-slate-300 dark:bg-slate-700' },
  ]
  const rackSavedAt = formatRackDateTime(data?.rack_resposta?.preenchido_em ?? data?.rack_resposta?.atualizado_em)
  const rackHasSavedResponse = Boolean(data?.rack_resposta)

  if (loading) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Carregando solicitação...</div>
  if (!data) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Solicitação não encontrada.</div>

  const isClosed = data.status === 'finalizada' || data.status === 'revisada'
  const printersInScope = inclui('IMPRESSORA') && (!data.restringir_impressoras || (data.impressoras_escopo?.length ?? 0) > 0 || itemsByType.IMPRESSORA.length > 0)
  const tituloSolicitacao = data.titulo ?? data.setor_nome ?? data.rack_nome ?? 'Solicitação'
  const tipoLabel = data.tipo_solicitacao === 'SETOR' ? 'Setor' : data.tipo_solicitacao === 'RACK' ? 'Rack' : 'Estoque'
  const assumirLabel = data.assumida_pelo_usuario
    ? 'Assumida por você'
    : data.assumida_por_outro
      ? 'Assumida por outro'
      : isClosed
        ? 'Encerrada'
        : data.bloqueio_assumir
          ? 'Sem código de pessoa'
          : 'Assumir'
  const canAssume = Boolean(data.pode_assumir)
  const solicitationOverviewMetrics: ChecklistContextMetric[] = coverageRows.map(row => ({
    icon: row.icon,
    label: row.label,
    value: `${row.done}/${row.total}`,
    percent: progressPercent(row.done, row.total),
    helper: `${progressPercent(row.done, row.total)}% preenchido`,
    tone: row.label === 'Impressoras' ? 'emerald' : row.label === 'Monitores' ? 'violet' : 'blue',
  }))

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 pb-24 pt-4 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-6 lg:px-10">
      {isAdmin && (
        <ChecklistNavPills className="hidden lg:block" items={[
          { label: 'Checklists', href: '/checklists-validacao' },
          { label: data.checklist?.nome ?? 'Checklist', href: `/checklists-validacao/${data.checklist_validacao_id}` },
          { label: `Preenchimento ${tipoLabel.toLowerCase()}` },
        ]} />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {isAdmin && (
            <Link
              href={`/checklists-validacao/${data.checklist_validacao_id}`}
              className="mb-3 hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:text-blue-300 lg:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para solicitações
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {data.tipo_solicitacao === 'ESTOQUE' ? `${tituloSolicitacao} · ${data.checklist?.localidade?.nome ?? 'Unidade'}` : `${tipoLabel} · ${tituloSolicitacao}`}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {data.checklist?.nome ?? 'Checklist'} · {data.status}{data.tecnico_nome ? ` · ${data.tecnico_nome}` : ''}
          </p>
          <div className="mt-3">
            <PlannerSyncBadge plannerTaskId={data.planner_task_id} plannerStatus={data.planner_status} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <ActionButton
            disabled={!canAssume || actionLoading === 'assumir'}
            title={data.bloqueio_assumir ?? undefined}
            icon={actionLoading === 'assumir' ? Loader2 : data.assumida_pelo_usuario ? CheckCircle2 : UserCheck}
            onClick={canAssume ? () => action(`/api/checklists-validacao-solicitacoes/${params.id}/assumir`, 'PATCH', undefined, 'Solicitação assumida', 'assumir') : undefined}
            tone={canAssume ? 'primary' : data.assumida_pelo_usuario ? 'success' : 'secondary'}
          >
            {actionLoading === 'assumir' ? 'Assumindo...' : assumirLabel}
          </ActionButton>
          {isClosed ? (
            <ActionButton
              disabled={!data.pode_reabrir || actionLoading === 'reabrir'}
              icon={ArrowLeft}
              onClick={data.pode_reabrir ? () => action(`/api/checklists-validacao-solicitacoes/${params.id}/reabrir`, 'PATCH', undefined, 'Solicitação reaberta', 'reabrir') : undefined}
            >
              {actionLoading === 'reabrir' ? 'Reabrindo...' : 'Reabrir'}
            </ActionButton>
          ) : (
            <ActionButton
              disabled={!data.pode_finalizar || actionLoading === 'finalizar'}
              icon={actionLoading === 'finalizar' ? Loader2 : CheckCircle2}
              onClick={data.pode_finalizar ? () => action(`/api/checklists-validacao-solicitacoes/${params.id}/finalizar`, 'PATCH', undefined, 'Solicitação finalizada', 'finalizar') : undefined}
            >
              {actionLoading === 'finalizar' ? 'Finalizando...' : 'Finalizar'}
            </ActionButton>
          )}
        </div>
      </div>

      {data.tipo_solicitacao !== 'RACK' && (
        <ChecklistContextOverview
          className={mobileChecklistView === 'preview' ? 'block' : 'hidden lg:block'}
          eyebrow={data.tipo_solicitacao === 'ESTOQUE' ? 'Overview do estoque' : 'Overview do setor'}
          title="Contexto da validação"
          description={`${data.status} · revisão ${data.status_revisao} · ${data.tecnico_nome ?? 'sem técnico'} · cobertura ${coverage?.percentual ?? 0}%`}
          metrics={solicitationOverviewMetrics}
        />
      )}

      <ChecklistCommentsPanel
        comments={data.comentarios ?? []}
        draft={commentDraft}
        loading={commentSending}
        onChange={setCommentDraft}
        onSend={sendComment}
      />

      {data.tipo_solicitacao === 'ESTOQUE' ? (
        <div className={`${mobileChecklistView === 'fill' ? 'block' : 'hidden'} lg:block`}>
          <ChecklistEstoquePanel
            canEdit={canEditSolicitation}
            escopo={escopo}
            itens={data.itens}
            podeEditar={Boolean(data.pode_editar)}
            previsto={data.estoque_previsto}
            onSave={(tipo: TipoEstoque, dados, itemId) => saveItem(tipo, dados, itemId)}
            onDelete={deleteItem}
            onChanged={async message => {
              showCelebration(message)
              await load()
            }}
          />
        </div>
      ) : data.tipo_solicitacao === 'SETOR' ? (
        <>
          <motion.section
            initial={false}
            animate={{ opacity: mobileChecklistView === 'fill' ? 1 : 0.96, y: mobileChecklistView === 'fill' ? 0 : 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${mobileChecklistView === 'fill' ? 'grid' : 'hidden'} gap-4 lg:grid xl:grid-cols-[1fr_360px]`}
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/15">
                      <ListChecks className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Fluxo de campo</p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">Tarefas de validação</h2>
                      <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {estacaoNoEscopo && printersInScope
                          ? 'Registre as estações e as impressoras encontradas no setor.'
                          : estacaoNoEscopo
                            ? 'Registre as estações encontradas no setor.'
                            : 'Registre as impressoras encontradas no setor.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {[
                          ['MAQUINA', 'CPU'],
                          ['MONITOR', 'Monitor'],
                          ['RAMAL', 'Ramal'],
                          ['COLABORADOR', 'Colaborador'],
                          ['IMPRESSORA', 'Impressoras'],
                        ].map(([key, label]) => (
                          <span
                            key={key}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${inclui(key)
                              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'border-slate-200 text-slate-400 line-through dark:border-slate-800'}`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    {estacaoNoEscopo && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estações</span>
                      <strong className="mt-0.5 block text-sm font-black text-slate-950 dark:text-white">{machineDone}/{machineExpected}</strong>
                    </div>}
                    {printersInScope && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Impressoras</span>
                      <strong className="mt-0.5 block text-sm font-black text-slate-950 dark:text-white">{printerDone}/{printerExpected}</strong>
                    </div>}
                  </div>
                </div>
              </div>

              <motion.div layout className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
                {estacaoNoEscopo && <TaskCard
                  active={activeTask === 'ESTACAO'}
                  color="text-blue-600"
                  description={`${[cpuNoEscopo && 'CPU', inclui('RAMAL') && 'ramal', inclui('COLABORADOR') && 'colaboradores', inclui('MONITOR') && 'monitores'].filter(Boolean).join(', ')} preenchidos como uma estação de trabalho.`}
                  done={machineDone}
                  icon={Monitor}
                  onAdd={() => openModal('ESTACAO')}
                  onSelect={() => setActiveTask('ESTACAO')}
                  pendingLabel={`${Math.max(0, machineExpected - machineDone)} estações pendentes`}
                  title="Estações de trabalho"
                  total={machineExpected}
                />}
                {printersInScope && <TaskCard
                  active={activeTask === 'IMPRESSORA'}
                  color="text-emerald-600"
                  description="Impressoras continuam separadas para validar IP, rede, modelo e status."
                  done={printerDone}
                  icon={Printer}
                  onAdd={() => openModal('IMPRESSORA')}
                  onSelect={() => setActiveTask('IMPRESSORA')}
                  pendingLabel={`${Math.max(0, printerExpected - printerDone)} impressoras pendentes`}
                  title="Impressoras do setor"
                  total={printerExpected}
                />}
              </motion.div>
              {data.restringir_impressoras && inclui('IMPRESSORA') && (
                <div className="border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:p-5">
                  <p className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                    <Printer className="h-4 w-4 text-emerald-600" />
                    {printersInScope ? 'Impressoras selecionadas para este checklist' : 'Impressoras não fazem parte do escopo deste checklist'}
                  </p>
                  {printersInScope && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {(data.impressoras_escopo ?? []).map(printer => (
                        <li key={printer.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                          {[printer.nome_host ?? printer.endereco_ip ?? 'Sem identificação', printer.modelo].filter(Boolean).join(' · ')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Cobertura esperada</h2>
              <p className="mt-1 text-sm text-slate-500">Pré-cálculo do inventário atual para orientar a visita.</p>
              <div className="mt-4 space-y-3">
                {coverageRows.map(({ label, done, total, icon: Icon }) => {
                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                  return (
                    <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"><Icon className="h-4 w-4 text-slate-400" />{label}</span>
                        <span className="text-slate-500">{done}/{total}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={false}
            animate={{ opacity: mobileChecklistView === 'preview' ? 1 : 0.96, y: mobileChecklistView === 'preview' ? 0 : 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${mobileChecklistView === 'preview' ? 'block' : 'hidden'} rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block`}
          >
            <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Registros do setor</h2>
                <p className="text-sm text-slate-500">Estações, vínculos e impressoras preenchidos na visita.</p>
              </div>
            </div>

            <div className="grid gap-5 p-4 xl:grid-cols-[1fr_420px]">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Estações registradas</h3>
                  <p className="text-xs text-slate-500">Cada card representa uma máquina/estação validada.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                {itemsByType.MAQUINA.map(item => {
                  const links = stationLinksByRef.get(stationRefForItem(item)) ?? { ramais: [], monitores: [] }
                  return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setInspectedStation(item)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') setInspectedStation(item)
                    }}
                    className="group cursor-pointer rounded-lg border border-slate-100 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-blue-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold uppercase text-slate-400">Estação</span>
                        <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{item.identificador_informado ?? fieldValue(item.dados_informados_json.hostname)}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {data.pode_editar && (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              openEditStation(item)
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:text-blue-300"
                          >
                            Editar
                          </button>
                        )}
                        <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(item.status_revisao)}`}>{item.status_revisao}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_128px]">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { label: 'Patrimônio', value: item.dados_informados_json.patrimonio },
                          { label: 'IP', value: item.dados_informados_json.ip },
                          { label: 'Modelo', value: item.dados_informados_json.modelo },
                          { label: 'Memória', value: item.dados_informados_json.memoria },
                          { label: 'Armazenamento', value: item.dados_informados_json.armazenamento },
                          { label: 'Colaboradores', value: item.dados_informados_json.colaboradores_estacao },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-md bg-white p-2 dark:bg-slate-900">
                            <span className="block text-slate-400">{label}</span>
                            <strong className="font-medium text-slate-800 dark:text-slate-200">{fieldValue(value)}</strong>
                          </div>
                        ))}
                      </div>

                      <aside className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          <Eye className="h-3.5 w-3.5" />
                          Vínculos
                        </p>
                        <div className="space-y-2">
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/70">
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Phone className="h-3.5 w-3.5 text-blue-500" />Ramal</span>
                            <strong className="mt-0.5 block truncate text-xs text-slate-900 dark:text-white">
                              {links.ramais[0] ? fieldValue(links.ramais[0].dados_informados_json.numero_ramal ?? links.ramais[0].identificador_informado) : 'Sem ramal'}
                            </strong>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/70">
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Monitor className="h-3.5 w-3.5 text-violet-500" />Monitores</span>
                            <strong className="mt-0.5 block text-xs text-slate-900 dark:text-white">{links.monitores.length}/3</strong>
                          </div>
                        </div>
                      </aside>
                    </div>
                  </div>
                )})}
                  {itemsByType.MAQUINA.length === 0 && <div className="md:col-span-2"><EmptyState>Nenhuma estação preenchida ainda.</EmptyState></div>}
                </div>
              </div>

              <div className="space-y-5">
              <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Visão por tipo</h2>
                    <p className="text-sm text-slate-500">Alterne entre monitores, ramais e impressoras.</p>
                  </div>
                  <span className="text-sm text-slate-500">{sidebarItems.length}</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/70">
                    {[
                      { key: 'MONITOR' as SidebarKind, label: 'Monitores', icon: Monitor, total: itemsByType.MONITOR.length },
                      { key: 'RAMAL' as SidebarKind, label: 'Ramais', icon: Phone, total: itemsByType.RAMAL.length },
                      { key: 'IMPRESSORA' as SidebarKind, label: 'Impressoras', icon: Printer, total: itemsByType.IMPRESSORA.length },
                    ].filter(({ key, total }) => inclui(key) || total > 0).map(({ key, label, icon: Icon, total }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSidebarKind(key)}
                        className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${sidebarKind === key ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{label}</span>
                        <span className="text-[10px] opacity-70">{total}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3">
                    {sidebarVisibleItems.map(item => (
                      <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              {sidebarKind === 'MONITOR' ? 'Monitor' : sidebarKind === 'RAMAL' ? 'Ramal' : 'Impressora'}
                            </span>
                            <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">
                              {sidebarKind === 'MONITOR'
                                ? fieldValue(item.dados_informados_json.patrimonio ?? item.dados_informados_json.codigo_interno ?? item.identificador_informado)
                                : sidebarKind === 'RAMAL'
                                  ? fieldValue(item.dados_informados_json.numero_ramal ?? item.identificador_informado)
                                  : fieldValue(item.dados_informados_json.nome_rede ?? item.identificador_informado)}
                            </h3>
                          </div>
                          {sidebarKind !== 'IMPRESSORA' && (
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-500 dark:border-slate-700">
                              {stationRefForItem(item)}
                            </span>
                          )}
                          {sidebarKind === 'IMPRESSORA' && data.pode_editar && (
                            <button
                              type="button"
                              onClick={() => openEditPrinter(item)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:text-blue-300"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                        <p className="mt-2 truncate text-xs text-slate-500">
                          {sidebarKind === 'MONITOR'
                            ? ([item.dados_informados_json.marca, item.dados_informados_json.tamanho ?? item.dados_informados_json.modelo].map(fieldValue).filter(value => value !== '-').join(' · ') || 'Sem detalhes adicionais')
                            : sidebarKind === 'RAMAL'
                              ? `Estação ${stationRefForItem(item)}${item.dados_informados_json.observacoes ? ` · ${fieldValue(item.dados_informados_json.observacoes)}` : ''}`
                              : [item.dados_informados_json.ip, item.dados_informados_json.modelo, item.dados_informados_json.status_observado].map(fieldValue).filter(value => value !== '-').join(' · ') || 'Sem detalhes adicionais'}
                        </p>
                      </div>
                    ))}
                    {sidebarVisibleItems.length === 0 && <EmptyState>Nenhum item nesse tipo ainda.</EmptyState>}
                  </div>

                  {sidebarItems.length > sidebarPageSize && (
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        disabled={sidebarSafePage === 0}
                        onClick={() => setSidebarPage(page => Math.max(0, page - 1))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:hover:text-white"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs font-semibold text-slate-500">Página {sidebarSafePage + 1} de {sidebarTotalPages}</span>
                      <button
                        type="button"
                        disabled={sidebarSafePage >= sidebarTotalPages - 1}
                        onClick={() => setSidebarPage(page => Math.min(sidebarTotalPages - 1, page + 1))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:hover:text-white"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              </div>
            </div>
          </motion.section>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_480px]">
          <motion.form
            onSubmit={saveRack}
            initial={false}
            animate={{ opacity: mobileChecklistView === 'fill' ? 1 : 0.96, y: mobileChecklistView === 'fill' ? 0 : 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${mobileChecklistView === 'fill' ? 'block' : 'hidden'} overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block`}
          >
            <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                <Server className="h-4 w-4 text-blue-600" />
                Validação do rack
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Registre local, capacidade, ocupação e distribuição de portas com campos rápidos para uso no celular.
              </p>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <section className="grid gap-3 md:grid-cols-2">
                <InputField
                  field={{ key: 'nome_switch', label: 'Nome do rack/switch', required: true }}
                  value={rackForm.nome_switch ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, nome_switch: value }))}
                />
                <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>Localidade <span className="text-blue-600">*</span></span>
                  <LocalidadeSelect
                    value={rackForm.localidade_id || null}
                    onChange={(id, nome) => setRackForm(current => ({
                      ...current,
                      localidade_id: id ?? '',
                      localidade_nome: nome ?? '',
                    }))}
                    placeholder="Selecionar localidade..."
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>Prédio / local físico <span className="text-blue-600">*</span></span>
                  <input
                    list="rack-location-options"
                    value={rackForm.localizacao ?? ''}
                    onChange={event => setRackForm(current => ({ ...current, localizacao: event.target.value }))}
                    placeholder="Ex.: Primeiro andar, CPD, Bloco A"
                    required
                    className={inputClass()}
                  />
                  <datalist id="rack-location-options">
                    {rackLocationOptions.map(option => <option key={option} value={option} />)}
                  </datalist>
                  {rackLocationOptions.length > 0 && (
                    <span className="block text-xs font-normal text-slate-500">
                      Sugestões carregadas dos racks desta localidade.
                    </span>
                  )}
                </label>
              </section>

              <section>
                <RackQuickSelect
                  label="Capacidade rápida"
                  options={rackPortOptions}
                  value={rackForm.quantidade_portas ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, quantidade_portas: value }))}
                />
              </section>

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <RackNumberField
                  label="Total"
                  helper="Portas físicas"
                  value={rackForm.quantidade_portas ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, quantidade_portas: value }))}
                />
                <RackNumberField
                  label="Ocupadas"
                  helper="Em uso"
                  max={rackTotalPorts || undefined}
                  value={rackForm.portas_em_uso ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, portas_em_uso: value }))}
                />
                <RackNumberField
                  label="Portas reservadas"
                  helper="Portas livres reservadas"
                  max={rackTotalPorts ? rackFreePorts : undefined}
                  value={rackForm.portas_reservadas ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, portas_reservadas: value }))}
                />
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <RackNumberField
                  label="Portas de rede / acadêmicas"
                  helper="Pontos de rede"
                  max={rackTotalPorts || undefined}
                  value={rackForm.portas_academicas ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, portas_academicas: value }))}
                />
                <RackNumberField
                  label="Portas VLAN impressoras"
                  helper="VLAN de impressoras"
                  max={rackTotalPorts || undefined}
                  value={rackForm.portas_vlan_impressoras ?? ''}
                  onChange={value => setRackForm(current => ({ ...current, portas_vlan_impressoras: value }))}
                />
              </section>

              <label className="block space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>Observações</span>
                <textarea
                  value={rackObs}
                  onChange={event => setRackObs(event.target.value)}
                  rows={4}
                  placeholder="Portas com defeito, patch panels, organização física, divergências encontradas..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {rackHasSavedResponse ? `Último envio${rackSavedAt ? ` em ${rackSavedAt}` : ''}.` : 'Nenhum envio salvo ainda.'}
              </p>
              <ActionButton icon={Save} type="submit" tone="primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar rack'}
              </ActionButton>
            </div>
          </motion.form>

          <motion.aside
            initial={false}
            animate={{ opacity: mobileChecklistView === 'preview' ? 1 : 0.96, y: mobileChecklistView === 'preview' ? 0 : 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${mobileChecklistView === 'preview' ? 'block' : 'hidden'} overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-4 lg:block lg:self-start`}
          >
            <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Preview da validação</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {rackHasSavedResponse ? 'Resposta salva e pronta para revisão.' : 'Prévia do que será enviado.'}
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${rackHasSavedResponse ? statusBadge('aprovado') : statusBadge('aberta')}`}>
                  {rackHasSavedResponse ? 'Salvo' : 'Prévia'}
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Portas</p>
                  <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{rackTotalPorts || '-'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Livres</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-300">{rackTotalPorts ? rackFreePorts : '-'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">VLAN impressoras</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-300">{rackPrinterVlanPorts || '-'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Portas reservadas</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-300">{rackReservedPorts || '-'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Ocupação</span>
                  <span className="text-sm font-bold text-slate-500">{rackUsagePercent}%</span>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <motion.div
                    className="h-full bg-emerald-500"
                    initial={false}
                    animate={{ width: `${progressPercent(rackPreviewPrinterVlanPorts, rackPreviewPortTotal)}%` }}
                    transition={{ duration: 0.25 }}
                  />
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={false}
                    animate={{ width: `${progressPercent(rackPreviewOccupiedNetworkPorts, rackPreviewPortTotal)}%` }}
                    transition={{ duration: 0.25 }}
                  />
                  <motion.div
                    className="h-full bg-amber-400"
                    initial={false}
                    animate={{ width: `${progressPercent(rackPreviewReservedPorts, rackPreviewPortTotal)}%` }}
                    transition={{ duration: 0.25 }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-12 gap-1">
                  {Array.from({ length: rackPreviewPortTotal }, (_, index) => {
                    const visualKind = rackPortVisualKind(index, rackPreviewPrinterVlanPorts, rackPreviewOccupiedNetworkPorts, rackPreviewReservedPorts, rackPreviewPortTotal)
                    const label = visualKind === 'printer-vlan'
                      ? 'VLAN impressoras'
                      : visualKind === 'reserved'
                        ? 'reservada'
                        : visualKind === 'occupied'
                          ? 'rede ocupada'
                          : 'livre'
                    return (
                      <span
                        key={index}
                        className={`h-2.5 rounded-full shadow-sm ${rackPortVisualClass(visualKind)}`}
                        title={`Porta ${index + 1} - ${label}`}
                      />
                    )
                  })}
                </div>
                {!!rackPreviewPortTotal && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {rackPreviewLegend.map(item => (
                      <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.className}`} />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!rackTotalPorts && <p className="mt-4 text-sm text-slate-500">Informe a quantidade de portas para visualizar a ocupação.</p>}
              </div>

              <div className="grid gap-2">
                {[
                  ['Rack/switch', rackForm.nome_switch],
                  ['Localidade', rackForm.localidade_nome],
                  ['Local físico', rackForm.localizacao],
                  ['Portas ocupadas', rackUsedPorts || null],
                  ['Portas livres', rackTotalPorts ? rackFreePorts : null],
                  ['Portas reservadas', rackReservedPorts || null],
                  ['Portas de rede/acadêmicas', rackForm.portas_academicas],
                  ['Portas VLAN impressoras', rackForm.portas_vlan_impressoras],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
                    <span className="max-w-[58%] truncate text-right text-sm font-bold text-slate-900 dark:text-white">{fieldValue(value)}</span>
                  </div>
                ))}
              </div>

              {rackObs.trim() && (
                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{rackObs}</p>
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      )}

      <ChecklistMobileBottomNav
        links={[
          { label: 'Checklists', href: '/checklists-validacao', icon: ListChecks },
          { label: 'Solicitações', href: `/checklists-validacao/${data.checklist_validacao_id}`, icon: ArrowLeft },
        ]}
        value={mobileChecklistView}
        onViewChange={setMobileChecklistView}
        views={data.tipo_solicitacao === 'RACK'
          ? [
            { label: 'Validar', value: 'fill', icon: Server },
            { label: 'Preview', value: 'preview', icon: Eye },
          ]
          : [
            { label: 'Preencher', value: 'fill', icon: ListChecks },
            { label: 'Registros', value: 'preview', icon: Eye },
          ]}
      />

      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-4 left-3 right-3 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-2xl shadow-slate-950/20 dark:border-emerald-900 dark:bg-slate-900 sm:bottom-6 sm:left-auto sm:right-6 sm:mx-0"
          >
            <motion.span
              initial={{ scale: 0.4, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"
            >
              <CheckCircle2 className="h-5 w-5" />
            </motion.span>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{celebration}</p>
              <p className="text-xs text-slate-500">A ação foi registrada no checklist.</p>
            </div>
          </motion.div>
        )}

        {inspectedStation && (() => {
          const links = stationLinksByRef.get(stationRefForItem(inspectedStation)) ?? { ramais: [], monitores: [] }
          return (
            <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="max-h-[100dvh] w-full max-w-3xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-lg"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Inspeção da estação</p>
                    <h2 className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{stationRefForItem(inspectedStation)}</h2>
                    <p className="mt-1 text-sm text-slate-500">Máquina, ramal e monitores registrados nesta estação.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {data.pode_editar && (
                      <button
                        type="button"
                        onClick={() => {
                          const station = inspectedStation
                          setInspectedStation(null)
                          openEditStation(station)
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        Editar
                      </button>
                    )}
                    <button type="button" onClick={() => setInspectedStation(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[calc(100dvh-92px)] overflow-y-auto p-4 sm:max-h-[calc(90vh-92px)] sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Patrimônio', value: inspectedStation.dados_informados_json.patrimonio },
                      { label: 'Host', value: inspectedStation.dados_informados_json.hostname },
                      { label: 'IP', value: inspectedStation.dados_informados_json.ip },
                      { label: 'Modelo', value: inspectedStation.dados_informados_json.modelo },
                      { label: 'Memória', value: inspectedStation.dados_informados_json.memoria },
                      { label: 'Armazenamento', value: inspectedStation.dados_informados_json.armazenamento },
                      { label: 'Colaboradores', value: inspectedStation.dados_informados_json.colaboradores_estacao },
                      { label: 'Status', value: inspectedStation.dados_informados_json.status_observado },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
                        <strong className="mt-1 block text-sm text-slate-900 dark:text-white">{fieldValue(value)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Phone className="h-4 w-4 text-blue-500" />Ramais</h3>
                      <div className="mt-3 space-y-2">
                        {links.ramais.map(ramal => (
                          <div key={ramal.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{fieldValue(ramal.dados_informados_json.numero_ramal ?? ramal.identificador_informado)}</p>
                            <p className="mt-1 text-xs text-slate-500">{fieldValue(ramal.dados_informados_json.observacoes)}</p>
                          </div>
                        ))}
                        {links.ramais.length === 0 && <EmptyState>Sem ramal vinculado.</EmptyState>}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Monitor className="h-4 w-4 text-violet-500" />Monitores</h3>
                      <div className="mt-3 space-y-2">
                        {links.monitores.map((monitor, index) => (
                          <div key={monitor.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">Monitor {index + 1}</p>
                              <span className="text-xs text-slate-500">{fieldValue(monitor.dados_informados_json.patrimonio ?? monitor.dados_informados_json.codigo_interno)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {[monitor.dados_informados_json.marca, monitor.dados_informados_json.tamanho ?? monitor.dados_informados_json.modelo].map(fieldValue).filter(value => value !== '-').join(' · ') || 'Sem detalhes adicionais'}
                            </p>
                          </div>
                        ))}
                        {links.monitores.length === 0 && <EmptyState>Sem monitores vinculados.</EmptyState>}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}

        {modalMode === 'ESTACAO' && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              onSubmit={saveStation}
              className="flex h-[calc(100dvh-16px)] max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:h-auto sm:max-h-[92vh] sm:rounded-lg"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div className="shrink-0 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{editingItemId ? 'Editar envio' : 'Nova estação'}</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{editingItemId ? 'Estação + vínculos' : 'Máquina + vínculos'}</h2>
                    <p className="mt-1 text-sm text-slate-500">{editingItemId ? 'Atualize máquina, colaboradores, ramal e monitores desta estação.' : 'Registre somente o que existir na estação.'}</p>
                  </div>
                  <button type="button" onClick={closeModal} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
                  {visibleStationSteps.map(({ key, icon: StepIcon, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStationStep(key)}
                      className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition sm:flex-1 ${stationStep === key ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <StepIcon className="h-4 w-4" />
                      {key === 'maquina' && !cpuNoEscopo ? 'Estação' : label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:max-h-[calc(92vh-188px)] sm:p-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={stationStep}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16 }}
                    className="min-h-full rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    {stationStep === 'maquina' && !cpuNoEscopo && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Referência da estação</h3>
                          <p className="text-xs text-slate-500">A CPU não faz parte deste check. Informe host ou patrimônio só para vincular os demais itens.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <InputField field={{ key: 'hostname', label: 'Host', placeholder: 'Ex.: PC-SG-001' }} value={stationForm.hostname} onChange={value => setStationForm(current => ({ ...current, hostname: value }))} />
                          <InputField field={{ key: 'patrimonio', label: 'Patrimônio', placeholder: 'Ex.: 123456' }} value={stationForm.patrimonio} onChange={value => setStationForm(current => ({ ...current, patrimonio: value }))} />
                          <InputField field={{ key: 'observacoes', label: 'Observações gerais', placeholder: 'Contexto da estação.', span: 'full' }} value={stationForm.observacoes} onChange={value => setStationForm(current => ({ ...current, observacoes: value }))} />
                        </div>
                      </div>
                    )}

                    {stationStep === 'maquina' && cpuNoEscopo && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dados da máquina</h3>
                          <p className="text-xs text-slate-500">Campos principais para identificar a estação.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <InputField field={{ key: 'patrimonio', label: 'Patrimônio', placeholder: 'Ex.: 123456', required: true }} value={stationForm.patrimonio} onChange={value => setStationForm(current => ({ ...current, patrimonio: value }))} />
                          <InputField field={{ key: 'hostname', label: 'Host', placeholder: 'Ex.: PC-SG-001', required: true }} value={stationForm.hostname} onChange={value => setStationForm(current => ({ ...current, hostname: value }))} />
                          <InputField field={{ key: 'ip', label: 'IP', placeholder: 'Ex.: 10.0.0.25', required: true }} value={stationForm.ip} onChange={value => setStationForm(current => ({ ...current, ip: value }))} />
                          <InputField field={{ key: 'modelo', label: 'Modelo', placeholder: 'Optiplex, ThinkCentre...', required: true }} value={stationForm.modelo} onChange={value => setStationForm(current => ({ ...current, modelo: value }))} />
                          <InputField field={{ key: 'armazenamento', label: 'Armazenamento', placeholder: 'Ex.: SSD 240GB', required: true }} value={stationForm.armazenamento} onChange={value => setStationForm(current => ({ ...current, armazenamento: value }))} />
                          <InputField field={{ key: 'memoria', label: 'Memória', placeholder: 'Ex.: 8GB', required: true }} value={stationForm.memoria} onChange={value => setStationForm(current => ({ ...current, memoria: value }))} />
                          <InputField field={{ key: 'processador', label: 'Processador', placeholder: 'Opcional' }} value={stationForm.processador} onChange={value => setStationForm(current => ({ ...current, processador: value }))} />
                          <InputField field={{ key: 'status_observado', label: 'Status', placeholder: 'Em uso' }} value={stationForm.status_observado} onChange={value => setStationForm(current => ({ ...current, status_observado: value }))} />
                          <InputField field={{ key: 'observacoes', label: 'Observações gerais', placeholder: 'Detalhes físicos, inconsistências ou contexto da estação.', span: 'full' }} value={stationForm.observacoes} onChange={value => setStationForm(current => ({ ...current, observacoes: value }))} />
                        </div>
                      </div>
                    )}

                    {stationStep === 'ramal' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ramal da estação</h3>
                          <p className="text-xs text-slate-500">Busque pelo número do ramal ou marque como inexistente.</p>
                        </div>
                        <SoftCheck
                          checked={semRamal}
                          label="Esta estação não possui ramal"
                          onChange={checked => {
                              setSemRamal(checked)
                              if (checked) {
                                setSelectedRamal(null)
                                setRamalSearch('')
                                setRamalResults([])
                              }
                          }}
                        />
                        {!semRamal && (
                          <div className="space-y-3">
                            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <span>Buscar ramal</span>
                              <input value={ramalSearch} onChange={event => setRamalSearch(event.target.value)} placeholder="Digite o número do ramal" className={inputClass()} />
                            </label>
                            {selectedRamal && (
                              <div className="flex items-start justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm shadow-sm dark:border-blue-900 dark:bg-blue-950/30">
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-300">Ramal selecionado</span>
                                  <p className="mt-1 text-base font-bold text-blue-950 dark:text-blue-100">{selectedRamal.numero_ramal}</p>
                                  <p className="mt-1 truncate text-xs text-blue-700/80 dark:text-blue-200/70">{selectedRamal.setor_nome ?? selectedRamal.alocacao_ativa?.colaborador?.nome ?? 'Sem alocação visível'}</p>
                                </div>
                                <button type="button" onClick={() => { setSelectedRamal(null); setRamalSearch('') }} className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-900/50">Remover</button>
                              </div>
                            )}
                            {ramalLoading && (
                              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                Buscando ramais...
                              </div>
                            )}
                            {ramalResults.length > 0 && (
                              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                                {ramalResults.map(ramal => (
                                  <button key={ramal.id} type="button" onClick={() => selectRamal(ramal)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950">
                                    <span className="font-semibold text-slate-900 dark:text-white">{ramal.numero_ramal}</span>
                                    <span className="truncate text-xs text-slate-500">{ramal.setor_nome ?? ramal.alocacao_ativa?.colaborador?.nome ?? 'Sem alocação visível'}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <InputField field={{ key: 'ramal_observacoes', label: 'Observações do ramal', placeholder: 'Mesa, sala, posição...' }} value={stationForm.ramal_observacoes} onChange={value => setStationForm(current => ({ ...current, ramal_observacoes: value }))} />
                          </div>
                        )}
                      </div>
                    )}

                    {stationStep === 'colaboradores' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Colaboradores da estação</h3>
                          <p className="text-xs text-slate-500">Busque por nome ou código de pessoa.</p>
                        </div>
                        <SoftCheck
                          checked={semColaborador}
                          label="Esta estação não possui colaborador alocado"
                          onChange={checked => {
                              setSemColaborador(checked)
                              if (checked) {
                                setSelectedColaboradores([])
                                setColaboradorSearch('')
                                setColaboradorResults([])
                              }
                          }}
                        />
                        {!semColaborador && (
                          <>
                            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <span>Buscar colaborador</span>
                              <input value={colaboradorSearch} onChange={event => setColaboradorSearch(event.target.value)} placeholder="Digite nome ou código de pessoa" className={inputClass()} />
                            </label>
                            {selectedColaboradores.length > 0 && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {selectedColaboradores.map(colaborador => (
                                  <div key={colaborador.id} className="flex items-start justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-950/30">
                                    <div className="min-w-0">
                                      <span className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-300">Colaborador alocado</span>
                                      <p className="mt-1 truncate text-sm font-bold text-blue-950 dark:text-blue-100">{colaborador.nome}</p>
                                      <p className="mt-1 truncate text-xs text-blue-700/80 dark:text-blue-200/70">{colaborador.setor_nome ?? 'Sem setor'}{colaborador.codigo ? ` · ${colaborador.codigo}` : ''}</p>
                                    </div>
                                    <button type="button" onClick={() => removeColaborador(colaborador.id)} className="rounded-lg p-1 text-blue-600 transition hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900/50">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {colaboradorLoading && (
                              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                Buscando colaboradores...
                              </div>
                            )}
                            {colaboradorResults.length > 0 && (
                              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                                {colaboradorResults.map(colaborador => (
                                  <button key={colaborador.id} type="button" onClick={() => addColaborador(colaborador)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950">
                                    <span className="min-w-0">
                                      <span className="block truncate font-semibold text-slate-900 dark:text-white">{colaborador.nome}</span>
                                      <span className="block truncate text-xs text-slate-500">{colaborador.setor_nome ?? 'Sem setor'}{colaborador.codigo ? ` · ${colaborador.codigo}` : ''}</span>
                                    </span>
                                    <Plus className="h-4 w-4 shrink-0 text-blue-600" />
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950/60">
                              <UserRound className="mb-2 h-4 w-4 text-slate-400" />
                              É possível selecionar mais de um colaborador para a mesma estação.
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {stationStep === 'monitores' && (
                      <div className="space-y-4">
                        <SoftCheck checked={semMonitores} label="Esta estação não possui monitores" onChange={setSemMonitores} />
                        {!semMonitores && (
                          <>
                          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
                            {[1, 2, 3].map(count => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setMonitorCount(count as 1 | 2 | 3)}
                                className={`rounded-lg px-3 py-3 text-sm font-semibold transition ${monitorCount === count ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                              >
                                {count} monitor{count > 1 ? 'es' : ''}
                              </button>
                            ))}
                          </div>
                          <div className="grid gap-4 lg:grid-cols-2">
                            {Array.from({ length: monitorCount }, (_, item) => item + 1).map(index => (
                              <div key={index} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950/60">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Monitor {index}</h3>
                                  <button type="button" onClick={() => generateMonitorCode(`monitor_${index}_patrimonio`)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300">
                                    Gerar patrimônio
                                  </button>
                                </div>
                                <div className="grid gap-3">
                                  <InputField field={{ key: `monitor_${index}_patrimonio`, label: 'Patrimônio', placeholder: 'Opcional' }} value={stationForm[`monitor_${index}_patrimonio`]} onChange={value => setStationForm(current => ({ ...current, [`monitor_${index}_patrimonio`]: value }))} />
                                  <InputField field={{ key: `monitor_${index}_marca`, label: 'Marca', placeholder: 'Dell, LG...' }} value={stationForm[`monitor_${index}_marca`]} onChange={value => setStationForm(current => ({ ...current, [`monitor_${index}_marca`]: value }))} />
                                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                                    <span>Tamanho</span>
                                    <select
                                      value={stationForm[`monitor_${index}_tamanho`]}
                                      onChange={event => setStationForm(current => ({ ...current, [`monitor_${index}_tamanho`]: event.target.value }))}
                                      className={inputClass()}
                                    >
                                      <option value="">Selecione</option>
                                      <option value="pequeno">Pequeno</option>
                                      <option value="medio">Médio</option>
                                      <option value="grande">Grande</option>
                                    </select>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:p-5">
                <ActionButton onClick={closeModal}>Cancelar</ActionButton>
                <ActionButton disabled={saving} icon={saving ? Loader2 : Save} type="submit" tone="primary">
                  {saving ? 'Salvando...' : editingItemId ? 'Atualizar envio' : 'Salvar estação'}
                </ActionButton>
              </div>
            </motion.form>
          </motion.div>
        )}

        {modalMode === 'IMPRESSORA' && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              onSubmit={savePrinter}
              className="flex h-[calc(100dvh-16px)] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:h-auto sm:max-h-[88vh] sm:rounded-lg"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Nova impressora</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Validação de impressora</h2>
                  <p className="mt-1 text-sm text-slate-500">Registre o equipamento encontrado no setor.</p>
                </div>
                <button type="button" onClick={closeModal} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <InputField field={{ key: 'patrimonio', label: 'Patrimônio/SELB', placeholder: 'Identificador físico', required: true }} value={printerForm.patrimonio} onChange={value => setPrinterForm(current => ({ ...current, patrimonio: value }))} />
                  <InputField field={{ key: 'nome_rede', label: 'Nome/Rede', placeholder: 'Ex.: PRN-SG-01', required: true }} value={printerForm.nome_rede} onChange={value => setPrinterForm(current => ({ ...current, nome_rede: value }))} />
                  <InputField field={{ key: 'ip', label: 'IP', placeholder: 'Ex.: 10.0.0.10', required: true }} value={printerForm.ip} onChange={value => setPrinterForm(current => ({ ...current, ip: value }))} />
                  <InputField field={{ key: 'modelo', label: 'Modelo', required: true }} value={printerForm.modelo} onChange={value => setPrinterForm(current => ({ ...current, modelo: value }))} />
                  <InputField field={{ key: 'status_observado', label: 'Status observado' }} value={printerForm.status_observado} onChange={value => setPrinterForm(current => ({ ...current, status_observado: value }))} />
                  <InputField field={{ key: 'observacoes', label: 'Observações', span: 'full' }} value={printerForm.observacoes} onChange={value => setPrinterForm(current => ({ ...current, observacoes: value }))} />
                </div>
              </div>
              <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:p-5">
                <ActionButton onClick={closeModal}>Cancelar</ActionButton>
                <ActionButton icon={Save} type="submit" tone="primary">{editingItemId ? 'Atualizar impressora' : 'Salvar impressora'}</ActionButton>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
