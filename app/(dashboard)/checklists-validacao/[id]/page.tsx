'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BarChart3, CheckCircle2, ListChecks, PackageCheck, Server, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { usePermission } from '@/hooks/use-permission'
import { ChecklistNavPills } from '@/components/checklists/checklist-nav-pills'
import { ChecklistMobileBottomNav } from '@/components/checklists/checklist-mobile-bottom-nav'
import { ChecklistContextOverview, type ChecklistContextMetric } from '@/components/checklists/checklist-context-overview'
import { RackSidebarCard, SolicitacaoCard, type ChecklistSolicitacaoResumo } from '@/components/checklists/checklist-overview-cards'

type Checklist = {
  id: string
  nome: string
  status: string
  localidade_nome: string | null
  solicitacoes: ChecklistSolicitacaoResumo[]
}

type OverviewStatusFilter = 'todos' | 'pendentes' | 'assumidas' | 'finalizadas'
type MobileChecklistView = 'overview' | 'setores' | 'racks'
type FilterOption = { count: number; label: string; value: OverviewStatusFilter }

function matchesOverviewStatus(solicitacao: ChecklistSolicitacaoResumo, filter: OverviewStatusFilter) {
  if (filter === 'todos') return true
  if (filter === 'pendentes') return solicitacao.status === 'aberta'
  if (filter === 'assumidas') return solicitacao.status === 'assumida'
  return solicitacao.status === 'finalizada' || solicitacao.status === 'revisada'
}

function progressPercent(done: number, total: number) {
  if (total > 0) return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  return done > 0 ? 100 : 0
}

function aggregateCoverage(solicitacoes: ChecklistSolicitacaoResumo[]) {
  let done = 0
  let total = 0

  for (const solicitacao of solicitacoes) {
    const cobertura = solicitacao.cobertura
    if (!cobertura) continue

    if (solicitacao.tipo_solicitacao === 'RACK') {
      total += 1
      done += cobertura.preenchido.rack ? 1 : 0
      continue
    }

    done += cobertura.preenchido.maquinas + cobertura.preenchido.ramais + cobertura.preenchido.monitores + cobertura.preenchido.impressoras + (cobertura.preenchido.notebooks ?? 0) + (cobertura.preenchido.aparelhos ?? 0)
    total += cobertura.previsto.maquinas + cobertura.previsto.ramais + cobertura.previsto.monitores + cobertura.previsto.impressoras + (cobertura.previsto.notebooks ?? 0) + (cobertura.previsto.aparelhos ?? 0)
  }

  if (total > 0) return progressPercent(done, total)
  if (!solicitacoes.length) return 0

  return Math.round(solicitacoes.reduce((sum, solicitacao) => sum + (solicitacao.cobertura?.percentual ?? 0), 0) / solicitacoes.length)
}

function countStats(solicitacoes: ChecklistSolicitacaoResumo[]) {
  return {
    total: solicitacoes.length,
    setores: solicitacoes.filter(s => s.tipo_solicitacao === 'SETOR').length,
    racks: solicitacoes.filter(s => s.tipo_solicitacao === 'RACK').length,
    estoque: solicitacoes.filter(s => s.tipo_solicitacao === 'ESTOQUE').length,
    pendentes: solicitacoes.filter(s => s.status === 'aberta').length,
    assumidas: solicitacoes.filter(s => s.status === 'assumida').length,
    finalizadas: solicitacoes.filter(s => s.status === 'finalizada' || s.status === 'revisada').length,
  }
}

function filterOptionsFromStats(stats: ReturnType<typeof countStats>): FilterOption[] {
  return [
    { value: 'todos', label: 'Todos', count: stats.total },
    { value: 'pendentes', label: 'Pendentes', count: stats.pendentes },
    { value: 'assumidas', label: 'Assumidas', count: stats.assumidas },
    { value: 'finalizadas', label: 'Finalizadas', count: stats.finalizadas },
  ]
}

function OverviewFilterBar({
  layoutId = 'checklist-overview-filter-pill',
  options,
  statusFilter,
  onChange,
}: {
  layoutId?: string
  onChange: (value: OverviewStatusFilter) => void
  options: FilterOption[]
  statusFilter: OverviewStatusFilter
}) {
  return (
    <div className="grid max-w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950/60 sm:inline-grid sm:grid-cols-4">
      {options.map(option => {
        const active = statusFilter === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${
              active ? 'text-blue-700 dark:text-blue-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-blue-50 shadow-sm dark:bg-blue-950/40"
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
            )}
            <span className="relative inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap">
              <span className="truncate">{option.label}</span>
              <span className="shrink-0 text-[11px] opacity-70">{option.count}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MobileChecklistHeader({
  checklist,
  progress,
  stats,
}: {
  checklist: Checklist
  progress: number
  stats: ReturnType<typeof countStats>
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900/80 lg:hidden"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <BarChart3 className="h-3.5 w-3.5" />
              Ciclo ativo
            </span>
            <h1 className="mt-3 line-clamp-2 text-[2rem] font-black leading-[1.05] tracking-tight text-slate-950 dark:text-white">
              {checklist.nome}
            </h1>
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              {checklist.localidade_nome ?? 'Localidade'} · {stats.finalizadas}/{stats.total} solicitações finalizadas
            </p>
          </div>

          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-1"
            style={{
              background: `conic-gradient(rgb(37 99 235) ${progress * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`,
            }}
            aria-label={`Progresso geral ${progress}%`}
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-inner dark:bg-slate-950">
              <span className="text-sm font-black text-slate-950 dark:text-white">{progress}%</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ['Setores', stats.setores],
            ['Racks', stats.racks],
            ['Assumidas', stats.assumidas],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
              <strong className="mt-1 block text-xl font-black text-slate-950 dark:text-white">{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </motion.header>
  )
}

export default function ChecklistDetalhePage() {
  const params = useParams<{ id: string }>()
  const { isAdmin } = usePermission()
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileOverviewView, setMobileOverviewView] = useState<MobileChecklistView>('overview')
  const [statusFilter, setStatusFilter] = useState<OverviewStatusFilter>('todos')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/checklists-validacao/${params.id}`)
    if (res.ok) setChecklist(await res.json())
    setLoading(false)
  }, [params.id])

  useEffect(() => { void load() }, [load])

  async function finalizar() {
    const res = await fetch(`/api/checklists-validacao/${params.id}/finalizar`, { method: 'PATCH' })
    if (res.ok) await load()
    else alert((await res.json().catch(() => ({}))).error ?? 'Erro ao finalizar')
  }

  const stats = useMemo(() => {
    const solicitacoes = checklist?.solicitacoes ?? []
    return countStats(solicitacoes)
  }, [checklist])

  if (loading) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Carregando checklist...</div>
  if (!checklist) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Checklist não encontrado.</div>

  const setores = checklist.solicitacoes.filter(s => s.tipo_solicitacao !== 'RACK')
  const racks = checklist.solicitacoes.filter(s => s.tipo_solicitacao === 'RACK')
  const mobileFilterScope = mobileOverviewView === 'setores' ? setores : mobileOverviewView === 'racks' ? racks : checklist.solicitacoes
  const filteredSolicitacoes = checklist.solicitacoes.filter(s => matchesOverviewStatus(s, statusFilter))
  // Estoque aparece junto dos setores, antes deles.
  const filteredSetores = setores
    .filter(s => matchesOverviewStatus(s, statusFilter))
    .sort((a, b) => Number(b.tipo_solicitacao === 'ESTOQUE') - Number(a.tipo_solicitacao === 'ESTOQUE'))
  const filteredRacks = racks.filter(s => matchesOverviewStatus(s, statusFilter))
  const progress = stats.total > 0 ? Math.round((stats.finalizadas / stats.total) * 100) : 0
  const filteredStats = countStats(filteredSolicitacoes)
  const mobileFilterStats = countStats(mobileFilterScope)
  const overviewFillProgress = aggregateCoverage(filteredSolicitacoes)
  const setoresFillProgress = aggregateCoverage(filteredSetores)
  const racksFillProgress = aggregateCoverage(filteredRacks)
  const isFiltered = statusFilter !== 'todos'
  const filterOptions = filterOptionsFromStats(stats)
  const mobileFilterOptions = filterOptionsFromStats(mobileFilterStats)
  const mobileSectionTitle = mobileOverviewView === 'racks' ? 'Racks do checklist' : 'Setores do checklist'
  const mobileSectionDescription = mobileOverviewView === 'racks'
    ? `Exibindo ${filteredRacks.length}/${racks.length} racks no filtro atual.`
    : `Exibindo ${filteredSetores.length}/${setores.length} setores no filtro atual.`
  const overviewMetrics: ChecklistContextMetric[] = [
    {
      icon: PackageCheck,
      label: 'Solicitações',
      value: isFiltered ? filteredStats.total : stats.total,
      percent: isFiltered ? progressPercent(filteredStats.total, stats.total) : overviewFillProgress,
      helper: isFiltered ? `${filteredStats.total}/${stats.total} no filtro` : `${overviewFillProgress}% preenchido`,
    },
    {
      icon: ListChecks,
      label: 'Setores',
      value: isFiltered ? filteredStats.setores : stats.setores,
      percent: isFiltered ? progressPercent(filteredStats.setores, stats.setores) : setoresFillProgress,
      helper: isFiltered ? `${filteredStats.setores}/${stats.setores} setores` : `${setoresFillProgress}% dos itens previstos`,
    },
    {
      icon: Server,
      label: 'Racks',
      value: isFiltered ? filteredStats.racks : stats.racks,
      percent: isFiltered ? progressPercent(filteredStats.racks, stats.racks) : racksFillProgress,
      helper: isFiltered ? `${filteredStats.racks}/${stats.racks} racks` : `${racksFillProgress}% com resposta salva`,
      tone: 'violet',
    },
    {
      icon: CheckCircle2,
      label: 'Finalizadas',
      value: isFiltered ? filteredStats.finalizadas : stats.finalizadas,
      percent: progressPercent(isFiltered ? filteredStats.finalizadas : stats.finalizadas, stats.total),
      helper: `${isFiltered ? filteredStats.finalizadas : stats.finalizadas}/${stats.total} encerradas`,
      tone: 'emerald',
    },
    {
      icon: UserRound,
      label: 'Assumidas',
      value: isFiltered ? filteredStats.assumidas : stats.assumidas,
      percent: progressPercent(isFiltered ? filteredStats.assumidas : stats.assumidas, stats.total),
      helper: `${isFiltered ? filteredStats.assumidas : stats.assumidas}/${stats.total} com técnico`,
      tone: 'amber',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-28 pt-6 sm:px-6 sm:pb-10 lg:px-10">
      {isAdmin && (
        <ChecklistNavPills className="hidden lg:block" items={[
          { label: 'Checklists', href: '/checklists-validacao' },
          { label: checklist.nome },
        ]} />
      )}
      <MobileChecklistHeader checklist={checklist} progress={progress} stats={stats} />

      <div className="hidden flex-col gap-3 lg:flex lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{checklist.nome}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{checklist.localidade_nome ?? 'Localidade'} · {stats.finalizadas}/{stats.total} solicitações finalizadas</p>
        </div>
        {isAdmin && checklist.status !== 'finalizado' && (
          <button onClick={finalizar} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Finalizar</button>
        )}
      </div>

      <ChecklistContextOverview
        className={`${mobileOverviewView === 'overview' ? 'block' : 'hidden'} lg:block`}
        eyebrow="Overview do ciclo"
        title="Progresso geral"
        description={isFiltered
          ? `${filteredStats.total}/${stats.total} solicitações no filtro · ${overviewFillProgress}% preenchido nesse recorte`
          : `${stats.finalizadas}/${stats.total} solicitações finalizadas · ${overviewFillProgress}% preenchido`}
        metrics={overviewMetrics}
        actions={(
          <OverviewFilterBar
            layoutId="checklist-overview-filter-pill-main"
            options={filterOptions}
            statusFilter={statusFilter}
            onChange={setStatusFilter}
          />
        )}
      />

      <section className={`${mobileOverviewView === 'overview' ? 'hidden' : 'space-y-4'} lg:block lg:space-y-4`}>
        <div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="hidden text-base font-semibold text-slate-900 dark:text-white lg:block">Solicitações do checklist</h2>
              <p className="hidden text-sm text-slate-500 lg:block">
                Exibindo {filteredStats.setores} setores, {filteredRacks.length} racks{stats.estoque ? ` e ${filteredStats.estoque} revisão de estoque` : ''} no filtro atual.
              </p>
              <div className="lg:hidden">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">{mobileOverviewView === 'racks' ? 'Racks' : 'Setores'}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{mobileSectionTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">{mobileSectionDescription}</p>
              </div>
            </div>
            <div className="lg:hidden">
              <OverviewFilterBar
                layoutId="checklist-overview-filter-pill-mobile-section"
                options={mobileFilterOptions}
                statusFilter={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[1fr_340px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`setores-${statusFilter}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: mobileOverviewView === 'setores' ? 1 : 0.96, y: mobileOverviewView === 'setores' ? 0 : 8 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`${mobileOverviewView === 'setores' ? 'grid' : 'hidden'} auto-rows-fr content-start items-stretch gap-4 md:grid-cols-2 lg:grid 2xl:grid-cols-3`}
            >
              {filteredSetores.map(s => <SolicitacaoCard key={s.id} solicitacao={s} />)}
              {filteredSetores.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 md:col-span-2 2xl:col-span-3">
                  Nenhum setor nesse filtro.
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <motion.aside
            initial={false}
            animate={{ opacity: mobileOverviewView === 'racks' ? 1 : 0.96, y: mobileOverviewView === 'racks' ? 0 : 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`${mobileOverviewView === 'racks' ? 'block' : 'hidden'} rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block xl:sticky xl:top-6`}
          >
            <div className="border-b border-slate-100 p-4 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Server className="h-4 w-4 text-blue-500" />Racks</h3>
              <p className="mt-1 text-xs text-slate-500">{racks.length} solicitações por localidade</p>
            </div>
            <div className="grid auto-rows-fr gap-3 p-3 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
              <AnimatePresence>
                {filteredRacks.map(s => <RackSidebarCard key={s.id} solicitacao={s} />)}
              </AnimatePresence>
              {filteredRacks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                  Nenhum rack nesse filtro.
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      </section>

      <ChecklistMobileBottomNav
        links={[
          { label: 'Checklists', href: '/checklists-validacao', icon: ListChecks },
        ]}
        value={mobileOverviewView}
        onViewChange={setMobileOverviewView}
        views={[
          { label: 'Overview', value: 'overview', icon: BarChart3 },
          { label: `Setores ${filteredSetores.length}`, value: 'setores', icon: ListChecks },
          { label: `Racks ${filteredRacks.length}`, value: 'racks', icon: Server },
        ]}
      />
    </div>
  )
}
