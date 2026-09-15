'use client'

import Link from 'next/link'
import { Boxes, CalendarClock, CheckCircle2, ClipboardList, Laptop, Monitor, Phone, Printer, Server, Smartphone, UserRound } from 'lucide-react'
import { motion } from 'motion/react'

export type Cobertura = {
  previsto: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; racks: number; portas: number }
  preenchido: { maquinas: number; ramais: number; monitores: number; impressoras: number; notebooks?: number; aparelhos?: number; rack: number }
  percentual: number
}

export type ChecklistSolicitacaoResumo = {
  id: string
  tipo_solicitacao: 'SETOR' | 'RACK' | 'ESTOQUE'
  titulo?: string
  itens_escopo?: string[]
  status: string
  status_revisao: string
  planner_status: string
  planner_task_id?: string | null
  setor_nome: string | null
  rack_nome: string | null
  tecnico_nome: string | null
  ultimo_preenchimento_em: string | null
  itens_count: number
  diffs_count: number
  cobertura?: Cobertura
}

export function PlannerSyncBadge({ plannerTaskId, plannerStatus }: { plannerTaskId?: string | null; plannerStatus: string }) {
  const linked = Boolean(plannerTaskId)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
        linked
          ? 'border-violet-500/35 bg-violet-500/10 text-violet-200'
          : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
      }`}
      title={linked ? `Planner vinculado: ${plannerTaskId}` : 'Aguardando criação da tarefa no Planner'}
    >
      <Server className="h-3.5 w-3.5" />
      {linked ? 'Planner criado' : 'Aguardando Planner'}
      <span className="hidden opacity-70 sm:inline">· {plannerStatus}</span>
    </span>
  )
}

export function checklistStatusClass(status: string) {
  if (status === 'revisada') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'finalizada') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
  if (status === 'assumida') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export function formatChecklistDateTime(value?: string | null) {
  if (!value) return 'Sem preenchimento'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function CoverageMini({ solicitacao }: { solicitacao: ChecklistSolicitacaoResumo }) {
  const c = solicitacao.cobertura
  if (!c) return null
  if (solicitacao.tipo_solicitacao === 'RACK') {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60">
          <span className="block text-slate-500">Portas previstas</span>
          <strong className="text-slate-900 dark:text-white">{c.previsto.portas || '-'}</strong>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60">
          <span className="block text-slate-500">Resposta</span>
          <strong className="text-slate-900 dark:text-white">{c.preenchido.rack ? 'registrada' : 'pendente'}</strong>
        </div>
      </div>
    )
  }

  const rows = solicitacao.tipo_solicitacao === 'ESTOQUE'
    ? [
      ['Notebooks', c.preenchido.notebooks ?? 0, c.previsto.notebooks ?? 0, Laptop],
      ['Aparelhos', c.preenchido.aparelhos ?? 0, c.previsto.aparelhos ?? 0, Smartphone],
    ] as const
    : [
      ['Estações', c.preenchido.maquinas, c.previsto.maquinas, Monitor],
      ['Ramais', c.preenchido.ramais, c.previsto.ramais, Phone],
      ['Monitores', c.preenchido.monitores, c.previsto.monitores, Monitor],
      ['Impressoras', c.preenchido.impressoras, c.previsto.impressoras, Printer],
    ] as const

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(([label, done, total, Icon]) => (
        <div key={label} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-950/60">
          <span className="flex items-center gap-1 text-slate-500"><Icon className="h-3 w-3" />{label}</span>
          <strong className="text-slate-900 dark:text-white">{done}/{total}</strong>
        </div>
      ))}
    </div>
  )
}

function ProgressCircle({ percent, size = 'lg' }: { percent: number; size?: 'sm' | 'lg' }) {
  const safePercent = Math.max(0, Math.min(100, percent))
  const dimension = size === 'sm' ? 'h-14 w-14' : 'h-20 w-20'
  const text = size === 'sm' ? 'text-sm' : 'text-lg'

  return (
    <div
      className={`${dimension} shrink-0 rounded-full p-1`}
      style={{
        background: `conic-gradient(rgb(37 99 235) ${safePercent * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`,
      }}
      aria-label={`Cobertura ${safePercent}%`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-950">
        <span className={`${text} font-black tracking-tight text-slate-900 dark:text-white`}>{safePercent}%</span>
      </div>
    </div>
  )
}

export function SolicitacaoCard({ anchorId, solicitacao }: { anchorId?: string; solicitacao: ChecklistSolicitacaoResumo }) {
  const title = solicitacao.titulo ?? solicitacao.setor_nome ?? solicitacao.rack_nome ?? 'Solicitação'
  const percent = solicitacao.cobertura?.percentual ?? 0

  return (
    <motion.div id={anchorId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="h-full scroll-mt-24">
      <Link href={`/checklists-validacao/solicitacoes/${solicitacao.id}`} className="group flex h-full min-h-[292px] flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 sm:p-5">
        <div className="flex items-start gap-4">
          <ProgressCircle percent={percent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {solicitacao.tipo_solicitacao === 'ESTOQUE' && <Boxes className="h-3.5 w-3.5" />}
                {solicitacao.tipo_solicitacao}
              </span>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${checklistStatusClass(solicitacao.status)}`}>{solicitacao.status}</span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-xl font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{title}</h3>
            <div className="mt-2">
              <PlannerSyncBadge plannerTaskId={solicitacao.planner_task_id} plannerStatus={solicitacao.planner_status} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60">
            <span className="flex items-center gap-1 text-slate-500"><UserRound className="h-3.5 w-3.5" />Técnico</span>
            <strong className="mt-1 block truncate text-slate-900 dark:text-white">{solicitacao.tecnico_nome ?? 'Sem técnico'}</strong>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60">
            <span className="flex items-center gap-1 text-slate-500"><CalendarClock className="h-3.5 w-3.5" />Último envio</span>
            <strong className="mt-1 block truncate text-slate-900 dark:text-white">{formatChecklistDateTime(solicitacao.ultimo_preenchimento_em)}</strong>
          </div>
        </div>

        <div className="mt-4 flex-1">
          <CoverageMini solicitacao={solicitacao} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <span><ClipboardList className="mb-1 h-3.5 w-3.5" />{solicitacao.itens_count} itens</span>
          <span><CheckCircle2 className="mb-1 h-3.5 w-3.5" />{solicitacao.diffs_count} diffs</span>
          <span><Server className="mb-1 h-3.5 w-3.5" />{solicitacao.planner_task_id ? 'Criado' : 'Sem card'}</span>
        </div>
      </Link>
    </motion.div>
  )
}

export function RackSidebarCard({ anchorId, solicitacao }: { anchorId?: string; solicitacao: ChecklistSolicitacaoResumo }) {
  const percent = solicitacao.cobertura?.percentual ?? 0

  return (
    <motion.div id={anchorId} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="h-full scroll-mt-24">
      <Link href={`/checklists-validacao/solicitacoes/${solicitacao.id}`} className="group flex min-h-[136px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-slate-900/80">
        <div className="flex items-start justify-between gap-3">
          <ProgressCircle percent={percent} size="sm" />
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Server className="h-3.5 w-3.5" />Rack</span>
            <h3 className="mt-1 truncate text-sm font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{solicitacao.rack_nome ?? 'Rack'}</h3>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${checklistStatusClass(solicitacao.status)}`}>{solicitacao.status}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{solicitacao.tecnico_nome ?? 'Sem técnico'}</span>
          <span>{formatChecklistDateTime(solicitacao.ultimo_preenchimento_em)}</span>
        </div>
        <div className="mt-3">
          <PlannerSyncBadge plannerTaskId={solicitacao.planner_task_id} plannerStatus={solicitacao.planner_status} />
        </div>
      </Link>
    </motion.div>
  )
}
