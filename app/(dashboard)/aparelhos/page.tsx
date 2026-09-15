"use client";

import { usePermission } from "@/hooks/use-permission";
import { useMemo, useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
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
import { BoolBadge } from "@/components/dashboard/status-badge";
import { ForumLinkedIndicator, useForumVinculosResumo } from "@/components/forum/forum-linked-indicator";
import { AparelhoModal } from "@/components/modals/aparelho-modal";
import { SetorSelect } from "@/components/modals/setor-select";
import { LocalidadeSelect } from "@/components/modals/localidade-select";
import { Search, Plus } from "lucide-react";
import { mapTipoAparelho } from "@/lib/utils";
import type { Aparelho, PaginatedResponse } from "@/types";
import { CriarAparelhoModal } from "@/components/modals/criar-aparelho-modal";
import { useSearchParams } from "next/navigation";
import { useInspectNavigation } from "@/hooks/use-inspect-navigation";
import { UltimaRevisaoButton } from "@/components/checklists/ultima-revisao-popup";

type ActiveOverviewFilter = OverviewFilter & {
  key: string;
  predicate: (item: Aparelho) => boolean;
};

function isAllocated(item: Aparelho) {
  return (
    (item.alocacoes_ativas?.length ?? 0) > 0 ||
    Boolean(item.alocacao_ativa)
  );
}

function allocationNames(item: Aparelho) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => alocacao.colaborador.nome)
    .filter(Boolean)
    .join(", ") || item.alocacao_ativa?.colaborador.nome || "Livre";
}

function allocationDetails(item: Aparelho) {
  return (item.alocacoes_ativas ?? [])
    .map(alocacao => {
      const setor = alocacao.colaborador.setor_rel?.nome;
      const desde = alocacao.data_inicio ? `desde ${alocacao.data_inicio}` : null;
      return [alocacao.colaborador.nome, setor, desde].filter(Boolean).join(" · ");
    })
    .join("; ") || allocationNames(item);
}

function hasMissingPhoneData(item: Aparelho) {
  return [
    item.modelo,
    item.tipo,
    item.endereco_ip,
    item.endereco_mac,
    item.setor_nome ?? item.localidade_id,
  ].some(
    (value) =>
      value === null || value === undefined || value === "",
  );
}

const baseColumns: ColumnDef<Aparelho>[] = [
  {
    accessorKey: "modelo",
    enableSorting: true,
    header: "Aparelho",
    cell: ({ row }) => (
      <div>
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {row.original.modelo || "—"}
        </span>
        <p className="text-xs text-slate-400">
          {mapTipoAparelho(row.original.tipo)}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "setor",
    header: "Setor",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.setor_nome ??
      row.original.localidade_nome ??
      "—",
  },
  {
    accessorKey: "localidade_nome",
    header: "Localidade",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.localidade_nome ?? "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => (
      <BoolBadge
        value={getValue() as boolean}
        labelTrue="Ativo"
        labelFalse="Inativo"
      />
    ),
  },
  {
    accessorKey: "chip",
    header: "Chip",
    cell: ({ getValue }) => (
      <BoolBadge value={getValue() as boolean} />
    ),
  },
  {
    id: "alocado",
    header: "Uso",
    enableSorting: false,
    cell: ({ row }) => {
      const alocacoes = row.original.alocacoes_ativas ?? [];

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
            {alocacoes[0].colaborador.nome}
          </span>
        );
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
      );
    },
  },
];

export default function AparelhosPage() {
  const { isAdmin, canRequestInventoryChanges } = usePermission();

  const [data, setData] = useState<Aparelho[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [overviewData, setOverviewData] = useState<
    Aparelho[]
  >([]);
  const [overviewTotal, setOverviewTotal] = useState(0);
  const [overviewLoading, setOverviewLoading] =
    useState(true);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] =
    useState<Aparelho | null>(null);
  const { openInspect, closeInspect } =
    useInspectNavigation<Aparelho>(setSelected);

  const [showCriar, setShowCriar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const searchParams = useSearchParams();
  const inspectId = searchParams.get("inspect");

  const [activeOverviewFilters, setActiveOverviewFilters] =
    useState<ActiveOverviewFilter[]>([]);

  const [overviewFilterLoading, setOverviewFilterLoading] =
    useState(false);
  const [mobileView, setMobileView] = useState<InventoryMobileView>("registros");

  // Filtros
  const [search, setSearch] = useState("");

  const [setorIdFiltro, setSetorIdFiltro] = useState<
    string | null
  >(searchParams.get("setor_id"));

  const [localidadeIdFiltro, setLocalidadeIdFiltro] =
    useState<string | null>(
      searchParams.get("localidade_id"),
    );

  const [status, setStatus] = useState("");
  const [chip, setChip] = useState("");

  const [alocacao, setAlocacao] = useState("");

  const [sort, setSort] = useState("modelo");

  const [dir, setDir] = useState<"asc" | "desc">(
    "asc",
  );

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    async function fetchData() {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort,
        dir,
      });

      if (search) params.set("search", search);

      if (setorIdFiltro)
        params.set("setor_id", setorIdFiltro);

      if (localidadeIdFiltro)
        params.set(
          "localidade_id",
          localidadeIdFiltro,
        );

      if (status !== "")
        params.set("status", status);

      if (chip !== "") params.set("chip", chip);

      if (alocacao)
        params.set("alocacao", alocacao);

      try {
        const res = await fetch(
          `/api/aparelhos?${params}`,
        );

        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);

        const json: PaginatedResponse<Aparelho> =
          await res.json();

        if (!cancelled) {
          setData(json.data);
          setTotal(json.total);
          setTotalPages(json.totalPages);
        }
      } catch (err) {
        console.error("[aparelhos page]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [
    page,
    search,
    setorIdFiltro,
    localidadeIdFiltro,
    status,
    chip,
    alocacao,
    sort,
    dir,
    refreshKey,
  ]);

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
          params.set(
            "localidade_id",
            localidadeIdFiltro,
          );
        }

        const res = await fetch(
          `/api/aparelhos?${params}`,
        );

        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);

        const json: PaginatedResponse<Aparelho> =
          await res.json();

        if (!cancelled) {
          setOverviewData(json.data);
          setOverviewTotal(json.total);
        }
      } catch (err) {
        console.error("[aparelhos overview]", err);
      } finally {
        if (!cancelled)
          setOverviewLoading(false);
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
  const overviewExportConfig: OverviewExportConfig<Aparelho> = {
    title: "Overview de Aparelhos",
    filename: "overview-aparelhos",
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: "modelo", header: "Modelo", value: item => item.modelo },
      { key: "tipo", header: "Tipo", value: item => mapTipoAparelho(item.tipo) },
      { key: "ip", header: "IP", value: item => item.endereco_ip },
      { key: "mac", header: "MAC", value: item => item.endereco_mac },
      { key: "setor", header: "Setor", value: item => getAparelhoSetor(item) },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome },
      { key: "uso", header: "Uso", value: item => isAllocated(item) ? "Ocupado" : "Livre" },
      { key: "chip", header: "Com chip", value: item => item.chip === true },
      { key: "status", header: "Ativo", value: item => item.status !== false },
      { key: "colaboradores", header: "Colaboradores", value: item => allocationNames(item) },
      { key: "relacao_alocacao", header: "Relação de alocação", value: item => allocationDetails(item) },
    ],
    pdfColumns: [
      { key: "modelo", header: "Modelo", value: item => item.modelo },
      { key: "tipo", header: "Tipo", value: item => mapTipoAparelho(item.tipo) },
      { key: "ip", header: "IP", value: item => item.endereco_ip },
      { key: "setor", header: "Setor", value: item => getAparelhoSetor(item) },
      { key: "localidade", header: "Localidade", value: item => item.localidade_nome },
      { key: "colaboradores", header: "Colaborador alocado", value: item => allocationNames(item) },
      { key: "chip", header: "Com chip", value: item => item.chip === true },
      { key: "status", header: "Ativo", value: item => item.status !== false },
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
  const forumResumo = useForumVinculosResumo(
    "aparelhos",
    tableData.map((item) => item.id),
  );
  const columns = useMemo<ColumnDef<Aparelho>[]>(
    () => [
      ...baseColumns,
      {
        id: "ultima_revisao",
        header: "Última revisão",
        enableSorting: false,
        cell: ({ row }) => <UltimaRevisaoButton tipo="APARELHO" id={row.original.id} revisadoEm={row.original.checklist_revisado_em} />,
      },
      {
        id: "forum",
        header: "Fórum",
        enableSorting: false,
        cell: ({ row }) => (
          <ForumLinkedIndicator
            resumo={forumResumo[row.original.id]}
          />
        ),
      },
    ],
    [forumResumo],
  );

  function applyOverviewFilter(
    filter: OverviewFilter,
  ) {
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
        predicate: (item: Aparelho) => boolean;
      }
    > = {
      allocated: {
        label: "Aparelhos ocupados",
        predicate: isAllocated,
      },

      free: {
        label: "Aparelhos livres",
        predicate: (item) => !isAllocated(item),
      },

      "phone-missing-data": {
        label:
          "Aparelhos com informacoes faltantes",
        predicate: hasMissingPhoneData,
      },

      "phone-with-chip": {
        label: "Aparelhos com chip",
        predicate: (item) => item.chip === true,
      },

      location: {
        label:
          filter.label ??
          "Unidade selecionada",

        predicate: (item) =>
          filter.value ===
          "__sem_localidade__"
            ? !item.localidade_id
            : item.localidade_id === filter.value,
      },

      sector: {
        label: `Setor: ${
          filter.value ?? "Sem setor"
        }`,

        predicate: (item) =>
          getAparelhoSetor(item) ===
          filter.value,
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
    )
      return;

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
          .map(getAparelhoSetor)
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
          const nextFilters = [
            ...currentFilters,
          ];

          for (const sectorName of sectorNames) {
            if (
              nextFilters.some(
                (filter) =>
                  filter.key ===
                  `sector:${sectorName}`,
              )
            )
              continue;

            nextFilters.push({
              kind: "sector",
              value: sectorName,
              label: `Setor: ${sectorName}`,
              key: `sector:${sectorName}`,

              predicate: (item) =>
                getAparelhoSetor(item) ===
                sectorName,
            });
          }

          return nextFilters;
        },
      );
    });
  }, [setorIdFiltro, overviewData]);

  useEffect(() => {
    if (!inspectId || data.length === 0)
      return;

    const found = data.find(
      (d) => d.id === inspectId,
    );

    if (found) setSelected(found);
  }, [inspectId, data]);

  useEffect(() => {
    if (!inspectId) return;

    fetch(`/api/aparelhos/${inspectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((item) => {
        if (item) setSelected(item);
      })
      .catch(() => {});
  }, [inspectId]);

  const inputCls =
    "px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const filters = (
    <>
      {/* Busca */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Modelo ou colaborador..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Setor */}
      <SetorSelect
        value={setorIdFiltro}
        onChange={(id) => {
          setSetorIdFiltro(id);
          setPage(1);
        }}
        placeholder="Filtrar por setor..."
        allowCreate={false}
        className="w-52"
      />

      {/* Localidade */}
      <LocalidadeSelect
        value={localidadeIdFiltro}
        onChange={(id) => {
          setLocalidadeIdFiltro(id);
          setSetorIdFiltro(null);
          setPage(1);
        }}
        placeholder="Filtrar por localidade..."
        className="w-56"
      />

      {/* Status */}
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="">
          Todos os status
        </option>

        <option value="true">
          Ativo
        </option>

        <option value="false">
          Inativo
        </option>
      </select>

      {/* Chip */}
      <select
        value={chip}
        onChange={(e) => {
          setChip(e.target.value);
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="">
          Com/sem chip
        </option>

        <option value="true">
          Com chip
        </option>

        <option value="false">
          Sem chip
        </option>
      </select>

      {/* Alocação */}
      <select
        value={alocacao}
        onChange={(e) => {
          setAlocacao(e.target.value);
          setPage(1);
        }}
        className={inputCls}
      >
        <option value="">
          Todos
        </option>

        <option value="alocado">
          Alocados
        </option>

        <option value="livre">
          Disponíveis
        </option>
      </select>

      {/* Ordenação */}
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

        <option value="tipo:asc">
          Tipo A→Z
        </option>

        <option value="setor_id:asc">
          Setor A→Z
        </option>
      </select>
    </>
  );

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader
        title="Aparelhos"
        total={total}
      >
        {(isAdmin || canRequestInventoryChanges) && (
          <button
            type="button"
            onClick={() => setShowCriar(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <Plus className="w-4 h-4" />
            Novo Aparelho
          </button>
        )}
      </PageHeader>

      <section className={mobileView === "overview" ? "block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block" : "hidden lg:block"}>
        <DeviceOverviewPanel
          title="Aparelhos"
          total={overviewPanelTotal}
          items={overviewPanelData}
          accentClassName="bg-cyan-500"
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
          <AparelhoModal
            key={`aparelho-${selected.id}`}
            aparelho={selected}
            onClose={closeInspect}
            onRefresh={refresh}
          />
        )}

        {showCriar && (
          <CriarAparelhoModal
            key="criar-aparelho"
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

function getAparelhoSetor(
  item?: Aparelho | null,
) {
  return (
    item?.setor_nome ||
    item?.localidade_nome ||
    item?.alocacao_ativa?.colaborador
      .setor_rel?.nome ||
    "Sem setor"
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
  item: Aparelho,
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
    new Map<string, ActiveOverviewFilter[]>(),
  );

  return Array.from(
    filtersByKind.values(),
  ).every((group) =>
    group.some((filter) =>
      filter.predicate(item),
    ),
  );
}
