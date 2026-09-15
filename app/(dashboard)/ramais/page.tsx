'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence } from 'motion/react'
import { useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/data-table'
import { DeviceOverviewPanel, type OverviewFilter, notifyOverviewFilter } from '@/components/tables/device-overview-panel'
import type { OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from '@/components/layout/mobile-section-nav'
import { BoolBadge } from '@/components/dashboard/status-badge'
import { ForumLinkedIndicator, useForumVinculosResumo } from '@/components/forum/forum-linked-indicator'
import { RamalModal } from '@/components/modals/ramal-modal'
import { CriarRamalModal } from '@/components/modals/criar-ramal-modal'
import { Search, Plus } from 'lucide-react'
import type { Ramal, PaginatedResponse } from '@/types'
import { SetorSelect } from '@/components/modals/setor-select'
import { LocalidadeSelect } from '@/components/modals/localidade-select'
import { useInspectNavigation } from '@/hooks/use-inspect-navigation'
import { UltimaRevisaoButton } from '@/components/checklists/ultima-revisao-popup'

type ActiveOverviewFilter = OverviewFilter & {
  key: string
  predicate: (item: Ramal) => boolean
}

function isAllocated(item: Ramal) {
  return (item.alocacoes_ativas?.length ?? 0) > 0 || Boolean(item.alocacao_ativa)
}

function allocationNames(item: Ramal) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => alocacao.colaborador.nome)
    .filter(Boolean)
    .join(', ') || item.alocacao_ativa?.colaborador.nome || 'Livre'
}

function allocationDetails(item: Ramal) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => {
      const setor = alocacao.colaborador.setor_rel?.nome
      const desde = alocacao.data_inicio ? `desde ${alocacao.data_inicio}` : null
      const whatsapp = alocacao.whatsapp ? 'WhatsApp' : null
      return [alocacao.colaborador.nome, setor, desde, whatsapp].filter(Boolean).join(' · ')
    })
    .join('; ') || allocationNames(item)
}

function hasWhatsapp(item: Ramal) {
  return item.alocacao_ativa?.whatsapp === true || (item.alocacoes_ativas ?? []).some(allocation => allocation.whatsapp === true)
}

function missing(value: unknown) {
  if (typeof value === 'string') return value.trim().length === 0
  return value === null || value === undefined
}

function hasMissingRamalData(item: Ramal) {
  return [
    item.numero_ramal,
    item.prefixo_telefonico,
    item.senha_acesso,
    item.setor_nome,
  ].some(missing)
}

function formatRamalNumber(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized) return null
  if (/^\d+$/.test(normalized)) return normalized.padStart(4, '0')
  return normalized
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => clearTimeout(handler)
  }, [value, delayMs])

  return debouncedValue
}

export default function RamaisPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const searchParams = useSearchParams()
  const inspectId = searchParams.get('inspect')

  const [data, setData] = useState<Ramal[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [overviewData, setOverviewData] = useState<Ramal[]>([])
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Ramal | null>(null)
  const { openInspect, closeInspect } = useInspectNavigation<Ramal>(setSelected)
  const [showCriar, setShowCriar] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeOverviewFilters, setActiveOverviewFilters] = useState<ActiveOverviewFilter[]>([])
  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false)
  const [mobileView, setMobileView] = useState<InventoryMobileView>('registros')

  const [search, setSearch] = useState('')
  const [disponibilidade] = useState('')
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(searchParams.get('setor_id'))
  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<string | null>(searchParams.get('localidade_id'))
  const [fila, setFila] = useState('')
  const [alocacao, setAlocacao] = useState('')
  const [sort, setSort] = useState('numero_ramal')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [whatsappFiltro, setWhatsappFiltro] = useState('')

  const debouncedSearch = useDebounce(search, 400)

  const cancelledRef = useRef(false)

  function refresh() { setRefreshKey(k => k + 1) }
  const forumResumo = useForumVinculosResumo('ramais', data.map(item => item.id))

  const columns = useMemo<ColumnDef<Ramal, unknown>[]>(() => [
    {
      accessorKey: 'numero_ramal',
      header: 'Ramal',
      enableSorting: true,
      cell: ({ row }) => {
        const ramal = formatRamalNumber(row.original.numero_ramal)
        return (
          <div>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {ramal ? `Ramal ${ramal}` : '—'}
            </span>
            <p className="text-xs text-slate-400">{row.original.senha_acesso || 'Sem senha de acesso'}</p>
          </div>
        )
      },
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
      cell: ({ row }) => row.original.localidade_nome ?? '—',
    },
    {
      accessorKey: 'fila',
      header: 'Recursos',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          <BoolBadge value={row.original.fila} labelTrue="Fila" labelFalse="Sem fila" />
          {hasWhatsapp(row.original) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">WhatsApp</span>}
        </div>
      ),
    },
    {
      id: 'alocado',
      enableSorting: false,
      header: 'Uso',
      cell: ({ row }) => {
        const alocacoes = row.original.alocacoes_ativas ?? []
        if (alocacoes.length === 0) {
          return <span className="text-slate-400 text-xs">Livre</span>
        }
        if (alocacoes.length === 1) {
          return (
            <span className="text-green-600 dark:text-green-400 text-xs font-medium">
              {alocacoes[0].colaborador.nome}
            </span>
          )
        }
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-green-600 dark:text-green-400 text-xs font-medium">
              {alocacoes[0].colaborador.nome}
            </span>
            <span className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              +{alocacoes.length - 1}
            </span>
          </span>
        )
      },
    },
    {
      id: 'ultima_revisao',
      header: 'Última revisão',
      enableSorting: false,
      cell: ({ row }) => <UltimaRevisaoButton tipo='RAMAL' id={row.original.id} revisadoEm={row.original.checklist_revisado_em} fallbackDate={row.original.ultima_revisao} />,
    },
    {
      id: 'forum',
      header: 'Fórum',
      enableSorting: false,
      cell: ({ row }) => <ForumLinkedIndicator resumo={forumResumo[row.original.id]} />,
    },
  ], [forumResumo])

  useEffect(() => {
    cancelledRef.current = false
    setLoading(true)

    async function fetchData() {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort,
        dir,
      })
      if (debouncedSearch)        params.set('search',        debouncedSearch)
      if (disponibilidade) params.set('disponibilidade', disponibilidade)
      if (setorIdFiltro)     params.set('setor_id',     setorIdFiltro)
      if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
      if (fila !== '')   params.set('fila',          fila)
      if (alocacao)      params.set('alocacao',      alocacao)
      if (whatsappFiltro) params.set('whatsapp', whatsappFiltro)

      try {
        const res = await fetch(`/api/ramais?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<Ramal> = await res.json()
        if (!cancelledRef.current) {
          setData(json.data)
          setTotal(json.total)
          setTotalPages(json.totalPages)
        }
      } catch (err) {
        console.error('[ramais page]', err)
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelledRef.current = true }
  }, [page, debouncedSearch, disponibilidade, fila, alocacao, sort, dir, whatsappFiltro, refreshKey, setorIdFiltro, localidadeIdFiltro])

  useEffect(() => {
    let cancelled = false
    setOverviewLoading(true)

    async function fetchOverview() {
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '10000',
          sort: 'numero_ramal',
          dir: 'asc',
        })
        if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
        const res = await fetch(`/api/ramais?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<Ramal> = await res.json()
        if (!cancelled) {
          setOverviewData(json.data)
          setOverviewTotal(json.total)
        }
      } catch (err) {
        console.error('[ramais overview]', err)
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }

    fetchOverview()
    return () => { cancelled = true }
  }, [refreshKey, localidadeIdFiltro])

  const filteredOverviewData = activeOverviewFilters.length > 0
    ? overviewData.filter(item => matchesOverviewFilters(item, activeOverviewFilters))
    : null
  const overviewPanelData = filteredOverviewData ?? overviewData
  const overviewPanelTotal = filteredOverviewData?.length ?? (overviewTotal || total)
  const overviewExportConfig: OverviewExportConfig<Ramal> = {
    title: 'Overview de Ramais',
    filename: 'overview-ramais',
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: 'numero', header: 'Ramal', value: item => item.numero_ramal },
      { key: 'prefixo', header: 'Prefixo', value: item => item.prefixo_telefonico },
      { key: 'setor', header: 'Setor', value: item => getRamalSetor(item) },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'uso', header: 'Uso', value: item => isAllocated(item) ? 'Ocupado' : 'Livre' },
      { key: 'whatsapp', header: 'WhatsApp', value: item => hasWhatsapp(item) },
      { key: 'fila', header: 'Fila', value: item => item.fila === true },
      { key: 'disponibilidade', header: 'Disponibilidade', value: item => item.disponibilidade },
      { key: 'colaboradores', header: 'Colaboradores', value: item => allocationNames(item) },
      { key: 'relacao_alocacao', header: 'Relação de alocação', value: item => allocationDetails(item) },
      { key: 'ultima_revisao', header: 'Última revisão', value: item => item.ultima_revisao },
    ],
    pdfColumns: [
      { key: 'numero', header: 'Ramal', value: item => item.numero_ramal },
      { key: 'prefixo', header: 'Prefixo', value: item => item.prefixo_telefonico },
      { key: 'setor', header: 'Setor', value: item => getRamalSetor(item) },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'colaboradores', header: 'Colaborador alocado', value: item => allocationNames(item) },
      { key: 'disponibilidade', header: 'Disponibilidade', value: item => item.disponibilidade },
      { key: 'whatsapp', header: 'WhatsApp', value: item => hasWhatsapp(item) },
      { key: 'fila', header: 'Fila', value: item => item.fila === true },
    ],
  }
  const tableData = filteredOverviewData
    ? filteredOverviewData.slice((page - 1) * 20, page * 20)
    : data
  const tableTotal = filteredOverviewData?.length ?? total
  const tableTotalPages = filteredOverviewData ? Math.max(1, Math.ceil(filteredOverviewData.length / 20)) : totalPages

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === 'all') {
      setActiveOverviewFilters([])
      setPage(1)
      notifyOverviewFilter([])
      return
    }

    const predicates: Record<string, { label: string; predicate: (item: Ramal) => boolean }> = {
      allocated: { label: 'Ramais ocupados', predicate: isAllocated },
      free: { label: 'Ramais livres', predicate: (item) => !isAllocated(item) },
      'extension-with-whatsapp': { label: 'Ramais com WhatsApp', predicate: hasWhatsapp },
      'extension-missing-data': { label: 'Ramais com informacoes faltantes', predicate: hasMissingRamalData },
      'extension-queue': { label: 'Ramais de fila', predicate: (item) => item.fila === true },
      location: {
        label: filter.label ?? 'Unidade selecionada',
        predicate: (item) => filter.value === '__sem_localidade__' ? !item.localidade_id : item.localidade_id === filter.value,
      },
      sector: {
        label: `Setor: ${filter.value ?? 'Sem setor'}`,
        predicate: (item) => getRamalSetor(item) === filter.value,
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
      setActiveOverviewFilters((currentFilters) => {
        const nextFilters = toggleOverviewFilter(currentFilters, candidate)
        notifyOverviewFilter(nextFilters)
        return nextFilters
      })
      setPage(1)
      setOverviewFilterLoading(false)
    }, 120)
  }

  useEffect(() => {
    if (!setorIdFiltro || overviewData.length === 0) return
    const setorIds = new Set(setorIdFiltro.split(',').map(id => id.trim()).filter(Boolean))
    const sectorNames = Array.from(new Set(
      overviewData
        .filter(item => item.setor_id && setorIds.has(item.setor_id))
        .map(getRamalSetor)
        .filter((name): name is string => Boolean(name))
    ))
    if (sectorNames.length === 0) return
    void Promise.resolve().then(() => {
      setActiveOverviewFilters((currentFilters) => {
        const nextFilters = [...currentFilters]
        for (const sectorName of sectorNames) {
          if (nextFilters.some(filter => filter.key === `sector:${sectorName}`)) continue
          nextFilters.push({
          kind: 'sector',
          value: sectorName,
          label: `Setor: ${sectorName}`,
          key: `sector:${sectorName}`,
          predicate: (item) => getRamalSetor(item) === sectorName,
          })
        }
        return nextFilters
      })
    })
  }, [setorIdFiltro, overviewData])

  // Abrir modal via ?inspect=id (vindo do colaborador)
  useEffect(() => {
    if (!inspectId) return
    // Buscar diretamente pelo ID — correto: /api/ramais/[id]
    fetch(`/api/ramais/${inspectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(item => { if (item) setSelected(item) })
      .catch(() => {})
  }, [inspectId])

  const inputCls = "px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

  const filters = (
   <>
    <div className="relative flex-1 min-w-[200px]">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
     <input
      value={search}
      onChange={(e) => {
       setSearch(e.target.value);
       setPage(1);
      }}
      placeholder="Ramal, setor ou colaborador..."
      className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
     />
    </div>

    {/* Setor */}
    <SetorSelect
     value={setorIdFiltro}
     onChange={(value) => {
      setSetorIdFiltro(value);
      setPage(1);
     }}
     placeholder="Filtrar por setor..."
    />

    <LocalidadeSelect
     value={localidadeIdFiltro}
     onChange={(value) => {
      setLocalidadeIdFiltro(value); setSetorIdFiltro(null); setPage(1);
     }}
     placeholder="Filtrar por localidade..."
    />

    <select
     value={fila}
     onChange={(e) => {
      setFila(e.target.value);
      setPage(1);
     }}
     className={inputCls}
    >
     <option value="">Com/sem fila</option>
     <option value="true">Com fila</option>
     <option value="false">Sem fila</option>
    </select>

    <select
     value={alocacao}
     onChange={(e) => {
      setAlocacao(e.target.value);
      setPage(1);
     }}
     className={inputCls}
    >
     <option value="">Todos</option>
     <option value="alocado">Alocados</option>
     <option value="livre">Disponíveis</option>
    </select>

    <select
     value={whatsappFiltro}
     onChange={(e) => {
      setWhatsappFiltro(e.target.value);
      setPage(1);
     }}
     className={inputCls}
    >
     <option value="">Com/sem WhatsApp</option>
     <option value="true">Com WhatsApp</option>
    </select>

    <select
     value={`${sort}:${dir}`}
     onChange={(e) => {
      const [s, d] = e.target.value.split(":");
      setSort(s);
      setDir(d as "asc" | "desc");
      setPage(1);
     }}
     className={inputCls}
    >
     <option value="numero_ramal:asc">Ramal ↑</option>
     <option value="numero_ramal:desc">Ramal ↓</option>
     <option value="created_at:desc">Mais recentes</option>
     <option value="created_at:asc">Mais antigos</option>
     <option value="setor_id:asc">Setor A→Z</option>
    </select>
   </>
  );

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Ramais" total={total}>
        {(isAdmin || canRequestInventoryChanges) && (<button type="button" onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
          <Plus className="w-4 h-4" /> Novo Ramal
        </button>)}
      </PageHeader>

      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <DeviceOverviewPanel
          title="Ramais"
          total={overviewPanelTotal}
          items={overviewPanelData}
          accentClassName="bg-emerald-500"
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
          onSort={(field, newDir) => { setSort(field); setDir(newDir); setPage(1) }}
        />
      </section>

      <MobileSectionNav
        value={mobileView}
        onViewChange={setMobileView}
        views={INVENTORY_MOBILE_VIEWS}
      />

      <AnimatePresence initial={false}>
        {showCriar && (
          <CriarRamalModal key="criar-ramal" onClose={() => setShowCriar(false)} onRefresh={refresh} />
        )}
        {selected && (
          <RamalModal
            key={`ramal-${selected.id}`}
            ramal={selected}
            onClose={closeInspect}
            onRefresh={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function getRamalSetor(item?: Ramal | null) {
  return item?.setor_nome || item?.alocacao_ativa?.colaborador?.setor_rel?.nome || 'Sem setor'
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

function matchesOverviewFilters(item: Ramal, filters: ActiveOverviewFilter[]) {
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
