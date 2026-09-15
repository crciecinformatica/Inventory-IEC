"use client";
import { usePermission } from '@/hooks/use-permission'

import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/data-table";
import {
  ImpressoraOverviewPanel,
  type OverviewFilter,
  notifyOverviewFilter,
} from "@/components/tables/device-overview-panel";
import type { OverviewExportConfig } from "@/components/tables/overview-export-menu";
import { PageHeader } from "@/components/layout/page-header";
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from "@/components/layout/mobile-section-nav";
import { BoolBadge } from "@/components/dashboard/status-badge";
import { ForumLinkedIndicator, useForumVinculosResumo } from "@/components/forum/forum-linked-indicator";
import { ImpressoraModal } from "@/components/modals/impressora-modal";
import { CriarImpressoraModal } from "@/components/modals/criar-impressora-modal";
import { SetorSelect } from "@/components/modals/setor-select";
import { LocalidadeSelect } from "@/components/modals/localidade-select";
import { Search, Plus } from "lucide-react";
import { useInspectNavigation } from "@/hooks/use-inspect-navigation";

import type { Impressora, PaginatedResponse } from "@/types";
import { UltimaRevisaoButton } from "@/components/checklists/ultima-revisao-popup";

type ActiveOverviewFilter = OverviewFilter & {
  key: string;
  label: string;
  predicate: (item: Impressora) => boolean;
};

function isMissing(value: unknown) {
  return value === null || value === undefined || value === "";
}

function isRevisionStale(value?: string | null) {
  if (!value) return true;

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) return true;

  return Math.floor((Date.now() - time) / 86_400_000) > 90;
}

function hasMissingPrinterData(item: Impressora) {
  return [
    item.nome_host,
    item.fabricante,
    item.modelo,
    item.numero_serie,
    item.identificador_selb,
    item.endereco_ip,
  ].some(isMissing);
}

export default function ImpressorasPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const searchParams = useSearchParams();

  const inspectId = searchParams.get("inspect");

  const [data, setData] = useState<Impressora[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [overviewData, setOverviewData] = useState<Impressora[]>([]);
  const [overviewTotal, setOverviewTotal] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Impressora | null>(null);
  const { openInspect, closeInspect } =
    useInspectNavigation<Impressora>(setSelected);

  const [search, setSearch] = useState("");

  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(
    searchParams.get("setor_id")
  );
  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<string | null>(
    searchParams.get("localidade_id")
  );

  const [andar, setAndar] = useState("");

  const [status, setStatus] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const [showCriar, setShowCriar] = useState(false);

  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false);

  const [activeOverviewFilters, setActiveOverviewFilters] = useState<
    ActiveOverviewFilter[]
  >([]);
  const [mobileView, setMobileView] = useState<InventoryMobileView>("registros");

    const [sort, setSort] = useState('nome')
    const [dir, setDir]   = useState<'asc' | 'desc'>('asc')

  const fetchData = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });

    if (search) params.set("search", search);

    if (setorIdFiltro) params.set("setor_id", setorIdFiltro);
    if (localidadeIdFiltro) params.set("localidade_id", localidadeIdFiltro);

    if (andar) params.set("andar", andar);

    if (status) params.set("status", status);
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)

    const res = await fetch(`/api/impressoras?${params}`);

    const json: PaginatedResponse<Impressora> = await res.json();

    setData(json.data);
    setTotal(json.total);
    setTotalPages(json.totalPages);

    setLoading(false);
  }, [page, search, setorIdFiltro, andar, status, sort, dir, localidadeIdFiltro]);


  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData, refreshKey]);

  // inspect modal direto da URL
  useEffect(() => {
    if (!inspectId || data.length === 0) return;

    const found = data.find((d) => d.id === inspectId);

    if (found) setSelected(found);
  }, [inspectId, data]);

  // fallback fetch caso não esteja na página atual
  useEffect(() => {
    if (!inspectId) return;

    fetch(`/api/impressoras/${inspectId}`)
      .then((r) => r.json())
      .then((item) => {
        if (item) setSelected(item);
      });
  }, [inspectId]);

  const filteredOverviewData =
    activeOverviewFilters.length > 0
      ? overviewData.filter((item) =>
          matchesOverviewFilters(item, activeOverviewFilters)
        )
      : null;
  const overviewPanelData = filteredOverviewData ?? overviewData;
  const overviewPanelTotal =
    filteredOverviewData?.length ?? (overviewTotal || total);
  const overviewExportConfig: OverviewExportConfig<Impressora> = {
    title: "Overview de Impressoras",
    filename: "overview-impressoras",
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: "host", header: "Host", value: item => item.nome_host },
      { key: "fabricante", header: "Fabricante", value: item => item.fabricante },
      { key: "modelo", header: "Modelo", value: item => item.modelo },
      { key: "serie", header: "Nº Série", value: item => item.numero_serie },
      { key: "selb", header: "SELB", value: item => item.identificador_selb },
      { key: "ip", header: "IP", value: item => item.endereco_ip },
      { key: "setor", header: "Setor", value: item => item.setor_nome || "Sem setor registrado" },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome ?? item.localidade },
      { key: "andar", header: "Andar", value: item => item.andar },
      { key: "status", header: "Ativa", value: item => item.status !== false },
      { key: "revisao", header: "Revisão", value: item => item.revisao },
    ],
  };

  const tableData = filteredOverviewData
    ? filteredOverviewData.slice((page - 1) * 20, page * 20)
    : data;

  const tableTotal = filteredOverviewData?.length ?? total;

  const tableTotalPages = filteredOverviewData
    ? Math.max(1, Math.ceil(filteredOverviewData.length / 20))
    : totalPages;

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === "all") {
      setActiveOverviewFilters([]);
      setPage(1);

      notifyOverviewFilter([]);

      return;
    }

    const predicates: Record<
      string,
      {
        label: string;
        predicate: (item: Impressora) => boolean;
      }
    > = {
      "printer-status": {
        label:
          filter.value === "false"
            ? "Impressoras inativas"
            : "Impressoras ativas",
        predicate: (item) =>
          filter.value === "false"
            ? item.status === false
            : item.status !== false,
      },

      "printer-stale": {
        label: "Impressoras sem revisão em 3 meses",
        predicate: (item) => isRevisionStale(item.revisao),
      },

      "printer-no-revision": {
        label: "Impressoras sem revisão registrada",
        predicate: (item) => !item.revisao,
      },

      "printer-missing-data": {
        label: "Impressoras com dados faltantes",
        predicate: hasMissingPrinterData,
      },

      "printer-no-ip": {
        label: "Impressoras sem IP",
        predicate: (item) => isMissing(item.endereco_ip),
      },

      "printer-no-sector": {
        label: "Impressoras sem setor registrado",
        predicate: (item) => !item.setor_id || !item.setor_nome,
      },

      "printer-no-identity": {
        label: "Impressoras sem identificação",
        predicate: (item) =>
          isMissing(item.nome_host) || isMissing(item.numero_serie),
      },

      "printer-attention": {
        label: "Impressoras que requerem atenção",
        predicate: (item) =>
          item.status === false ||
          isRevisionStale(item.revisao) ||
          hasMissingPrinterData(item),
      },

      location: {
        label: filter.label ?? "Unidade selecionada",
        predicate: (item) =>
          filter.value === "__sem_localidade__"
            ? !item.localidade_id
            : item.localidade_id === filter.value,
      },

      "printer-sector": {
        label: `Setor: ${filter.value ?? "Sem setor registrado"}`,
        predicate: (item) =>
          (
            item.setor_id && item.setor_nome
              ? item.setor_nome
              : "Sem setor registrado"
          ) === filter.value,
      },

      "printer-floor": {
        label: `Andar: ${filter.value ?? "Sem andar"}`,
        predicate: (item) => (item.andar || "Sem andar") === filter.value,
      },
    };

    const nextFilter = predicates[filter.kind];

    if (!nextFilter) return;

    const candidate: ActiveOverviewFilter = {
      ...filter,
      key: getOverviewFilterKey(filter),
      label: nextFilter.label,
      predicate: nextFilter.predicate,
    };

    setOverviewFilterLoading(true);

    window.setTimeout(() => {
      setActiveOverviewFilters((currentFilters) => {
        const nextFilters = toggleOverviewFilter(
          currentFilters,
          candidate
        );

        notifyOverviewFilter(nextFilters);

        return nextFilters;
      });

      setPage(1);

      setOverviewFilterLoading(false);
    }, 120);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchOverview() {
      setOverviewLoading(true);

      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "10000",
          sort: "created_at",
          dir: "desc",
        });
        if (localidadeIdFiltro) params.set("localidade_id", localidadeIdFiltro);

        const res = await fetch(`/api/impressoras?${params}`);

        const json: PaginatedResponse<Impressora> = await res.json();

        if (!cancelled) {
          setOverviewData(json.data);
          setOverviewTotal(json.total);
        }
      } catch (error) {
        console.error("[impressoras overview]", error);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    }

    fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, localidadeIdFiltro]);

  const forumResumo = useForumVinculosResumo("impressoras", data.map(item => item.id));

  const columns = useMemo<ColumnDef<Impressora, unknown>[]>(
    () => [
      {
        accessorKey: "nome_host",
        header: "Nome Host",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-medium">
            {(getValue() as string) || "—"}
          </span>
        ),
      },

      {
        accessorKey: "fabricante",
        header: "Fabricante",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "modelo",
        header: "Modelo",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "numero_serie",
        header: "Nº Série",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "identificador_selb",
        header: "SELB",
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "endereco_ip",
        header: "IP",
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "setor",
        header: "Setor",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.setor_nome ?? "—",
      },

      {
        accessorKey: "localidade_nome",
        header: "Localidade",
        cell: ({ row }) =>
          row.original.localidade_nome ?? row.original.localidade ?? "—",
      },

      {
        accessorKey: "andar",
        header: "Andar",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      },

      {
        accessorKey: "revisao",
        header: "Última revisão",
        enableSorting: true,
        cell: ({ row }) => (
          <UltimaRevisaoButton
            tipo="IMPRESSORA"
            id={row.original.id}
            revisadoEm={row.original.checklist_revisado_em}
            fallbackDate={row.original.revisao}
          />
        ),
      },

      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ getValue }) => (
          <BoolBadge
            value={getValue() as boolean}
            labelTrue="Ativo"
            labelFalse="Inativo"
          />
        ),
      },
      {
        id: "forum",
        header: "Fórum",
        enableSorting: false,
        cell: ({ row }) => <ForumLinkedIndicator resumo={forumResumo[row.original.id]} />,
      },
    ],
    [forumResumo]
  );

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
          placeholder="Buscar por nome host, nº série ou SELB..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
          setLocalidadeIdFiltro(value);
          setSetorIdFiltro(null);
          setPage(1);
        }}
        placeholder="Filtrar por localidade..."
      />

      <input
        value={andar}
        onChange={(e) => {
          setAndar(e.target.value);
          setPage(1);
        }}
        placeholder="Andar..."
        className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-28"
      />

      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Todos os status</option>

        <option value="true">Ativo</option>

        <option value="false">Inativo</option>
      </select>
    </>
  );

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Impressoras" total={total}>
        {(isAdmin || canRequestInventoryChanges) && (<button type="button" onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
          <Plus className="w-4 h-4" /> Nova Impressora
        </button>)}
      </PageHeader>

      <section className={mobileView === "overview" ? "block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block" : "hidden lg:block"}>
        <ImpressoraOverviewPanel
          total={overviewPanelTotal}
          items={overviewPanelData}
          activeFilters={activeOverviewFilters}
          isLoading={overviewLoading}
          onFilter={applyOverviewFilter}
          exportConfig={overviewExportConfig}
        />
      </section>

      <section className={mobileView === "registros" ? "block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block" : "hidden lg:block"}>
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
          <ImpressoraModal
            key={`impressora-${selected.id}`}
            impressora={selected}
            onClose={closeInspect}
            onRefresh={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {showCriar && (
          <CriarImpressoraModal
            key="criar-impressora"
            onClose={() => setShowCriar(false)}
            onRefresh={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getOverviewFilterKey(filter: OverviewFilter) {
  return `${filter.kind}:${filter.value ?? ""}`;
}

function toggleOverviewFilter(
  filters: ActiveOverviewFilter[],
  candidate: ActiveOverviewFilter
) {
  if (candidate.kind === "location") {
    const withoutLocation = filters.filter(
      (filter) => filter.kind !== "location"
    );

    return candidate.value ? [...withoutLocation, candidate] : withoutLocation;
  }

  const exists = filters.some(
    (filter) => filter.key === candidate.key
  );

  if (exists) {
    return filters.filter(
      (filter) => filter.key !== candidate.key
    );
  }

  return [...filters, candidate];
}

function matchesOverviewFilters(
  item: Impressora,
  filters: ActiveOverviewFilter[]
) {
  const filtersByKind = filters.reduce((map, filter) => {
    const group = map.get(filter.kind) ?? [];

    group.push(filter);

    map.set(filter.kind, group);

    return map;
  }, new Map<string, ActiveOverviewFilter[]>());

  return Array.from(filtersByKind.values()).every((group) =>
    group.some((filter) => filter.predicate(item))
  );
}
