'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  CalendarClock,
  Cpu,
  Eye,
  Link2,
  Loader2,
  MapPin,
  MonitorCheck,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable } from '@/components/tables/data-table'
import { DeviceOverviewPanel, type OverviewFilter, notifyOverviewFilter } from '@/components/tables/device-overview-panel'
import type { OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from '@/components/layout/mobile-section-nav'
import { SetorSelect } from '@/components/modals/setor-select'
import { LocalidadeSelect } from '@/components/modals/localidade-select'
import { useInspectNavigation } from '@/hooks/use-inspect-navigation'
import { usePermission } from '@/hooks/use-permission'
import { useSolicitacaoInventarioConfirm } from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import { writePendingInspectPreview } from '@/lib/navigation-context'
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'
import { UltimaRevisaoButton } from '@/components/checklists/ultima-revisao-popup'

type MonitorRow = {
  id: string
  codigo_interno: string | null
  patrimonio: string | null
  serial: string | null
  marca: string | null
  modelo: string | null
  status: boolean | null
  status_text: string | null
  criado_via_checklist: boolean
  criado_em: string | null
  atualizado_em: string | null
  checklist_revisado_em: string | null
  data_revisao?: string | null
  setor_id?: string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  maquina_id?: string | null
  maquina_nome?: string | null
  maquina_patrimonio?: string | null
  maquina_ip?: string | null
  colaboradores?: Array<{
    id: string
    codigo: number | null
    nome: string
    setor_rel?: { id: string; nome: string | null } | null
    localidade_rel?: { id: string; nome: string | null } | null
  }>
  colaboradores_nomes?: string[]
  colaboradores_resumo?: string | null
  alocacao_ativa?: {
    id: string
    maquina_id: string | null
    setor_id: string | null
    data_inicio: string | null
    maquina?: {
      id: string
      nome_host: string | null
      patrimonio_cpu: string | null
      endereco_ip?: string | null
      setor_id?: string | null
      localidade_id?: string | null
      setor_rel?: { id: string; nome: string | null } | null
      localidade_rel?: { id: string; nome: string | null } | null
    } | null
    setor?: { id: string; nome: string | null } | null
  } | null
  alocacoes?: Array<MonitorRow['alocacao_ativa']>
}

type MachineOption = {
  id: string
  nome_host: string | null
  patrimonio_cpu: string | null
  endereco_ip?: string | null
  setor_id?: string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
}

type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  totalPages: number
}

type ActiveOverviewFilter = OverviewFilter & {
  key: string
  predicate: (item: MonitorRow) => boolean
}

function monitorTitle(monitor: MonitorRow) {
  return monitor.patrimonio ?? ([monitor.marca, monitor.modelo].filter(Boolean).join(' ') || 'Monitor sem patrimônio')
}

function activeAllocation(monitor: MonitorRow) {
  return monitor.alocacao_ativa ?? monitor.alocacoes?.[0] ?? null
}

function isAllocated(item: MonitorRow) {
  return Boolean(activeAllocation(item))
}

function allocationLabel(item: MonitorRow) {
  return item.maquina_nome ?? item.maquina_patrimonio ?? item.maquina_ip ?? activeAllocation(item)?.maquina?.nome_host ?? 'Livre'
}

function machineOptionLabel(option: MachineOption) {
  return option.nome_host ?? option.patrimonio_cpu ?? option.endereco_ip ?? option.id
}

function getOverviewFilterKey(filter: OverviewFilter) {
  return `${filter.kind}:${filter.value ?? ''}`
}

function toggleOverviewFilter(filters: ActiveOverviewFilter[], candidate: ActiveOverviewFilter) {
  if (candidate.kind === 'location') {
    const withoutLocation = filters.filter(filter => filter.kind !== 'location')
    return candidate.value ? [...withoutLocation, candidate] : withoutLocation
  }
  const exists = filters.some(filter => filter.key === candidate.key)
  if (exists) return filters.filter(filter => filter.key !== candidate.key)
  return [...filters, candidate]
}

function matchesOverviewFilters(item: MonitorRow, filters: ActiveOverviewFilter[]) {
  const filtersByKind = filters.reduce((map, filter) => {
    const group = map.get(filter.kind) ?? []
    group.push(filter)
    map.set(filter.kind, group)
    return map
  }, new Map<string, ActiveOverviewFilter[]>())

  return Array.from(filtersByKind.values()).every(group =>
    group.some(filter => filter.predicate(item))
  )
}

function MachineSearch({
  disabled,
  monitor,
  onAllocated,
}: {
  disabled?: boolean
  monitor: MonitorRow
  onAllocated: () => void
}) {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<MachineOption[]>([])
  const [selected, setSelected] = useState<MachineOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const currentAllocation = activeAllocation(monitor)
  const actionLabel = currentAllocation ? 'Realocar' : 'Alocar'
  const canAct = isAdmin || canRequestInventoryChanges

  useEffect(() => {
    if (query.trim().length < 2) {
      setOptions([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/maquinas?limit=8&search=${encodeURIComponent(query.trim())}`)
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setOptions(Array.isArray(json.data) ? json.data : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  async function allocate() {
    if (!selected) {
      toast.error('Selecione uma máquina para alocar o monitor.')
      return
    }
    setSaving(true)
    const proposed = {
      monitor_id: monitor.id,
      maquina_id: selected.id,
      setor_id: selected.setor_id ?? null,
    }
    try {
      if (!isAdmin) {
        if (!canRequestInventoryChanges) {
          toast.error('Seu perfil não permite solicitar alterações de inventário.')
          return
        }
        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: 'alocacoes_monitores',
            recurso_id: monitor.id,
            acao: 'ALLOCATE',
            dados_anteriores: currentAllocation,
            dados_propostos: proposed,
            comentario: solicitacao.comentario,
          })),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro ao criar pedido.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, machineOptionLabel(selected))
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        setQuery('')
        setSelected(null)
        return
      }

      const res = await fetch('/api/alocacoes-monitores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(proposed),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erro ao realocar monitor.')
      toast.success(currentAllocation ? 'Monitor realocado à máquina.' : 'Monitor alocado à máquina.')
      setQuery('')
      setSelected(null)
      onAllocated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alocar monitor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{currentAllocation ? 'Realocar monitor' : 'Alocar monitor'}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {isAdmin ? 'A alocação ativa anterior será encerrada automaticamente.' : 'A alteração será enviada como pedido para aprovação.'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            disabled={disabled || saving || !canAct}
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setSelected(null)
            }}
            placeholder="Host, IP ou patrimônio"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs font-semibold outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <button
          type="button"
          disabled={disabled || saving || !selected || !canAct}
          onClick={allocate}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          {isAdmin ? actionLabel : 'Solicitar'}
        </button>
      </div>
      {!canAct && (
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Seu perfil não possui acesso para pedir alterações de alocação.
        </p>
      )}
      {(loading || options.length > 0 || selected) && (
        <div className="mt-1.5 space-y-1">
          {loading && <p className="px-2 py-1 text-xs font-semibold text-slate-500">Buscando máquinas...</p>}
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="w-full rounded-lg border border-blue-500/35 bg-blue-500/10 px-2.5 py-1.5 text-left text-xs font-bold text-blue-200"
            >
              {machineOptionLabel(selected)}
            </button>
          )}
          {!selected && options.map(option => (
            <button
              type="button"
              key={option.id}
              onClick={() => setSelected(option)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700"
            >
              <span className="block">{machineOptionLabel(option)}</span>
              <span className="text-[11px] text-slate-500">
                {[option.setor_nome ?? 'Sem setor', option.localidade_nome].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailTile({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className="mt-2 min-h-5 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{value || '—'}</p>
    </div>
  )
}

function MonitorInspectModal({ monitor, onChanged, onClose }: { monitor: MonitorRow; onChanged: () => void; onClose: () => void }) {
  const router = useRouter()
  const allocation = activeAllocation(monitor)
  const colaboradores = monitor.colaboradores ?? []
  const machineId = monitor.maquina_id ?? allocation?.maquina_id ?? allocation?.maquina?.id ?? null

  function openMachine() {
    if (!machineId) return
    const title = allocationLabel(monitor)
    const href = `/maquinas?inspect=${machineId}`
    writePendingInspectPreview(window.sessionStorage, href, {
      title,
      subtitle: [monitor.setor_nome, monitor.localidade_nome].filter(Boolean).join(' · '),
    })
    router.push(href)
  }

  function openColaborador(colaborador: NonNullable<MonitorRow['colaboradores']>[number]) {
    if (!colaborador.id) return
    const href = `/colaboradores?inspect=${colaborador.id}`
    writePendingInspectPreview(window.sessionStorage, href, {
      title: colaborador.nome,
      subtitle: [colaborador.codigo, colaborador.setor_rel?.nome].filter(Boolean).join(' · '),
    })
    router.push(href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-500">Inspecionar monitor</p>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-950 dark:text-white">{monitorTitle(monitor)}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {[monitor.marca, monitor.modelo, monitor.status_text ?? 'ativo'].filter(Boolean).join(' · ') || 'Sem detalhes cadastrados'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Fechar inspeção"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/35">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <MonitorCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">Dados do monitor</h3>
                  <p className="text-sm font-semibold text-slate-500">Cadastro e origem do ativo.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailTile label="Patrimônio" value={monitor.patrimonio} />
                <DetailTile label="Tamanho" value={monitor.modelo} />
                <DetailTile label="Marca" value={monitor.marca} />
                <DetailTile label="Origem" value={monitor.criado_via_checklist ? 'Checklist' : 'Manual'} />
                <DetailTile label="Última revisão" value={monitor.data_revisao ? new Date(monitor.data_revisao).toLocaleDateString('pt-BR') : null} icon={CalendarClock} />
                <DetailTile label="Uso" value={isAllocated(monitor) ? 'Alocado' : 'Livre'} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/35">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">Alocação atual</h3>
                  <p className="text-sm font-semibold text-slate-500">Derivada da máquina vinculada.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/55">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    <Cpu className="h-3.5 w-3.5" />
                    Máquina
                  </div>
                  <button
                    type="button"
                    disabled={!machineId}
                    onClick={openMachine}
                    className="mt-2 inline-flex max-w-full items-center gap-2 truncate text-sm font-black text-blue-600 transition hover:text-blue-500 disabled:cursor-default disabled:text-slate-400 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    <span className="truncate">{allocationLabel(monitor)}</span>
                    {machineId && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </div>
                <DetailTile label="IP da máquina" value={monitor.maquina_ip} />
                <DetailTile label="Setor" value={monitor.setor_nome} icon={MapPin} />
                <DetailTile label="Localidade" value={monitor.localidade_nome} icon={MapPin} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <UserRound className="h-3.5 w-3.5" />
                  Colaboradores da estação
                </div>
                {colaboradores.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {colaboradores.map(colaborador => (
                      <button
                        key={colaborador.id}
                        type="button"
                        onClick={() => openColaborador(colaborador)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300 transition hover:border-emerald-300 hover:bg-emerald-500/15"
                      >
                        {colaborador.nome}
                        {colaborador.codigo ? ` · ${colaborador.codigo}` : ''}
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-slate-500">Nenhum colaborador ativo na máquina vinculada.</p>
                )}
              </div>

              <div className="mt-4">
                <MachineSearch
                  monitor={monitor}
                  onAllocated={() => {
                    onChanged()
                    onClose()
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MonitoresPage() {
  const [data, setData] = useState<MonitorRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [overviewData, setOverviewData] = useState<MonitorRow[]>([])
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MonitorRow | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const searchParams = useSearchParams()
  const inspectId = searchParams.get('inspect')
  const { openInspect, closeInspect } = useInspectNavigation<MonitorRow>(setSelected)
  const [activeOverviewFilters, setActiveOverviewFilters] = useState<ActiveOverviewFilter[]>([])
  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false)
  const [mobileView, setMobileView] = useState<InventoryMobileView>('registros')

  const [search, setSearch] = useState('')
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(null)
  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [origem, setOrigem] = useState('')
  const [alocacao, setAlocacao] = useState('')
  const [sort, setSort] = useState('criado_em')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const refresh = useCallback(() => setRefreshKey(key => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function fetchData() {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort,
        dir,
      })
      if (search) params.set('search', search)
      if (setorIdFiltro) params.set('setor_id', setorIdFiltro)
      if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
      if (status) params.set('status', status)
      if (origem) params.set('origem', origem)
      if (alocacao) params.set('alocacao', alocacao)

      try {
        const res = await fetch(`/api/monitores?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<MonitorRow> = await res.json()
        if (!cancelled) {
          setData(json.data)
          setTotal(json.total)
          setTotalPages(json.totalPages)
        }
      } catch (error) {
        console.error('[monitores page]', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [page, search, setorIdFiltro, localidadeIdFiltro, status, origem, alocacao, sort, dir, refreshKey])

  useEffect(() => {
    let cancelled = false
    setOverviewLoading(true)
    async function fetchOverview() {
      try {
        const params = new URLSearchParams({ page: '1', limit: '10000', sort: 'patrimonio', dir: 'asc' })
        if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
        const res = await fetch(`/api/monitores?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<MonitorRow> = await res.json()
        if (!cancelled) {
          setOverviewData(json.data)
          setOverviewTotal(json.total)
        }
      } catch (error) {
        console.error('[monitores overview]', error)
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }
    fetchOverview()
    return () => { cancelled = true }
  }, [refreshKey, localidadeIdFiltro])

  useEffect(() => {
    if (!inspectId || data.length === 0) return
    const found = data.find(item => item.id === inspectId)
    if (found) setSelected(found)
  }, [inspectId, data])

  const filteredOverviewData = activeOverviewFilters.length > 0
    ? overviewData.filter(item => matchesOverviewFilters(item, activeOverviewFilters))
    : null
  const overviewPanelData = filteredOverviewData ?? overviewData
  const overviewPanelTotal = filteredOverviewData?.length ?? (overviewTotal || total)
  const tableData = filteredOverviewData ? filteredOverviewData.slice((page - 1) * 20, page * 20) : data
  const tableTotal = filteredOverviewData?.length ?? total
  const tableTotalPages = filteredOverviewData ? Math.max(1, Math.ceil(filteredOverviewData.length / 20)) : totalPages

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === 'all') {
      setActiveOverviewFilters([])
      setPage(1)
      notifyOverviewFilter([])
      return
    }

    const predicates: Record<string, { label: string; predicate: (item: MonitorRow) => boolean }> = {
      allocated: { label: 'Monitores alocados', predicate: isAllocated },
      free: { label: 'Monitores livres', predicate: item => !isAllocated(item) },
      location: {
        label: filter.label ?? 'Unidade selecionada',
        predicate: item => filter.value === '__sem_localidade__' ? !item.localidade_id : item.localidade_id === filter.value,
      },
      sector: {
        label: `Setor: ${filter.value ?? 'Sem setor'}`,
        predicate: item => (item.setor_nome ?? 'Sem setor') === filter.value,
      },
    }
    const nextFilter = predicates[filter.kind]
    if (!nextFilter) return
    const candidate: ActiveOverviewFilter = {
      ...filter,
      key: getOverviewFilterKey(filter),
      label: nextFilter.label,
      predicate: nextFilter.predicate,
    }

    setOverviewFilterLoading(true)
    window.setTimeout(() => {
      setActiveOverviewFilters(currentFilters => {
        const nextFilters = toggleOverviewFilter(currentFilters, candidate)
        notifyOverviewFilter(nextFilters)
        return nextFilters
      })
      setPage(1)
      setOverviewFilterLoading(false)
    }, 120)
  }

  const overviewExportConfig: OverviewExportConfig<MonitorRow> = {
    title: 'Overview de Monitores',
    filename: 'overview-monitores',
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: 'patrimonio', header: 'Patrimônio', value: item => item.patrimonio },
      { key: 'marca', header: 'Marca', value: item => item.marca },
      { key: 'modelo', header: 'Tamanho', value: item => item.modelo },
      { key: 'status', header: 'Status', value: item => item.status_text },
      { key: 'setor', header: 'Setor', value: item => item.setor_nome },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'maquina', header: 'Máquina vinculada', value: allocationLabel },
      { key: 'colaboradores', header: 'Colaboradores da máquina', value: item => item.colaboradores_resumo },
      { key: 'uso', header: 'Uso', value: item => isAllocated(item) ? 'Alocado' : 'Livre' },
      { key: 'origem', header: 'Origem', value: item => item.criado_via_checklist ? 'Checklist' : 'Cadastro manual' },
      { key: 'ultima_revisao', header: 'Última revisão', value: item => item.checklist_revisado_em },
    ],
    pdfColumns: [
      { key: 'patrimonio', header: 'Patrimônio', value: item => item.patrimonio },
      { key: 'marca', header: 'Marca', value: item => item.marca },
      { key: 'modelo', header: 'Tamanho', value: item => item.modelo },
      { key: 'setor', header: 'Setor', value: item => item.setor_nome },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'maquina', header: 'Máquina vinculada', value: allocationLabel },
      { key: 'colaboradores', header: 'Colaboradores', value: item => item.colaboradores_resumo },
      { key: 'uso', header: 'Uso', value: item => isAllocated(item) ? 'Alocado' : 'Livre' },
    ],
  }

  const columns = useMemo<ColumnDef<MonitorRow, unknown>[]>(() => [
    {
      accessorKey: 'patrimonio',
      header: 'Monitor',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{monitorTitle(row.original)}</span>
          <p className="text-xs text-slate-400">{[row.original.marca, row.original.modelo].filter(Boolean).join(' · ') || 'Sem detalhes'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'setor_nome',
      header: 'Setor',
      enableSorting: false,
      cell: ({ row }) => row.original.setor_nome ?? '—',
    },
    {
      accessorKey: 'localidade_nome',
      header: 'Localidade',
      enableSorting: false,
      cell: ({ row }) => row.original.localidade_nome ?? '—',
    },
    {
      id: 'maquina',
      header: 'Máquina',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{allocationLabel(row.original)}</span>
          {row.original.maquina_ip && <p className="text-xs text-slate-400">{row.original.maquina_ip}</p>}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="rounded-full border border-slate-700 bg-slate-950/50 px-2 py-0.5 text-xs font-semibold text-slate-300">
          {row.original.status_text ?? 'ativo'}
        </span>
      ),
    },
    {
      id: 'uso',
      header: 'Uso',
      enableSorting: false,
      cell: ({ row }) => isAllocated(row.original)
        ? <span className="font-semibold text-emerald-500">Alocado</span>
        : <span className="text-slate-400">Livre</span>,
    },
    {
      id: 'origem',
      header: 'Origem',
      enableSorting: false,
      cell: ({ row }) => row.original.criado_via_checklist ? 'Checklist' : 'Manual',
    },
    {
      id: 'ultima_revisao',
      header: 'Última revisão',
      enableSorting: false,
      cell: ({ row }) => <UltimaRevisaoButton tipo='MONITOR' id={row.original.id} revisadoEm={row.original.checklist_revisado_em} />,
    },
    {
      id: 'acoes',
      header: 'Inspeção',
      enableSorting: false,
      cell: ({ row }) => (
        <div onClick={event => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => openInspect(row.original)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-500/35 px-3 text-xs font-bold text-blue-300 transition hover:bg-blue-500/10"
          >
            <Eye className="h-3.5 w-3.5" />
            Inspecionar
          </button>
        </div>
      ),
    },
  ], [openInspect])

  const inputCls = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
  const filters = (
    <>
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }}
          placeholder="Patrimônio, marca, tamanho ou máquina..."
          className={`${inputCls} w-full pl-9`}
        />
      </div>
      <SetorSelect
        value={setorIdFiltro}
        onChange={id => { setSetorIdFiltro(id); setPage(1) }}
        placeholder="Filtrar por setor..."
        allowCreate={false}
        className="min-w-[210px]"
      />
      <LocalidadeSelect
        value={localidadeIdFiltro}
        onChange={id => { setLocalidadeIdFiltro(id); setPage(1) }}
        placeholder="Filtrar por localidade..."
        className="min-w-[230px]"
      />
      <select value={alocacao} onChange={event => { setAlocacao(event.target.value); setPage(1) }} className={inputCls}>
        <option value="">Todos</option>
        <option value="alocado">Alocados</option>
        <option value="livre">Livres</option>
      </select>
      <select value={origem} onChange={event => { setOrigem(event.target.value); setPage(1) }} className={inputCls}>
        <option value="">Todas as origens</option>
        <option value="checklist">Checklist</option>
        <option value="manual">Manual</option>
      </select>
      <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className={inputCls}>
        <option value="">Todos os status</option>
        <option value="ativo">Ativos</option>
        <option value="inativo">Inativos</option>
      </select>
      <select
        value={`${sort}:${dir}`}
        onChange={event => {
          const [nextSort, nextDir] = event.target.value.split(':')
          setSort(nextSort)
          setDir(nextDir as 'asc' | 'desc')
          setPage(1)
        }}
        className={inputCls}
      >
        <option value="criado_em:desc">Mais recentes</option>
        <option value="criado_em:asc">Mais antigos</option>
        <option value="patrimonio:asc">Patrimônio A→Z</option>
        <option value="patrimonio:desc">Patrimônio Z→A</option>
        <option value="marca:asc">Marca A→Z</option>
        <option value="modelo:asc">Tamanho A→Z</option>
      </select>
    </>
  )

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Monitores" total={total} />

      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <DeviceOverviewPanel
          title="Monitores"
          total={overviewPanelTotal}
          items={overviewPanelData}
          accentClassName="bg-blue-600"
          activeFilters={activeOverviewFilters}
          isLoading={overviewLoading}
          onFilter={applyOverviewFilter}
          exportConfig={overviewExportConfig}
        />
      </section>

      <section className={mobileView === 'registros' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <DataTable
          columns={columns}
          data={tableData}
          total={tableTotal}
          page={page}
          totalPages={tableTotalPages}
          onPageChange={setPage}
          onRowClick={openInspect}
          isLoading={loading || overviewFilterLoading}
          filters={filters}
          sort={sort}
          dir={dir}
          onSort={(field, nextDir) => { setSort(field); setDir(nextDir); setPage(1) }}
        />
      </section>

      <MobileSectionNav value={mobileView} onViewChange={setMobileView} views={INVENTORY_MOBILE_VIEWS} />

      <AnimatePresence initial={false}>
        {selected && (
          <MonitorInspectModal
            key={`monitor-${selected.id}`}
            monitor={selected}
            onChanged={refresh}
            onClose={closeInspect}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
