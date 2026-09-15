"use client";

import { usePermission } from "@/hooks/use-permission";

import { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/tables/data-table";
import {
  RackOverviewPanel,
  type OverviewFilter,
  notifyOverviewFilter,
} from "@/components/tables/device-overview-panel";
import type { OverviewExportConfig } from "@/components/tables/overview-export-menu";

import { PageHeader } from "@/components/layout/page-header";
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from "@/components/layout/mobile-section-nav";
import { ForumLinkedIndicator, useForumVinculosResumo } from "@/components/forum/forum-linked-indicator";
import { RackModal } from "@/components/modals/rack-modal";
import { CriarRackModal } from "@/components/modals/criar-rack-modal";
import { SetorSelect } from "@/components/modals/setor-select";
import { LocalidadeSelect } from "@/components/modals/localidade-select";

import { Search, Plus } from "lucide-react";
import { useInspectNavigation } from "@/hooks/use-inspect-navigation";

import type { Rack, PaginatedResponse } from "@/types";
import { UltimaRevisaoButton } from "@/components/checklists/ultima-revisao-popup";

type ActiveOverviewFilter = OverviewFilter & {
  key: string;
  predicate: (item: Rack) => boolean;
};

export default function RacksPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission();
  const searchParams = useSearchParams();
  const inspectId = searchParams.get("inspect");

  const [data, setData] = useState<Rack[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [overviewData, setOverviewData] = useState<Rack[]>([]);
  const [overviewTotal, setOverviewTotal] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [overviewFilterLoading, setOverviewFilterLoading] =
    useState(false);

  const [activeOverviewFilters, setActiveOverviewFilters] =
    useState<ActiveOverviewFilter[]>([]);
  const [mobileView, setMobileView] = useState<InventoryMobileView>("registros");

  const [selected, setSelected] = useState<Rack | null>(null);
  const { openInspect, closeInspect } =
    useInspectNavigation<Rack>(setSelected);
  const [showCriar, setShowCriar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(
    searchParams.get("setor_id"),
  );

  const [localidadeIdFiltro, setLocalidadeIdFiltro] =
    useState<string | null>(
      searchParams.get("localidade_id"),
    );

  const [sort, setSort] = useState("nome_switch");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const cancelledRef = useRef(false);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }
  const forumResumo = useForumVinculosResumo("racks", data.map(item => item.id));

  const columns = useMemo<ColumnDef<Rack, unknown>[]>(
    () => [
      {
        accessorKey: "nome_switch",
        header: "Switch",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {row.original.nome_switch || "—"}
            </span>

            <p className="text-xs text-slate-400">
              {row.original.marca_switch || ""}
            </p>
          </div>
        ),
      },

      {
        accessorKey: "setor_nome",
        header: "Setor",
        enableSorting: false,
        cell: ({ row }) => row.original.setor_nome ?? "—",
      },

      {
        accessorKey: "localidade_nome",
        header: "Localidade",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.localidade_nome ??
          row.original.localizacao ??
          "—",
      },

      {
        accessorKey: "numero_patrimonio",
        header: "Patrimônio",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.numero_patrimonio || "—"}
          </span>
        ),
      },

      {
        id: "portas",
        header: "Portas",
        enableSorting: false,
        cell: ({ row }) => {
          const total = row.original.quantidade_portas;
          const emUso = row.original.portas_em_uso;
          const livres = row.original.portas_livres;

          if (total == null) return "—";

          return (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {total} total
              </span>

              {emUso != null && (
                <>
                  <span className="text-red-500 text-xs font-medium">
                    {emUso} em uso
                  </span>

                  <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                    {livres} livres
                  </span>
                </>
              )}
            </div>
          );
        },
      },
      {
        id: "ultima_revisao",
        header: "Última revisão",
        enableSorting: false,
        cell: ({ row }) => <UltimaRevisaoButton tipo="RACK" id={row.original.id} revisadoEm={row.original.checklist_revisado_em} />,
      },
      {
        id: "forum",
        header: "Fórum",
        enableSorting: false,
        cell: ({ row }) => <ForumLinkedIndicator resumo={forumResumo[row.original.id]} />,
      },
    ],
    [forumResumo],
  );

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);

    async function fetchData() {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort,
        dir,
      });

      if (search) params.set("search", search);

      if (setorIdFiltro) {
        params.set("setor_id", setorIdFiltro);
      }

      if (localidadeIdFiltro) {
        params.set("localidade_id", localidadeIdFiltro);
      }

      try {
        const res = await fetch(`/api/racks?${params}`);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json: PaginatedResponse<Rack> =
          await res.json();

        if (!cancelledRef.current) {
          setData(json.data);
          setTotal(json.total);
          setTotalPages(json.totalPages);
        }
      } catch (err) {
        console.error("[racks page]", err);
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelledRef.current = true;
    };
  }, [
    page,
    search,
    setorIdFiltro,
    localidadeIdFiltro,
    sort,
    dir,
    refreshKey,
  ]);

  useEffect(() => {
    let cancelled = false;

    setOverviewLoading(true);

    async function fetchOverview() {
      const params = new URLSearchParams({
        page: "1",
        limit: "10000",
        sort: "nome_switch",
        dir: "asc",
      });

      if (localidadeIdFiltro) {
        params.set("localidade_id", localidadeIdFiltro);
      }

      try {
        const res = await fetch(`/api/racks?${params}`);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json: PaginatedResponse<Rack> =
          await res.json();

        if (!cancelled) {
          setOverviewData(json.data);
          setOverviewTotal(json.total);
        }
      } catch (err) {
        console.error("[racks overview]", err);
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, localidadeIdFiltro]);

  useEffect(() => {
    if (!inspectId) return;

    fetch(`/api/racks/${inspectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((item) => {
        if (item) setSelected(item);
      })
      .catch(() => {});
  }, [inspectId]);

  const filteredOverviewData =
    activeOverviewFilters.length > 0
      ? overviewData.filter((item) =>
          matchesOverviewFilters(
            item,
            activeOverviewFilters,
          ),
        )
      : null;
  const overviewPanelData =
    filteredOverviewData ?? overviewData;
  const overviewPanelTotal =
    filteredOverviewData?.length ??
    (overviewTotal || total);
  const overviewExportConfig: OverviewExportConfig<Rack> = {
    title: "Overview de Racks",
    filename: "overview-racks",
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: "switch", header: "Switch", value: item => item.nome_switch },
      { key: "marca", header: "Marca", value: item => item.marca_switch },
      { key: "patrimonio", header: "Patrimônio", value: item => item.numero_patrimonio },
      { key: "setor", header: "Setor", value: item => item.setor_nome },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome },
      { key: "localizacao", header: "Localização", value: item => item.localizacao },
      { key: "portas_total", header: "Portas total", value: item => item.quantidade_portas },
      { key: "portas_uso", header: "Portas em uso", value: item => item.portas_em_uso },
      { key: "portas_livres", header: "Portas livres", value: item => item.portas_livres },
      { key: "ocupacao", header: "Ocupação", value: item => item.quantidade_portas ? `${Math.round(((item.portas_em_uso ?? 0) / item.quantidade_portas) * 100)}%` : null },
    ],
  };

  const tableData = filteredOverviewData
    ? filteredOverviewData.slice(
        (page - 1) * 20,
        page * 20,
      )
    : data;

  const tableTotal =
    filteredOverviewData?.length ?? total;

  const tableTotalPages = filteredOverviewData
    ? Math.max(
        1,
        Math.ceil(filteredOverviewData.length / 20),
      )
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
        predicate: (item: Rack) => boolean;
      }
    > = {
      location: {
        label:
          filter.label ?? "Unidade selecionada",

        predicate: (item) =>
          filter.value === "__sem_localidade__"
            ? !item.localidade_id
            : item.localidade_id === filter.value,
      },

      "rack-location": {
        label: `Local: ${
          filter.value ?? "Sem localizacao"
        }`,

        predicate: (item) =>
          (item.localizacao || "Sem localizacao") ===
          filter.value,
      },

      "rack-id": {
        label: "Rack selecionado",

        predicate: (item) =>
          item.id === filter.value,
      },

      "rack-critical": {
        label: "Racks críticos",

        predicate: (item) =>
          !item.quantidade_portas ||
          item.portas_em_uso == null ||
          Math.round(
            ((item.portas_em_uso ?? 0) /
              item.quantidade_portas) *
              100,
          ) >= 85,
      },

      "rack-missing-ports": {
        label: "Racks sem total de portas",

        predicate: (item) =>
          !item.quantidade_portas,
      },

      "rack-missing-used": {
        label: "Racks sem uso informado",

        predicate: (item) =>
          item.portas_em_uso == null,
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
      setActiveOverviewFilters(
        (currentFilters) => {
          const nextFilters =
            toggleOverviewFilter(
              currentFilters,
              candidate,
            );

          notifyOverviewFilter(nextFilters);

          return nextFilters;
        },
      );

      setPage(1);
      setOverviewFilterLoading(false);
    }, 120);
  }

  const inputCls =
    "px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

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
          placeholder="Switch, marca, patrimônio..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <SetorSelect
        value={setorIdFiltro}
        onChange={(id) => {
          setSetorIdFiltro(id);
          setPage(1);
        }}
        placeholder="Filtrar por setor..."
        allowCreate={false}
      />

      <LocalidadeSelect
        value={localidadeIdFiltro}
        onChange={(id) => {
          setLocalidadeIdFiltro(id);
          setSetorIdFiltro(null);
          setPage(1);
        }}
        placeholder="Filtrar por localidade..."
      />

      <select
        value={`${sort}:${dir}`}
        onChange={(e) => {
          const [s, d] =
            e.target.value.split(":");

          setSort(s);
          setDir(d as "asc" | "desc");
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="nome_switch:asc">
          Nome A→Z
        </option>

        <option value="nome_switch:desc">
          Nome Z→A
        </option>

        <option value="created_at:desc">
          Mais recentes
        </option>

        <option value="created_at:asc">
          Mais antigos
        </option>
      </select>
    </>
  );

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Racks" total={tableTotal}>
        {(isAdmin || canRequestInventoryChanges) && (
          <button
            type="button"
            onClick={() => setShowCriar(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <Plus className="w-4 h-4" />
            Novo Rack
          </button>
        )}
      </PageHeader>

      <section className={mobileView === "overview" ? "block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block" : "hidden lg:block"}>
        <RackOverviewPanel
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
          isLoading={
            loading || overviewFilterLoading
          }
          filters={filters}
          sort={sort}
          dir={dir}
          onSort={(field, newDir) => {
            setSort(field);
            setDir(newDir);
            setPage(1);
          }}
        />
      </section>

      <MobileSectionNav
        value={mobileView}
        onViewChange={setMobileView}
        views={INVENTORY_MOBILE_VIEWS}
      />

      <AnimatePresence initial={false}>
        {selected && (
          <RackModal
            key={`rack-${selected.id}`}
            rack={selected}
            onClose={closeInspect}
            onRefresh={refresh}
          />
        )}

        {showCriar && (
          <CriarRackModal
            key="criar-rack"
            onClose={() => setShowCriar(false)}
            onRefresh={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getOverviewFilterKey(
  filter: OverviewFilter,
) {
  return `${filter.kind}:${filter.value ?? ""}`;
}

function toggleOverviewFilter(
  filters: ActiveOverviewFilter[],
  candidate: ActiveOverviewFilter,
) {
  if (candidate.kind === "location") {
    const withoutLocation = filters.filter(
      (filter) => filter.kind !== "location",
    );

    return candidate.value
      ? [...withoutLocation, candidate]
      : withoutLocation;
  }

  const exists = filters.some(
    (filter) => filter.key === candidate.key,
  );

  if (exists) {
    return filters.filter(
      (filter) => filter.key !== candidate.key,
    );
  }

  return [...filters, candidate];
}

function matchesOverviewFilters(
  item: Rack,
  filters: ActiveOverviewFilter[],
) {
  const filtersByKind = filters.reduce(
    (map, filter) => {
      const group = map.get(filter.kind) ?? [];

      group.push(filter);

      map.set(filter.kind, group);

      return map;
    },
    new Map<string, ActiveOverviewFilter[]>(),
  );

  return Array.from(filtersByKind.values()).every(
    (group) =>
      group.some((filter) =>
        filter.predicate(item),
      ),
  );
}
