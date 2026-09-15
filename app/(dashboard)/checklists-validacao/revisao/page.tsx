'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, GitCompareArrows, Laptop, ListChecks, Monitor, Phone, Printer, Server, Smartphone, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { ChecklistNavPills } from '@/components/checklists/checklist-nav-pills'
import { ChecklistContextOverview, type ChecklistContextMetric } from '@/components/checklists/checklist-context-overview'

type Cobertura = {
  previsto: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; racks: number; portas: number }
  preenchido: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; rack: number }
  percentual: number
}

type SolicitacaoRevisao = {
  id: string
  checklist_validacao_id: string
  tipo_solicitacao: 'SETOR' | 'RACK' | 'ESTOQUE'
  titulo?: string
  status: string
  status_revisao: string
  atualizado_em: string | null
  finalizado_em: string | null
  revisado_em: string | null
  revisor_nome: string | null
  assimilada?: boolean
  assimilado_por_nome?: string | null
  assimilado_em?: string | null
  planner_status: string
  setor_nome: string | null
  rack_nome: string | null
  tecnico_nome: string | null
  checklist_nome: string | null
  localidade_nome: string | null
  itens_count: number
  diffs_count: number
  cobertura?: Cobertura
}

type ReviewMode = 'pendentes' | 'revisadas'
type AssetMode = 'SETOR' | 'RACK' | 'ESTOQUE'

function progressPercent(done: number, total: number) {
  if (total > 0) return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  return done > 0 ? 100 : 0
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem envio'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function statusBadge(status: string) {
  if (status === 'revisada' || status === 'aprovado') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  if (status === 'finalizada' || status === 'parcial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  if (status === 'recusado') return 'border-red-500/40 bg-red-500/10 text-red-200'
  return 'border-slate-700 bg-slate-800/80 text-slate-300'
}

function CoveragePreview({ solicitacao }: { solicitacao: SolicitacaoRevisao }) {
  const cobertura = solicitacao.cobertura
  if (!cobertura) return null

  if (solicitacao.tipo_solicitacao === 'RACK') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
          <p className="text-xs text-slate-500">Portas previstas</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{cobertura.previsto.portas || '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
          <p className="text-xs text-slate-500">Resposta técnica</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{cobertura.preenchido.rack ? 'registrada' : 'pendente'}</p>
        </div>
      </div>
    )
  }

  const rows = solicitacao.tipo_solicitacao === 'ESTOQUE'
    ? [
      ['Notebooks', cobertura.preenchido.notebooks ?? 0, cobertura.previsto.notebooks ?? 0, Laptop],
      ['Aparelhos', cobertura.preenchido.aparelhos ?? 0, cobertura.previsto.aparelhos ?? 0, Smartphone],
    ] as const
    : [
      ['Estações', cobertura.preenchido.maquinas, cobertura.previsto.maquinas, Monitor],
      ['Ramais', cobertura.preenchido.ramais, cobertura.previsto.ramais, Phone],
      ['Monitores', cobertura.preenchido.monitores, cobertura.previsto.monitores, Monitor],
      ['Impressoras', cobertura.preenchido.impressoras, cobertura.previsto.impressoras, Printer],
    ] as const

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(([label, done, total, Icon]) => (
        <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
          <p className="flex items-center gap-1 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{done}/{total}</p>
        </div>
      ))}
    </div>
  )
}

function ReviewCard({ solicitacao }: { solicitacao: SolicitacaoRevisao }) {
  const title = solicitacao.titulo ?? solicitacao.setor_nome ?? solicitacao.rack_nome ?? 'Solicitação'
  const isRack = solicitacao.tipo_solicitacao === 'RACK'
  const percent = solicitacao.cobertura?.percentual ?? 0
  const Icon = isRack ? Server : solicitacao.tipo_solicitacao === 'ESTOQUE' ? Boxes : ClipboardCheck
  const sentAt = solicitacao.finalizado_em ?? solicitacao.atualizado_em
  const decisionLabel = solicitacao.assimilada
    ? `Assimilado por ${solicitacao.assimilado_por_nome ?? 'administrador'}`
    : solicitacao.revisor_nome
      ? `Revisado por ${solicitacao.revisor_nome}`
      : 'Aguardando decisão'
  const decisionDate = solicitacao.assimilada ? solicitacao.assimilado_em : solicitacao.revisado_em

  return (
    <Link
      href={`/checklists-validacao/solicitacoes/${solicitacao.id}/revisao`}
      className="group flex min-h-[320px] flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-5 transition hover:-translate-y-0.5 hover:border-blue-500/60 hover:bg-slate-900"
    >
      <div className="flex items-start gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-1"
          style={{ background: `conic-gradient(rgb(37 99 235) ${percent * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)` }}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-slate-950">
            <span className="text-lg font-black text-white">{percent}%</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Icon className="h-3.5 w-3.5" />
              {isRack ? 'Rack' : 'Setor'}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(solicitacao.status_revisao)}`}>{solicitacao.status_revisao}</span>
            {solicitacao.assimilada && <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">assimilada</span>}
          </div>
          <h3 className="mt-3 line-clamp-2 text-xl font-black text-white transition group-hover:text-blue-200">{title}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-slate-400">{solicitacao.checklist_nome ?? 'Checklist'} · {solicitacao.localidade_nome ?? 'Localidade'}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Preenchimento</span>
          <span>Último envio: {formatDateTime(sentAt)}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-4 flex-1">
        <CoveragePreview solicitacao={solicitacao} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <span className="min-w-0 rounded-2xl bg-slate-950/60 p-3"><UserRound className="mb-1 h-3.5 w-3.5" />{solicitacao.tecnico_nome ?? 'Sem técnico'}</span>
        <span className="rounded-2xl bg-slate-950/60 p-3"><GitCompareArrows className="mb-1 h-3.5 w-3.5" />{solicitacao.diffs_count} diffs</span>
        <span className="rounded-2xl bg-slate-950/60 p-3"><CheckCircle2 className="mb-1 h-3.5 w-3.5" />{solicitacao.itens_count} itens</span>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs font-semibold text-slate-400">
        <span className="block text-slate-200">{decisionLabel}</span>
        <span>{formatDateTime(decisionDate)}</span>
      </div>
    </Link>
  )
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${active
        ? 'border border-blue-500/40 bg-blue-600 text-white shadow-lg shadow-blue-950/30'
        : 'border border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

export default function ChecklistsRevisaoPage() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRevisao[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('pendentes')
  const [assetMode, setAssetMode] = useState<AssetMode>('SETOR')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/checklists-validacao-solicitacoes?status=finalizada,revisada&limit=100')
    if (res.ok) {
      const json = await res.json()
      setSolicitacoes(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => {
    const pendentes = solicitacoes.filter(s => !s.assimilada && (s.status !== 'revisada' || s.status_revisao === 'pendente' || s.status_revisao === 'parcial'))
    const revisadas = solicitacoes.filter(s => s.assimilada || s.status === 'revisada' || s.status_revisao === 'aprovado' || s.status_revisao === 'recusado')
    return {
      total: solicitacoes.length,
      pendentes: pendentes.length,
      revisadas: revisadas.length,
      setores: solicitacoes.filter(s => s.tipo_solicitacao === 'SETOR').length,
      racks: solicitacoes.filter(s => s.tipo_solicitacao === 'RACK').length,
      estoque: solicitacoes.filter(s => s.tipo_solicitacao === 'ESTOQUE').length,
    }
  }, [solicitacoes])

  const filtered = useMemo(() => {
    return solicitacoes.filter(solicitacao => {
      const inReviewMode = reviewMode === 'pendentes'
        ? !solicitacao.assimilada && (solicitacao.status !== 'revisada' || solicitacao.status_revisao === 'pendente' || solicitacao.status_revisao === 'parcial')
        : solicitacao.assimilada || solicitacao.status === 'revisada' || solicitacao.status_revisao === 'aprovado' || solicitacao.status_revisao === 'recusado'
      return inReviewMode && solicitacao.tipo_solicitacao === assetMode
    })
  }, [assetMode, reviewMode, solicitacoes])

  if (loading) return <div className="mx-auto max-w-[1500px] px-10 py-6 text-sm text-slate-500">Carregando fila de revisão...</div>

  const reviewMetrics: ChecklistContextMetric[] = [
    {
      icon: ClipboardCheck,
      label: 'Prontas',
      value: stats.pendentes,
      percent: progressPercent(stats.pendentes, stats.total),
      helper: `${stats.pendentes}/${stats.total} aguardando revisão`,
      tone: 'amber',
    },
    {
      icon: CheckCircle2,
      label: 'Revisadas',
      value: stats.revisadas,
      percent: progressPercent(stats.revisadas, stats.total),
      helper: `${stats.revisadas}/${stats.total} decididas`,
      tone: 'emerald',
    },
    {
      icon: ListChecks,
      label: 'Setores',
      value: stats.setores,
      percent: progressPercent(stats.setores, stats.total),
      helper: `${stats.setores} solicitações setoriais`,
    },
    {
      icon: Server,
      label: 'Racks',
      value: stats.racks,
      percent: progressPercent(stats.racks, stats.total),
      helper: `${stats.racks} solicitações de rack`,
      tone: 'violet',
    },
    {
      icon: GitCompareArrows,
      label: 'Total',
      value: stats.total,
      percent: stats.total ? 100 : 0,
      helper: 'solicitações concluídas',
      tone: 'slate',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-28 pt-6 sm:px-6 sm:pb-10 lg:px-10">
      <ChecklistNavPills className="hidden lg:block" items={[
        { label: 'Checklists', href: '/checklists-validacao' },
        { label: 'Revisão' },
      ]} />

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">Revisão administrativa</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white lg:text-4xl">Fila de revisão</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Solicitações concluídas pelos técnicos, prontas para decisão e assimilação.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <span className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
            <strong className="block text-xl text-white">{stats.total}</strong>
            Total
          </span>
          <span className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-amber-200">
            <strong className="block text-xl text-white">{stats.pendentes}</strong>
            Prontas
          </span>
          <span className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-emerald-200">
            <strong className="block text-xl text-white">{stats.revisadas}</strong>
            Revisadas
          </span>
        </div>
      </header>

      <ChecklistContextOverview
        eyebrow="Overview da validação"
        title="Fila administrativa"
        description={`${stats.pendentes} prontas para revisar · ${stats.revisadas} revisadas`}
        metrics={reviewMetrics}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Solicitações</p>
              <h2 className="mt-1 text-xl font-black text-white">
                {assetMode === 'SETOR' ? 'Setores para revisar' : assetMode === 'RACK' ? 'Racks para revisar' : 'Estoques para revisar'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {filtered.length} {assetMode === 'SETOR' ? 'setores' : assetMode === 'RACK' ? 'racks' : 'revisões de estoque'} no filtro atual.
              </p>
            </div>
            <div className="inline-flex w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-1 sm:w-auto">
              {[
                ['pendentes', `Prontas ${stats.pendentes}`],
                ['revisadas', `Revisadas ${stats.revisadas}`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={reviewMode === key}
                  onClick={() => setReviewMode(key as ReviewMode)}
                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-bold transition sm:flex-none ${reviewMode === key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${reviewMode}-${assetMode}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3"
            >
              {filtered.map(solicitacao => <ReviewCard key={solicitacao.id} solicitacao={solicitacao} />)}
              {filtered.length === 0 && (
                <div className="col-span-full rounded-3xl border border-dashed border-slate-700 bg-slate-950/40 p-12 text-center text-sm text-slate-500">
                  Nenhuma solicitação nesta fila.
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="h-fit space-y-4 xl:sticky xl:top-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Triagem</p>
            <h2 className="mt-1 text-lg font-black text-white">Tipo de solicitação</h2>
            <div className="mt-4 space-y-2">
              <FilterButton active={assetMode === 'SETOR'} onClick={() => setAssetMode('SETOR')}>
                <span className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2"><ListChecks className="h-4 w-4" />Setores</span>
                  <span>{stats.setores}</span>
                </span>
              </FilterButton>
              <FilterButton active={assetMode === 'RACK'} onClick={() => setAssetMode('RACK')}>
                <span className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2"><Server className="h-4 w-4" />Racks</span>
                  <span>{stats.racks}</span>
                </span>
              </FilterButton>
              <FilterButton active={assetMode === 'ESTOQUE'} onClick={() => setAssetMode('ESTOQUE')}>
                <span className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2"><Boxes className="h-4 w-4" />Estoque</span>
                  <span>{stats.estoque}</span>
                </span>
              </FilterButton>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">Somente concluídas entram na fila.</p>
                <p className="mt-1 leading-6 text-amber-100/80">A revisão decide campos, recusa divergências e assimila somente o aprovado.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

    </div>
  )
}
