'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence } from 'motion/react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/data-table'
import { DeviceOverviewPanel, type OverviewFilter, notifyOverviewFilter } from '@/components/tables/device-overview-panel'
import type { OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from '@/components/layout/mobile-section-nav'
import { CategoriaBadge } from '@/components/dashboard/status-badge'
import { ForumLinkedIndicator, useForumVinculosResumo } from '@/components/forum/forum-linked-indicator'
import { MaquinaModal } from '@/components/modals/maquina-modal'
import { CriarMaquinaModal } from '@/components/modals/criar-maquina-modal'
import { SetorSelect } from '@/components/modals/setor-select'
import { LocalidadeSelect } from '@/components/modals/localidade-select'
import { Search, Plus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import type { Maquina, PaginatedResponse } from '@/types'
import { useInspectNavigation } from '@/hooks/use-inspect-navigation'
import { UltimaRevisaoButton } from '@/components/checklists/ultima-revisao-popup'

type ActiveOverviewFilter = OverviewFilter & {
  key: string
  predicate: (item: Maquina) => boolean
}

function isAllocated(item: Maquina) {
  return (item.alocacoes_ativas?.length ?? 0) > 0 || Boolean(item.alocacao_ativa)
}

function allocationNames(item: Maquina) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => alocacao.colaborador.nome)
    .filter(Boolean)
    .join(', ') || item.alocacao_ativa?.colaborador.nome || 'Livre'
}

function allocationDetails(item: Maquina) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => {
      const setor = alocacao.colaborador.setor_rel?.nome
      const desde = alocacao.data_inicio ? `desde ${alocacao.data_inicio}` : null
      return [alocacao.colaborador.nome, setor, desde].filter(Boolean).join(' · ')
    })
    .join('; ') || allocationNames(item)
}

function missing(value: unknown) {
  if (typeof value === 'string') return value.trim().length === 0
  return value === null || value === undefined
}

function hasMissingMachineData(item: Maquina) {
  return [
    item.nome_host,
    item.identificador,
    item.fabricante,
    item.modelo,
    item.categoria,
    item.processador,
    item.memoria_ram,
    item.armazenamento,
    item.endereco_ip,
    item.patrimonio_cpu,
    item.patrimonio_monitor,
    item.data_revisao,
    item.setor_nome,
  ].some(missing)
}

function isBackupMachine(item: Maquina) {
  return item.categoria === 'Backup'
}

export default function MaquinasPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const [data, setData] = useState<Maquina[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [overviewData, setOverviewData] = useState<Maquina[]>([])
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Maquina | null>(null)
  const [showCriar, setShowCriar] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const searchParams = useSearchParams()
  const inspectId = searchParams.get('inspect')
  const { openInspect, closeInspect } = useInspectNavigation<Maquina>(setSelected)
  const [activeOverviewFilters, setActiveOverviewFilters] = useState<ActiveOverviewFilter[]>([])
  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false)
  const [mobileView, setMobileView] = useState<InventoryMobileView>('registros')

  // Filtros
  const [search, setSearch] = useState('')
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(searchParams.get('setor_id'))
  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<string | null>(searchParams.get('localidade_id'))
  const [categoria, setCategoria] = useState('')
  const [fabricante, setFabricante] = useState('')
  const [alocacao, setAlocacao] = useState('')
  const [sort, setSort] = useState('endereco_ip')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  function refresh() { setRefreshKey(k => k + 1) }

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
      if (search)    params.set('search',    search)
      if (setorIdFiltro)     params.set('setor_id',     setorIdFiltro)
      if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
      if (categoria) params.set('categoria', categoria)
      if (fabricante)params.set('fabricante',fabricante)
      if (alocacao)  params.set('alocacao',  alocacao)

      try {
        const res = await fetch(`/api/maquinas?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<Maquina> = await res.json()
        if (!cancelled) {
          setData(json.data)
          setTotal(json.total)
          setTotalPages(json.totalPages)
        }
      } catch (err) {
        console.error('[maquinas page]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [page, search, setorIdFiltro, localidadeIdFiltro, categoria, fabricante, alocacao, sort, dir, refreshKey])

  useEffect(() => {
    let cancelled = false
    setOverviewLoading(true)

    async function fetchOverview() {
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '10000',
          sort: 'nome_host',
          dir: 'asc',
        })
        if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
        const res = await fetch(`/api/maquinas?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: PaginatedResponse<Maquina> = await res.json()
        if (!cancelled) {
          setOverviewData(json.data)
          setOverviewTotal(json.total)
        }
      } catch (err) {
        console.error('[maquinas overview]', err)
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
  const overviewExportConfig: OverviewExportConfig<Maquina> = {
    title: 'Overview de Máquinas',
    filename: 'overview-maquinas',
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: 'endereco_ip', header: 'IP', value: item => item.endereco_ip },
      { key: 'nome_host', header: 'Host', value: item => item.nome_host },
      { key: 'identificador', header: 'Identificador', value: item => item.identificador },
      { key: 'modelo', header: 'Modelo', value: item => item.modelo },
      { key: 'fabricante', header: 'Fabricante', value: item => item.fabricante },
      { key: 'categoria', header: 'Categoria', value: item => item.categoria },
      { key: 'setor', header: 'Setor', value: item => getMaquinaSetor(item) },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'uso', header: 'Uso', value: item => isAllocated(item) ? 'Ocupada' : 'Livre' },
      { key: 'colaboradores', header: 'Colaboradores', value: item => allocationNames(item) },
      { key: 'relacao_alocacao', header: 'Relação de alocação', value: item => allocationDetails(item) },
      { key: 'patrimonio_cpu', header: 'Patrimônio CPU', value: item => item.patrimonio_cpu },
      { key: 'patrimonio_monitor', header: 'Patrimônio Monitor', value: item => item.patrimonio_monitor },
      { key: 'data_revisao', header: 'Última revisão', value: item => item.data_revisao },
    ],
    pdfColumns: [
      { key: 'endereco_ip', header: 'IP', value: item => item.endereco_ip },
      { key: 'nome_host', header: 'Host', value: item => item.nome_host },
      { key: 'modelo', header: 'Modelo', value: item => item.modelo },
      { key: 'setor', header: 'Setor', value: item => getMaquinaSetor(item) },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'colaboradores', header: 'Colaborador alocado', value: item => allocationNames(item) },
      { key: 'patrimonio_cpu', header: 'Patrimônio CPU', value: item => item.patrimonio_cpu },
      { key: 'data_revisao', header: 'Última revisão', value: item => item.data_revisao },
    ],
  }
  const tableData = filteredOverviewData
    ? filteredOverviewData.slice((page - 1) * 20, page * 20)
    : data
  const tableTotal = filteredOverviewData?.length ?? total
  const tableTotalPages = filteredOverviewData ? Math.max(1, Math.ceil(filteredOverviewData.length / 20)) : totalPages
  const forumResumo = useForumVinculosResumo('maquinas', tableData.map(item => item.id))

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === 'all') {
      setActiveOverviewFilters([])
      setPage(1)
      notifyOverviewFilter([])
      return
    }

    const predicates: Record<string, { label: string; predicate: (item: Maquina) => boolean }> = {
      allocated: { label: 'Máquinas ocupadas', predicate: isAllocated },
      free: { label: 'Máquinas livres', predicate: (item) => !isAllocated(item) },
      'machine-missing-data': { label: 'Máquinas com informacoes faltantes', predicate: hasMissingMachineData },
      'machine-backup': { label: 'Máquinas backup', predicate: isBackupMachine },
      location: {
        label: filter.label ?? 'Unidade selecionada',
        predicate: (item) => filter.value === '__sem_localidade__' ? !item.localidade_id : item.localidade_id === filter.value,
      },
      sector: {
        label: `Setor: ${filter.value ?? 'Sem setor'}`,
        predicate: (item) => getMaquinaSetor(item) === filter.value,
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
        .map(getMaquinaSetor)
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
          predicate: (item) => getMaquinaSetor(item) === sectorName,
          })
        }
        return nextFilters
      })
    })
  }, [setorIdFiltro, overviewData])

    useEffect(() => {
    if (!inspectId || data.length === 0) return
    const found = data.find(d => d.id === inspectId)
    if (found) setSelected(found)
  }, [inspectId, data])

  useEffect(() => {
    if (!inspectId) return
    fetch(`/api/maquinas/${inspectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(item => { if (item) setSelected(item) })
      .catch(() => {})
  }, [inspectId])

  const columns = useMemo<ColumnDef<Maquina, unknown>[]>(() => [
    {
      accessorKey: 'nome_host',
      header: 'Máquina',
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-slate-900 dark:text-slate-100">{row.original.endereco_ip || row.original.nome_host || '—'}</span>
          <p className="text-xs text-slate-400">{[row.original.nome_host, row.original.modelo].filter(Boolean).join(' · ') || 'Sem host/modelo'}</p>
        </div>
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'categoria',
      header: 'Categoria',
      cell: ({ row }) => <CategoriaBadge categoria={row.original.categoria} />,
      enableSorting: false,
    },
    {
      accessorKey: 'setor',
      header: 'Setor',
      cell: ({ row }) => row.original.setor_nome ?? '—',
    },
    {
      accessorKey: 'localidade_nome',
      header: 'Localidade',
      cell: ({ row }) => row.original.localidade_nome ?? '—',
      enableSorting: false,
    },
    {
      id: 'alocado',
      header: 'Uso',
      enableSorting: false,
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
      cell: ({ row }) => <UltimaRevisaoButton tipo='MAQUINA' id={row.original.id} revisadoEm={row.original.checklist_revisado_em} fallbackDate={row.original.data_revisao} />,
    },
    {
      id: 'forum',
      header: 'Fórum',
      enableSorting: false,
      cell: ({ row }) => <ForumLinkedIndicator resumo={forumResumo[row.original.id]} />,
    },
  ], [forumResumo])

  const inputCls = "px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

  const filters = (
    <>
      {/* Busca */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="IP, host, identificador ou colaborador..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Setor */}
      <SetorSelect
        value={setorIdFiltro}
        onChange={(value) => {
          setSetorIdFiltro(value)
          setPage(1)
        }}
        placeholder="Filtrar por setor..."
      />

      <LocalidadeSelect
        value={localidadeIdFiltro}
        onChange={(value) => {
          setLocalidadeIdFiltro(value)
          setSetorIdFiltro(null)
          setPage(1)
        }}
        placeholder="Filtrar por localidade..."
      />

      {/* Categoria */}
      <select
        value={categoria}
        onChange={(e) => { setCategoria(e.target.value); setPage(1) }}
        className={inputCls}
      >
        <option value="">Todas as categorias</option>
        <option value="Administrativa">Administrativa</option>
        <option value="Academica">Acadêmica</option>
        <option value="Backup">Backup</option>
      </select>

      {/* Fabricante */}
      <input
        value={fabricante}
        onChange={(e) => { setFabricante(e.target.value); setPage(1) }}
        placeholder="Fabricante..."
        className={`${inputCls} w-32`}
      />

      {/* Disponibilidade */}
      <select
        value={alocacao}
        onChange={(e) => { setAlocacao(e.target.value); setPage(1) }}
        className={inputCls}
      >
        <option value="">Todos</option>
        <option value="alocado">Alocados</option>
        <option value="livre">Disponíveis</option>
      </select>

      {/* Ordenação */}
      <select
        value={`${sort}:${dir}`}
        onChange={(e) => {
          const [s, d] = e.target.value.split(':')
          setSort(s)
          setDir(d as 'asc' | 'desc')
          setPage(1)
        }}
        className={inputCls}
      >
        <option value="endereco_ip:asc">IP A→Z</option>
        <option value="endereco_ip:desc">IP Z→A</option>
        <option value="nome_host:asc">Host A→Z</option>
        <option value="nome_host:desc">Host Z→A</option>
        <option value="created_at:desc">Mais recentes</option>
        <option value="created_at:asc">Mais antigos</option>
        <option value="fabricante:asc">Fabricante A→Z</option>
      </select>
    </>
  )

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Máquinas" total={total}>
        {(isAdmin || canRequestInventoryChanges) && (<button type="button" onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
          <Plus className="w-4 h-4" /> Nova Máquina
        </button>)}
      </PageHeader>

      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <DeviceOverviewPanel
          title="Máquinas"
          total={overviewPanelTotal}
          items={overviewPanelData}
          accentClassName="bg-blue-500"
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
        {selected && (
          <MaquinaModal
            key={`maquina-${selected.id}`}
            maquina={selected}
            onClose={closeInspect}
            onRefresh={refresh}
          />
        )}
        {showCriar && (
          <CriarMaquinaModal
            key="criar-maquina"
            onClose={() => setShowCriar(false)}
            onRefresh={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function getMaquinaSetor(item?: Maquina | null) {
  return item?.setor_nome || item?.alocacao_ativa?.colaborador.setor_rel?.nome || 'Sem setor'
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

function matchesOverviewFilters(item: Maquina, filters: ActiveOverviewFilter[]) {
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
