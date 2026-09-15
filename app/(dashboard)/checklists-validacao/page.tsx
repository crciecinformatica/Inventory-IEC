'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Filter,
  ListChecks,
  MapPin,
  PackageCheck,
  Plus,
  Server,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { usePermission } from '@/hooks/use-permission'
import { ChecklistNavPills } from '@/components/checklists/checklist-nav-pills'
import { ChecklistMobileBottomNav } from '@/components/checklists/checklist-mobile-bottom-nav'
import { ChecklistContextOverview, type ChecklistContextMetric } from '@/components/checklists/checklist-context-overview'
import { ChecklistCreateModal } from '@/components/checklists/checklist-create-modal'

type Checklist = {
  id: string
  nome: string
  localidade_nome: string | null
  status: string
  incluir_racks: boolean
  data_inicio: string | null
  total_solicitacoes: number
  finalizadas: number
  revisadas: number
}

type PeriodFilter = 'todos' | 'mes' | 'trimestre' | 'ano'
type StatusFilter = 'todos' | 'abertos' | 'finalizados'
type MobileChecklistSection = 'overview' | 'criar' | 'checklists'

const periodOptions: Array<{ label: string; value: PeriodFilter }> = [
  { label: 'Todo o período', value: 'todos' },
  { label: 'Este mês', value: 'mes' },
  { label: 'Últimos 90 dias', value: 'trimestre' },
  { label: 'Este ano', value: 'ano' },
]

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: 'Todos', value: 'todos' },
  { label: 'Abertos', value: 'abertos' },
  { label: 'Finalizados', value: 'finalizados' },
]

function formatDate(value: string | null) {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value))
}

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function progressPercent(done: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

function statusTone(status: string) {
  if (status === 'finalizado') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
}

function cycleIsInPeriod(item: Checklist, period: PeriodFilter) {
  if (period === 'todos') return true
  const date = parseDate(item.data_inicio)
  if (!date) return false

  const now = new Date()
  if (period === 'mes') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  if (period === 'ano') {
    return date.getFullYear() === now.getFullYear()
  }

  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(now.getDate() - 90)
  return date >= ninetyDaysAgo && date <= now
}

function MetricCard({
  className = '',
  icon: Icon,
  label,
  value,
}: {
  className?: string
  icon: LucideIcon
  label: string
  value: number | string
}) {
  const compact = String(value).length > 12

  return (
    <div className={`min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50 ${className}`}>
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <strong title={String(value)} className={`mt-1 block font-black text-slate-900 dark:text-white ${compact ? 'line-clamp-2 text-xs leading-5' : 'text-sm'}`}>{value}</strong>
    </div>
  )
}

function CycleProgress({ percent }: { percent: number }) {
  return (
    <div
      className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-1"
      style={{
        background: `conic-gradient(rgb(37 99 235) ${percent * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`,
      }}
      aria-label={`Progresso ${percent}%`}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-inner dark:bg-slate-950">
        <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">{percent}%</span>
      </div>
    </div>
  )
}

function SelectFilter({
  icon: Icon,
  label,
  onChange,
  options,
  value,
}: {
  icon?: LucideIcon
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={event => onChange(event.target.value)}
          className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-11 text-sm font-black text-slate-800 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:border-slate-700"
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  )
}

function SegmentedFilter<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  value: T
}) {
  return (
    <div className="grid h-14 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-950/70" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative min-w-0 rounded-xl px-3 text-sm font-black transition active:scale-95 ${
              active ? 'text-blue-700 dark:text-blue-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId="checklist-status-filter"
                className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slate-800/95"
                transition={{ duration: 0.18, ease: 'easeOut' }}
              />
            )}
            <span className="relative truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ChecklistCard({ item }: { item: Checklist }) {
  const progress = progressPercent(item.finalizadas, item.total_solicitacoes)
  const openingDate = formatDate(item.data_inicio)

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="h-full">
      <Link
        href={`/checklists-validacao/${item.id}`}
        className="group flex h-full min-h-[308px] flex-col rounded-3xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 sm:p-5"
      >
        <div className="flex items-start gap-4">
          <CycleProgress percent={progress} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(item.status)}`}>{item.status}</span>
              {item.incluir_racks && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700">
                  <Server className="h-3.5 w-3.5" />
                  racks
                </span>
              )}
            </div>
            <h2 className="mt-3 line-clamp-2 text-xl font-black tracking-tight text-slate-900 transition group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
              {item.nome}
            </h2>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-slate-500 dark:text-slate-400">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.localidade_nome ?? 'Sem localidade'}</span>
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <MetricCard icon={PackageCheck} label="Solicitações" value={item.total_solicitacoes} />
          <MetricCard icon={CheckCircle2} label="Finalizadas" value={`${item.finalizadas}/${item.total_solicitacoes}`} />
          <MetricCard icon={ClipboardCheck} label="Revisadas" value={item.revisadas} />
          <MetricCard className="col-span-2" icon={Clock3} label="Abertura" value={openingDate} />
        </div>

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <span>Progresso do ciclo</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-blue-600"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 dark:border-slate-800">
            <span>Abrir ciclo</span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-300" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function MobileSectionHeader({
  description,
  eyebrow,
  title,
}: {
  description?: string
  eyebrow: string
  title: string
}) {
  return (
    <div className="lg:hidden">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="mt-2 text-sm font-medium leading-6 text-slate-400">{description}</p>}
    </div>
  )
}

export default function ChecklistsValidacaoPage() {
  const { isAdmin } = usePermission()
  const [data, setData] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [mobileSection, setMobileSection] = useState<MobileChecklistSection>('overview')
  const [localidadeFilter, setLocalidadeFilter] = useState('todas')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checklists-validacao?limit=100', { cache: 'no-store' })
      if (!res.ok) {
        setData([])
        return
      }
      const json = await res.json()
      setData(Array.isArray(json.data) ? json.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!isAdmin && mobileSection === 'criar') setMobileSection('overview')
  }, [isAdmin, mobileSection])

  const defaultName = useMemo(() => {
    const sem = new Date().getMonth() < 6 ? '1' : '2'
    return `Checklist de Validação - ${new Date().getFullYear()}.${sem}`
  }, [])

  const localidades = useMemo(() => (
    Array.from(new Set(data.map(item => item.localidade_nome).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
  ), [data])

  const filteredData = useMemo(() => (
    data.filter(item => {
      const matchesLocalidade = localidadeFilter === 'todas' || item.localidade_nome === localidadeFilter
      const matchesPeriod = cycleIsInPeriod(item, periodFilter)
      const matchesStatus = statusFilter === 'todos'
        || (statusFilter === 'abertos' && item.status !== 'finalizado')
        || (statusFilter === 'finalizados' && item.status === 'finalizado')
      return matchesLocalidade && matchesPeriod && matchesStatus
    })
  ), [data, localidadeFilter, periodFilter, statusFilter])

  const totals = useMemo(() => {
    const solicitacoes = filteredData.reduce((sum, item) => sum + item.total_solicitacoes, 0)
    const finalizadas = filteredData.reduce((sum, item) => sum + item.finalizadas, 0)
    const revisadas = filteredData.reduce((sum, item) => sum + item.revisadas, 0)
    return {
      abertos: filteredData.filter(item => item.status !== 'finalizado').length,
      ciclos: filteredData.length,
      finalizadas,
      progresso: progressPercent(finalizadas, solicitacoes),
      revisadas,
      solicitacoes,
    }
  }, [filteredData])

  const overviewMetrics: ChecklistContextMetric[] = [
    {
      icon: CalendarCheck,
      label: 'Ciclos',
      value: totals.ciclos,
      percent: progressPercent(totals.ciclos, data.length),
      helper: `${totals.ciclos}/${data.length} no filtro`,
    },
    {
      icon: Clock3,
      label: 'Abertos',
      value: totals.abertos,
      percent: progressPercent(totals.abertos, Math.max(totals.ciclos, 1)),
      helper: `${progressPercent(totals.abertos, Math.max(totals.ciclos, 1))}% dos ciclos`,
      tone: 'amber',
    },
    {
      icon: PackageCheck,
      label: 'Solicitações',
      value: totals.solicitacoes,
      percent: totals.progresso,
      helper: `${totals.finalizadas}/${totals.solicitacoes} finalizadas`,
      tone: 'blue',
    },
    {
      icon: ClipboardCheck,
      label: 'Revisadas',
      value: totals.revisadas,
      percent: progressPercent(totals.revisadas, totals.solicitacoes),
      helper: `${progressPercent(totals.revisadas, totals.solicitacoes)}% revisado`,
      tone: 'violet',
    },
    {
      icon: CheckCircle2,
      label: 'Concluídas',
      value: totals.finalizadas,
      percent: totals.progresso,
      helper: `${totals.progresso}% concluído`,
      tone: 'emerald',
    },
  ]

  const filterActions = (
    <div className="grid w-full items-end gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.78fr)_minmax(280px,0.95fr)] xl:w-[860px]">
      <SelectFilter
        icon={MapPin}
        label="Localidade"
        value={localidadeFilter}
        onChange={setLocalidadeFilter}
        options={[
          { label: 'Todas as localidades', value: 'todas' },
          ...localidades.map(localidade => ({ label: localidade, value: localidade })),
        ]}
      />
      <SelectFilter
        icon={CalendarCheck}
        label="Período"
        value={periodFilter}
        onChange={value => setPeriodFilter(value as PeriodFilter)}
        options={periodOptions}
      />
      <label className="min-w-0 space-y-2">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          Status
        </span>
        <SegmentedFilter value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
      </label>
    </div>
  )

  const mobileViews = useMemo<Array<{ icon: LucideIcon; label: string; value: MobileChecklistSection }>>(() => {
    const views: Array<{ icon: LucideIcon; label: string; value: MobileChecklistSection }> = [
      { label: 'Overview', value: 'overview', icon: CalendarCheck },
      { label: 'Inspecionar', value: 'checklists', icon: ListChecks },
    ]

    if (isAdmin) {
      views.splice(1, 0, { label: 'Criar', value: 'criar', icon: Plus })
    }

    return views
  }, [isAdmin])

  async function handleCreated() {
    setShowCreate(false)
    setMobileSection('checklists')
    await load()
  }

  function closeCreate() {
    setShowCreate(false)
    if (mobileSection === 'criar') setMobileSection('overview')
  }

  function renderChecklistSection(mobile = false) {
    return (
      <section className="space-y-3">
        {mobile && (
          <MobileSectionHeader
            eyebrow="Checklists"
            title="Ciclos"
          />
        )}

        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{mobile ? 'Inspeção' : 'Ciclos'}</h2>
            <p className="text-sm text-slate-500">
              {loading ? 'Carregando ciclos...' : `${filteredData.length} ciclo${filteredData.length !== 1 ? 's' : ''} no filtro atual.`}
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 dark:border-slate-800">
            <Filter className="h-3.5 w-3.5" />
            {localidadeFilter === 'todas' ? 'Todas as localidades' : localidadeFilter}
          </span>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Carregando checklists...</div>
        ) : data.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <CalendarCheck className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">Nenhum checklist criado ainda.</p>
            <p className="mt-1 text-sm text-slate-500">Crie o primeiro ciclo para gerar as solicitações de validação.</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <Filter className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">Nenhum checklist encontrado nesse filtro.</p>
            <p className="mt-1 text-sm text-slate-500">Ajuste localidade, tempo ou status para ampliar a visão.</p>
          </div>
        ) : (
          <motion.div layout className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredData.map(item => <ChecklistCard key={item.id} item={item} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-3 pb-28 pt-4 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-6 lg:px-10">
      {isAdmin && <ChecklistNavPills className="hidden lg:block" items={[{ label: 'Checklists' }, { label: 'Validação' }]} />}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            <ListChecks className="h-3.5 w-3.5" />
            Validação de inventário
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">Checklists de Validação</h1>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-700 active:scale-95 lg:inline-flex"
          >
            <Plus className="h-5 w-5" />
            Criar checklist
          </button>
        )}
      </header>

      <div className="hidden space-y-6 lg:block">
        <ChecklistContextOverview
          eyebrow="Overview"
          title="Resumo"
          description={`${filteredData.length} ciclo${filteredData.length !== 1 ? 's' : ''} · ${totals.progresso}% concluído`}
          metrics={overviewMetrics}
          actions={filterActions}
        />

        {renderChecklistSection()}
      </div>

      <div className="lg:hidden">
        <AnimatePresence mode="wait" initial={false}>
          {mobileSection === 'overview' && (
            <motion.section
              key="mobile-overview"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-4"
            >
              <MobileSectionHeader
                eyebrow="Overview"
                title="Resumo"
              />
              <ChecklistContextOverview
                eyebrow="Ciclos"
                title="Resumo"
                description={`${filteredData.length} ciclo${filteredData.length !== 1 ? 's' : ''} · ${totals.progresso}% concluído`}
                metrics={overviewMetrics}
                actions={filterActions}
              />
            </motion.section>
          )}

          {mobileSection === 'criar' && isAdmin && (
            <motion.section
              key="mobile-create"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-4"
            >
              <MobileSectionHeader
                eyebrow="Criar"
                title="Novo ciclo"
              />
              <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm leading-6 text-slate-500">Escolha a unidade, os setores com os itens de cada estação, os racks e se haverá revisão de estoque.</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 active:scale-95"
                >
                  <Plus className="h-5 w-5" />
                  Abrir checklist
                </button>
              </div>
            </motion.section>
          )}

          {mobileSection === 'checklists' && (
            <motion.div
              key="mobile-checklists"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {renderChecklistSection(true)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isAdmin && (
        <ChecklistCreateModal
          open={showCreate}
          defaultName={defaultName}
          onClose={closeCreate}
          onCreated={handleCreated}
        />
      )}

      <ChecklistMobileBottomNav
        links={[]}
        value={mobileSection}
        onViewChange={section => {
          setMobileSection(section)
          if (section === 'criar') setShowCreate(true)
        }}
        views={mobileViews}
      />
    </div>
  )
}
