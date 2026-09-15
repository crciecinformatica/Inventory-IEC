"use client";

import { usePermission } from "@/hooks/use-permission";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/tables/data-table";
import {
  DeviceOverviewPanel,
  type OverviewFilter,
  notifyOverviewFilter,
} from "@/components/tables/device-overview-panel";
import type { OverviewExportConfig } from "@/components/tables/overview-export-menu";

import { PageHeader } from "@/components/layout/page-header";
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from "@/components/layout/mobile-section-nav";
import { CategoriaBadge } from "@/components/dashboard/status-badge";
import { ForumLinkedIndicator, useForumVinculosResumo } from "@/components/forum/forum-linked-indicator";

import { NotebookModal } from "@/components/modals/notebook-modal";
import { CriarNotebookModal } from "@/components/modals/criar-notebook-modal";
import { SetorSelect } from "@/components/modals/setor-select";
import { LocalidadeSelect } from "@/components/modals/localidade-select";

import { Search, Plus } from "lucide-react";

import { useInspectNavigation } from "@/hooks/use-inspect-navigation";

import type { Notebook, PaginatedResponse } from "@/types";
import { UltimaRevisaoButton } from "@/components/checklists/ultima-revisao-popup";

type ActiveOverviewFilter = OverviewFilter & {
  key: string;
  predicate: (item: Notebook) => boolean;
};

function isAllocated(item: Notebook) {
  return (
    (item.alocacoes_ativas?.length ?? 0) > 0 ||
    Boolean(item.alocacao_ativa)
  );
}

function isOccupied(item: Notebook) {
  return isAllocated(item) || item.emprestado === true;
}

function allocationNames(item: Notebook) {
  const allocated = (item.alocacoes_ativas ?? [])
    .map(alocacao => alocacao.colaborador.nome)
    .filter(Boolean)
    .join(", ");
  return item.emprestado_colaborador_nome || allocated || item.alocacao_ativa?.colaborador.nome || "Livre";
}

function allocationDetails(item: Notebook) {
  const details = (item.alocacoes_ativas ?? [])
    .map(alocacao => {
      const setor = alocacao.colaborador.setor_rel?.nome;
      const desde = alocacao.data_inicio ? `desde ${alocacao.data_inicio}` : null;
      return [alocacao.colaborador.nome, setor, desde].filter(Boolean).join(" · ");
    })
    .join("; ");

  if (item.emprestado_colaborador_nome) {
    return [item.emprestado_colaborador_nome, item.emprestado_colaborador_setor, item.emprestado_desde ? `emprestado desde ${item.emprestado_desde}` : null, item.emprestado_obs].filter(Boolean).join(" · ");
  }

  return details || allocationNames(item);
}

function hasMissingNotebookData(item: Notebook) {
  return [
    item.modelo,
    item.fabricante,
    item.categoria,
    item.processador,
    item.memoria,
    item.armazenamento,
    item.numero_patrimonio,
    item.data_revisao,
    item.setor_nome,
  ].some(
    (value) =>
      value === null ||
      value === undefined ||
      value === "",
  );
}

export default function NotebooksPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission();

  const searchParams = useSearchParams();
  const inspectId = searchParams.get("inspect");

  const [data, setData] = useState<Notebook[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [overviewData, setOverviewData] = useState<Notebook[]>([]);
  const [overviewTotal, setOverviewTotal] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Notebook | null>(null);
  const { openInspect, closeInspect } =
    useInspectNavigation<Notebook>(setSelected);
  const [showCriar, setShowCriar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeOverviewFilters, setActiveOverviewFilters] = useState<
    ActiveOverviewFilter[]
  >([]);

  const [overviewFilterLoading, setOverviewFilterLoading] =
    useState(false);
  const [mobileView, setMobileView] = useState<InventoryMobileView>("registros");

  // filtros
  const [search, setSearch] = useState("");
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(
    searchParams.get("setor_id"),
  );

  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<
    string | null
  >(searchParams.get("localidade_id"));

  const [categoria, setCategoria] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [alocacao, setAlocacao] = useState("");

  const [sort, setSort] = useState("modelo");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const cancelledRef = useRef(false);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      sort,
      dir,
    });

    if (search) params.set("search", search);
    if (setorIdFiltro) params.set("setor_id", setorIdFiltro);
    if (localidadeIdFiltro) {
      params.set("localidade_id", localidadeIdFiltro);
    }
    if (categoria) params.set("categoria", categoria);
    if (fabricante) params.set("fabricante", fabricante);
    if (alocacao) params.set("alocacao", alocacao);

    try {
      const res = await fetch(`/api/notebooks?${params}`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json: PaginatedResponse<Notebook> = await res.json();

      if (!cancelledRef.current) {
        setData(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch (err) {
      console.error("[notebooks page]", err);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [
    page,
    search,
    setorIdFiltro,
    localidadeIdFiltro,
    categoria,
    fabricante,
    alocacao,
    sort,
    dir,
  ]);

  useEffect(() => {
    cancelledRef.current = false;

    setLoading(true);

    fetchData();

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchData, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    setOverviewLoading(true);

    async function fetchOverview() {
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "10000",
          sort: "modelo",
          dir: "asc",
        });

        if (localidadeIdFiltro) {
          params.set("localidade_id", localidadeIdFiltro);
        }

        const res = await fetch(`/api/notebooks?${params}`);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json: PaginatedResponse<Notebook> =
          await res.json();

        if (!cancelled) {
          setOverviewData(json.data);
          setOverviewTotal(json.total);
        }
      } catch (err) {
        console.error("[notebooks overview]", err);
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

  const filteredOverviewData =
    activeOverviewFilters.length > 0
      ? overviewData.filter((item) =>
          matchesOverviewFilters(item, activeOverviewFilters),
        )
      : null;
  const overviewPanelData = filteredOverviewData ?? overviewData;
  const overviewPanelTotal =
    filteredOverviewData?.length ?? (overviewTotal || total);
  const overviewExportConfig: OverviewExportConfig<Notebook> = {
    title: "Overview de Notebooks",
    filename: "overview-notebooks",
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: "modelo", header: "Modelo", value: item => item.modelo },
      { key: "fabricante", header: "Fabricante", value: item => item.fabricante },
      { key: "patrimonio", header: "Patrimônio", value: item => item.numero_patrimonio },
      { key: "categoria", header: "Categoria", value: item => item.categoria },
      { key: "setor", header: "Setor", value: item => getNotebookSetor(item) },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome },
      { key: "uso", header: "Uso", value: item => isOccupied(item) ? "Ocupado" : "Livre" },
      { key: "alocado", header: "Alocado", value: item => isAllocated(item) },
      { key: "emprestado", header: "Emprestado", value: item => item.emprestado },
      { key: "colaborador", header: "Colaborador/Empréstimo", value: item => allocationNames(item) },
      { key: "relacao_alocacao", header: "Relação de alocação", value: item => allocationDetails(item) },
      { key: "processador", header: "Processador", value: item => item.processador },
      { key: "memoria", header: "Memória", value: item => item.memoria },
      { key: "armazenamento", header: "Armazenamento", value: item => item.armazenamento },
      { key: "data_revisao", header: "Última revisão", value: item => item.data_revisao },
    ],
    pdfColumns: [
      { key: "patrimonio", header: "Patrimônio", value: item => item.numero_patrimonio },
      { key: "modelo", header: "Modelo", value: item => item.modelo },
      { key: "fabricante", header: "Fabricante", value: item => item.fabricante },
      { key: "setor", header: "Setor", value: item => getNotebookSetor(item) },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome },
      { key: "colaborador", header: "Colaborador alocado", value: item => allocationNames(item) },
      { key: "categoria", header: "Categoria", value: item => item.categoria },
      { key: "data_revisao", header: "Última revisão", value: item => item.data_revisao },
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
  const forumResumo = useForumVinculosResumo("notebooks", tableData.map(item => item.id));

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
        predicate: (item: Notebook) => boolean;
      }
    > = {
      "notebook-occupied": {
        label: "Notebooks ocupados",
        predicate: isOccupied,
      },

      allocated: {
        label: "Notebooks alocados",
        predicate: isAllocated,
      },

      "notebook-borrowed": {
        label: "Notebooks emprestados",
        predicate: (item) =>
          item.emprestado === true,
      },

      "notebook-missing-data": {
        label:
          "Notebooks com informacoes faltantes",
        predicate: hasMissingNotebookData,
      },

      free: {
        label: "Notebooks livres",
        predicate: (item) => !isOccupied(item),
      },

      location: {
        label:
          filter.label ?? "Unidade selecionada",

        predicate: (item) =>
          filter.value === "__sem_localidade__"
            ? !item.localidade_id
            : item.localidade_id === filter.value,
      },

      sector: {
        label: `Setor: ${
          filter.value ?? "Sem setor"
        }`,

        predicate: (item) =>
          getNotebookSetor(item) === filter.value,
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

  useEffect(() => {
    if (
      !setorIdFiltro ||
      overviewData.length === 0
    ) {
      return;
    }

    const setorIds = new Set(
      setorIdFiltro
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );

    const sectorNames = Array.from(
      new Set(
        overviewData
          .filter(
            (item) =>
              item.setor_id &&
              setorIds.has(item.setor_id),
          )
          .map(getNotebookSetor)
          .filter(
            (name): name is string =>
              Boolean(name),
          ),
      ),
    );

    if (sectorNames.length === 0) return;

    void Promise.resolve().then(() => {
      setActiveOverviewFilters(
        (currentFilters) => {
          const nextFilters = [...currentFilters];

          for (const sectorName of sectorNames) {
            if (
              nextFilters.some(
                (filter) =>
                  filter.key ===
                  `sector:${sectorName}`,
              )
            ) {
              continue;
            }

            nextFilters.push({
              kind: "sector",
              value: sectorName,
              label: `Setor: ${sectorName}`,
              key: `sector:${sectorName}`,
              predicate: (item) =>
                getNotebookSetor(item) ===
                sectorName,
            });
          }

          return nextFilters;
        },
      );
    });
  }, [setorIdFiltro, overviewData]);

  useEffect(() => {
    if (
      !inspectId ||
      data.length === 0
    ) {
      return;
    }

    const found = data.find(
      (d) => d.id === inspectId,
    );

    if (found) {
      setSelected(found);
    }
  }, [inspectId, data]);

  useEffect(() => {
    if (!inspectId) return;

    fetch(`/api/notebooks/${inspectId}`)
      .then((r) =>
        r.ok ? r.json() : null,
      )
      .then((item) => {
        if (item) {
          setSelected(item);
        }
      })
      .catch(() => {});
  }, [inspectId]);

  const columns = useMemo<
    ColumnDef<Notebook, unknown>[]
  >(
    () => [
      {
        accessorKey: "modelo",
        header: "Notebook",
        enableSorting: true,

        cell: ({ row }) => (
          <div>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {row.original.modelo ||
                row.original
                  .numero_patrimonio ||
                "—"}
            </span>

            <p className="text-xs text-slate-400">
              {row.original.fabricante ||
                "Sem fabricante"}
            </p>
          </div>
        ),
      },

      {
        accessorKey: "numero_patrimonio",
        header: "Patrimônio",

        enableSorting: true,

        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original
              .numero_patrimonio || "—"}
          </span>
        ),
      },

      {
        accessorKey: "categoria",
        header: "Categoria",

        enableSorting: false,

        cell: ({ row }) => (
          <CategoriaBadge
            categoria={
              row.original.categoria
            }
          />
        ),
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

        enableSorting: false,

        cell: ({ row }) =>
          row.original.localidade_nome ??
          "—",
      },

      {
        accessorKey: "data_revisao",
        header: "Última revisão",

        cell: ({ row }) => (
          <UltimaRevisaoButton
            tipo="NOTEBOOK"
            id={row.original.id}
            revisadoEm={row.original.checklist_revisado_em}
            fallbackDate={row.original.data_revisao}
          />
        ),
      },

      {
        id: "emprestado",
        header: "Empréstimo",

        enableSorting: false,

        cell: ({ row }) => {
          const nb = row.original;

          if (!nb.emprestado) {
            return null;
          }

          const label =
            (nb as any)
              .emprestado_colaborador_nome ??
            (nb as any)
              .emprestado_setor_nome ??
            "Emprestado";

          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 max-w-[160px]">
              📦{" "}
              <span className="truncate">
                {label}
              </span>
            </span>
          );
        },
      },

      {
        id: "alocado",
        header: "Uso",

        enableSorting: false,

        cell: ({ row }) => {
          const alocacoes =
            row.original.alocacoes_ativas ??
            [];

          if (alocacoes.length === 0) {
            return (
              <span className="text-slate-400 text-xs">
                Livre
              </span>
            );
          }

          if (alocacoes.length === 1) {
            return (
              <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                {
                  alocacoes[0].colaborador
                    .nome
                }
              </span>
            );
          }

          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                {
                  alocacoes[0].colaborador
                    .nome
                }
              </span>

              <span className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                +
                {alocacoes.length - 1}
              </span>
            </span>
          );
        },
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
          placeholder="Modelo, patrimônio ou colaborador..."
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

      <select
        value={categoria}
        onChange={(e) => {
          setCategoria(e.target.value);
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="">
          Todas as categorias
        </option>

        <option value="Administrativa">
          Administrativa
        </option>

        <option value="Academica">
          Acadêmica
        </option>
      </select>

      <input
        value={fabricante}
        onChange={(e) => {
          setFabricante(e.target.value);
          setPage(1);
        }}
        placeholder="Fabricante..."
        className={`${inputCls} w-32`}
      />

      <select
        value={alocacao}
        onChange={(e) => {
          setAlocacao(e.target.value);
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="">Todos</option>

        <option value="alocado">
          Alocados
        </option>

        <option value="livre">
          Disponíveis
        </option>
      </select>

      <select
        value={`${sort}:${dir}`}
        onChange={(e) => {
          const [s, d] =
            e.target.value.split(":");

          setSort(s);
          setDir(
            d as "asc" | "desc",
          );

          setPage(1);
        }}
        className={inputCls}
      >
        <option value="modelo:asc">
          Modelo A→Z
        </option>

        <option value="modelo:desc">
          Modelo Z→A
        </option>

        <option value="created_at:desc">
          Mais recentes
        </option>

        <option value="created_at:asc">
          Mais antigos
        </option>

        <option value="fabricante:asc">
          Fabricante A→Z
        </option>

        <option value="setor:asc">
          Setor A→Z
        </option>
      </select>
    </>
  );

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader
        title="Notebooks"
        total={total}
      >
        {(isAdmin || canRequestInventoryChanges) && (
          <button
            type="button"
            onClick={() =>
              setShowCriar(true)
            }
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <Plus className="w-4 h-4" />
            Novo Notebook
          </button>
        )}
      </PageHeader>

      <section className={mobileView === "overview" ? "block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block" : "hidden lg:block"}>
        <DeviceOverviewPanel
          title="Notebooks"
          total={overviewPanelTotal}
          items={overviewPanelData}
          accentClassName="bg-violet-500"
          activeFilters={
            activeOverviewFilters
          }
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
            loading ||
            overviewFilterLoading
          }
          filters={filters}
          sort={sort}
          dir={dir}
          onSort={(
            field,
            newDir,
          ) => {
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
          <NotebookModal
            key={`notebook-${selected.id}`}
            notebook={selected}
            onClose={closeInspect}
            onRefresh={refresh}
          />
        )}

        {showCriar && (
          <CriarNotebookModal
            key="criar-notebook"
            onClose={() =>
              setShowCriar(false)
            }
            onRefresh={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getNotebookSetor(
  item?: Notebook | null,
) {
  return (
    item?.setor_nome ||
    item?.alocacao_ativa
      ?.colaborador
      .setor_rel?.nome ||
    "Sem setor"
  );
}

function getOverviewFilterKey(
  filter: OverviewFilter,
) {
  return `${filter.kind}:${
    filter.value ?? ""
  }`;
}

function toggleOverviewFilter(
  filters: ActiveOverviewFilter[],
  candidate: ActiveOverviewFilter,
) {
  if (candidate.kind === "location") {
    const withoutLocation =
      filters.filter(
        (filter) =>
          filter.kind !== "location",
      );

    return candidate.value
      ? [
          ...withoutLocation,
          candidate,
        ]
      : withoutLocation;
  }

  const exists = filters.some(
    (filter) =>
      filter.key === candidate.key,
  );

  if (exists) {
    return filters.filter(
      (filter) =>
        filter.key !== candidate.key,
    );
  }

  return [...filters, candidate];
}

function matchesOverviewFilters(
  item: Notebook,
  filters: ActiveOverviewFilter[],
) {
  const filtersByKind = filters.reduce(
    (map, filter) => {
      const group =
        map.get(filter.kind) ?? [];

      group.push(filter);

      map.set(filter.kind, group);

      return map;
    },
    new Map<
      string,
      ActiveOverviewFilter[]
    >(),
  );

  return Array.from(
    filtersByKind.values(),
  ).every((group) =>
    group.some((filter) =>
      filter.predicate(item),
    ),
  );
}
