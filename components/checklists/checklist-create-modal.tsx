'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Cpu,
  Laptop,
  Layers,
  Loader2,
  MapPin,
  Monitor,
  Phone,
  Printer,
  Search,
  Server,
  Smartphone,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { LocalidadeSelect } from '@/components/modals/localidade-select'

type ItemEstacao = 'MAQUINA' | 'MONITOR' | 'RAMAL' | 'COLABORADOR' | 'IMPRESSORA'
type ItemEstoque = 'NOTEBOOK' | 'APARELHO'
type Step = 'dados' | 'setores' | 'racks' | 'estoque' | 'resumo'

type ScopePrinter = { id: string; nome_host: string | null; endereco_ip: string | null; modelo: string | null; andar: string | null }
type ScopeSetor = {
  id: string
  nome: string
  ativo: boolean
  com_ativos: boolean
  contagem: Record<ItemEstacao, number>
  impressoras: ScopePrinter[]
}
type ScopeRack = { id: string; nome_switch: string | null; localizacao: string | null; quantidade_portas: number | null; setor_nome: string | null }
type ScopeEstoqueItem = { id: string; titulo: string; detalhe: string | null }
type Scope = {
  setores: ScopeSetor[]
  impressoras_sem_setor: number
  racks: ScopeRack[]
  estoque: Record<ItemEstoque, ScopeEstoqueItem[]>
}

/** impressoraIds null = todas as impressoras do setor. */
type SetorSelecionado = { itens: ItemEstacao[]; impressoraIds: string[] | null }

const ITENS_ESTACAO: Array<{ key: ItemEstacao; label: string; icon: LucideIcon }> = [
  { key: 'MAQUINA', label: 'CPU', icon: Cpu },
  { key: 'MONITOR', label: 'Monitor', icon: Monitor },
  { key: 'RAMAL', label: 'Ramal', icon: Phone },
  { key: 'COLABORADOR', label: 'Colaborador', icon: UserRound },
  { key: 'IMPRESSORA', label: 'Impressoras', icon: Printer },
]

const ITENS_ESTOQUE: Array<{ key: ItemEstoque; label: string; description: string; icon: LucideIcon }> = [
  { key: 'NOTEBOOK', label: 'Notebooks', description: 'Todos os notebooks cadastrados na unidade, emprestados ou não', icon: Laptop },
  { key: 'APARELHO', label: 'Aparelhos', description: 'Todos os aparelhos cadastrados na unidade', icon: Smartphone },
]

const STEPS: Array<{ key: Step; label: string; icon: LucideIcon }> = [
  { key: 'dados', label: 'Dados', icon: ClipboardList },
  { key: 'setores', label: 'Setores', icon: Layers },
  { key: 'racks', label: 'Racks', icon: Server },
  { key: 'estoque', label: 'Estoque', icon: Boxes },
  { key: 'resumo', label: 'Revisão', icon: Check },
]

const TODOS_ITENS_ESTACAO = ITENS_ESTACAO.map(item => item.key)

function printerLabel(printer: ScopePrinter) {
  return printer.nome_host ?? printer.endereco_ip ?? printer.modelo ?? 'Impressora sem identificação'
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function CheckMark({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
        checked
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
      } ${className}`}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  )
}

function Toggle({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  )
}

function ItemChip({
  active,
  count,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  count?: number
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-900/20'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 py-px text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
      )}
    </button>
  )
}

function StepHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </div>
  )
}

function LinkButton({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-xs font-bold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-300 dark:hover:bg-blue-950/40"
    >
      {children}
    </button>
  )
}

export function ChecklistCreateModal({
  defaultName,
  onClose,
  onCreated,
  open,
}: {
  defaultName: string
  onClose: () => void
  onCreated: () => void | Promise<void>
  open: boolean
}) {
  const [step, setStep] = useState<Step>('dados')
  const [nome, setNome] = useState('')
  const [localidadeId, setLocalidadeId] = useState<string | null>(null)
  const [localidadeNome, setLocalidadeNome] = useState<string | null>(null)
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10))
  const [scope, setScope] = useState<Scope | null>(null)
  const [scopeLoading, setScopeLoading] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)
  const [setores, setSetores] = useState<Record<string, SetorSelecionado>>({})
  const [rackIds, setRackIds] = useState<string[]>([])
  const [estoqueAtivo, setEstoqueAtivo] = useState(false)
  const [estoqueItens, setEstoqueItens] = useState<ItemEstoque[]>(['NOTEBOOK', 'APARELHO'])
  const [itensPadrao, setItensPadrao] = useState<ItemEstacao[]>(TODOS_ITENS_ESTACAO)
  const [search, setSearch] = useState('')
  const [onlyWithAssets, setOnlyWithAssets] = useState(true)
  const [printersOpen, setPrintersOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !creating) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [creating, onClose, open])

  useEffect(() => {
    if (!localidadeId) {
      setScope(null)
      return
    }
    let cancelled = false
    setScopeLoading(true)
    setScopeError(null)
    setScope(null)
    setPrintersOpen(null)
    fetch(`/api/checklists-validacao/escopo?localidade_id=${encodeURIComponent(localidadeId)}`, { cache: 'no-store' })
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar a localidade')
        return json as Scope
      })
      .then(json => {
        if (cancelled) return
        setScope(json)
        // Ponto de partida igual à criação anterior: setores com inventário e todos os racks.
        setSetores(Object.fromEntries(json.setores.filter(setor => setor.com_ativos).map(setor => [setor.id, { itens: TODOS_ITENS_ESTACAO, impressoraIds: null }])))
        setRackIds(json.racks.map(rack => rack.id))
      })
      .catch(error => { if (!cancelled) setScopeError(error instanceof Error ? error.message : 'Erro ao carregar a localidade') })
      .finally(() => { if (!cancelled) setScopeLoading(false) })
    return () => { cancelled = true }
  }, [localidadeId])

  const visibleSetores = useMemo(() => {
    if (!scope) return []
    const term = search.trim().toLowerCase()
    return scope.setores.filter(setor => {
      if (onlyWithAssets && !setor.com_ativos && !setores[setor.id]) return false
      return !term || setor.nome.toLowerCase().includes(term)
    })
  }, [onlyWithAssets, scope, search, setores])

  const selectedSetorIds = Object.keys(setores)
  const estoqueTotal = scope ? estoqueItens.reduce((sum, key) => sum + scope.estoque[key].length, 0) : 0
  const totalSolicitacoes = selectedSetorIds.length + rackIds.length + (estoqueAtivo ? estoqueItens.length : 0)
  const stepIndex = STEPS.findIndex(item => item.key === step)
  const canNavigate = Boolean(localidadeId && scope)

  function reset() {
    setStep('dados')
    setNome('')
    setLocalidadeId(null)
    setLocalidadeNome(null)
    setSetores({})
    setRackIds([])
    setEstoqueAtivo(false)
    setEstoqueItens(['NOTEBOOK', 'APARELHO'])
    setItensPadrao(TODOS_ITENS_ESTACAO)
    setSearch('')
  }

  function close() {
    if (creating) return
    onClose()
  }

  function toggleSetor(setor: ScopeSetor) {
    setSetores(current => {
      if (current[setor.id]) {
        const rest = { ...current }
        delete rest[setor.id]
        return rest
      }
      return { ...current, [setor.id]: { itens: itensPadrao, impressoraIds: null } }
    })
  }

  function toggleSetorItem(setorId: string, item: ItemEstacao) {
    setSetores(current => {
      const atual = current[setorId]
      if (!atual) return current
      const ativo = atual.itens.includes(item)
      if (ativo && atual.itens.length === 1) {
        toast.warning('Mantenha ao menos um item', { description: 'Para tirar todos os itens, desmarque o setor.' })
        return current
      }
      return { ...current, [setorId]: { ...atual, itens: ativo ? atual.itens.filter(key => key !== item) : [...atual.itens, item] } }
    })
  }

  function togglePrinter(setor: ScopeSetor, printerId: string) {
    setSetores(current => {
      const atual = current[setor.id]
      if (!atual) return current
      const base = atual.impressoraIds ?? setor.impressoras.map(printer => printer.id)
      const next = base.includes(printerId) ? base.filter(id => id !== printerId) : [...base, printerId]
      return { ...current, [setor.id]: { ...atual, impressoraIds: next.length === setor.impressoras.length ? null : next } }
    })
  }

  function togglePadrao(item: ItemEstacao) {
    setItensPadrao(current => {
      if (current.includes(item)) return current.length === 1 ? current : current.filter(key => key !== item)
      return [...current, item]
    })
  }

  function aplicarPadraoAosSelecionados() {
    setSetores(current => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, itens: itensPadrao }])))
    toast.success(`Itens aplicados a ${plural(selectedSetorIds.length, 'setor', 'setores')}`)
  }

  function selectVisible(checked: boolean) {
    setSetores(current => {
      const next = { ...current }
      for (const setor of visibleSetores) {
        if (checked && !next[setor.id]) next[setor.id] = { itens: itensPadrao, impressoraIds: null }
        if (!checked) delete next[setor.id]
      }
      return next
    })
  }

  function goTo(target: Step) {
    if (target !== 'dados' && !canNavigate) {
      toast.warning('Selecione a localidade primeiro')
      return
    }
    setStep(target)
  }

  async function create() {
    if (!localidadeId || totalSolicitacoes === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/checklists-validacao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim() || defaultName,
          localidade_id: localidadeId,
          data_inicio: dataInicio || null,
          setores: Object.entries(setores).map(([setor_id, value]) => ({
            setor_id,
            itens: value.itens,
            impressora_ids: value.itens.includes('IMPRESSORA') ? value.impressoraIds : null,
          })),
          rack_ids: rackIds,
          incluir_racks: rackIds.length > 0,
          estoque: estoqueAtivo && estoqueItens.length ? { itens: estoqueItens } : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar checklist')
      toast.success('Checklist aberto', { description: `${plural(totalSolicitacoes, 'solicitação gerada', 'solicitações geradas')}.` })
      reset()
      await onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar checklist')
    } finally {
      setCreating(false)
    }
  }

  function renderDados() {
    return (
      <div className="space-y-6">
        <StepHeading title="Dados do ciclo" description="Identifique o checklist e a unidade que será validada." />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome do ciclo</span>
            <input
              value={nome}
              onChange={event => setNome(event.target.value)}
              placeholder={defaultName}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition placeholder:font-normal focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white"
            />
          </label>
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><MapPin className="h-3.5 w-3.5" />Unidade</span>
            <LocalidadeSelect
              value={localidadeId}
              onChange={(id, nomeLocalidade) => {
                setLocalidadeId(id)
                setLocalidadeNome(nomeLocalidade)
              }}
            />
          </label>
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Data de início</span>
            <input
              type="date"
              value={dataInicio}
              onChange={event => setDataInicio(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white"
            />
          </label>
        </div>

        {localidadeId && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            {scopeLoading && (
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando setores, racks e estoque...</p>
            )}
            {scopeError && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{scopeError}</p>}
            {scope && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Setores com ativos', value: scope.setores.filter(setor => setor.com_ativos).length, icon: Layers },
                  { label: 'Racks', value: scope.racks.length, icon: Server },
                  { label: 'Notebooks e aparelhos', value: scope.estoque.NOTEBOOK.length + scope.estoque.APARELHO.length, icon: Boxes },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5 shrink-0" />{label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderSetores() {
    if (!scope) return null
    const allVisibleSelected = visibleSetores.length > 0 && visibleSetores.every(setor => setores[setor.id])
    return (
      <div className="space-y-4">
        <StepHeading title="Setores e itens das estações" description="Marque os setores e defina quais itens de cada estação entram no check." />

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Itens padrão para novos setores</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ITENS_ESTACAO.map(item => (
              <ItemChip key={item.key} active={itensPadrao.includes(item.key)} icon={item.icon} label={item.label} onClick={() => togglePadrao(item.key)} />
            ))}
            <LinkButton disabled={selectedSetorIds.length === 0} onClick={aplicarPadraoAosSelecionados}>Aplicar aos selecionados</LinkButton>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar setor"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white"
            />
          </label>
          <div className="grid h-11 grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-950/60">
            {[
              { label: 'Com ativos', value: true },
              { label: 'Todos', value: false },
            ].map(option => (
              <button
                key={option.label}
                type="button"
                onClick={() => setOnlyWithAssets(option.value)}
                className={`rounded-lg px-3 transition ${onlyWithAssets === option.value ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-200' : 'text-slate-500'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => selectVisible(!allVisibleSelected)}
            disabled={visibleSetores.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            <CheckMark checked={allVisibleSelected} className="h-4 w-4" />
            {allVisibleSelected ? 'Desmarcar exibidos' : 'Marcar exibidos'}
          </button>
        </div>

        <div className="space-y-2">
          {visibleSetores.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Nenhum setor encontrado.</p>
          )}
          {visibleSetores.map(setor => {
            const selecionado = setores[setor.id]
            const totalImpressoras = setor.impressoras.length
            const impressorasMarcadas = selecionado?.impressoraIds?.length ?? totalImpressoras
            const printerListOpen = printersOpen === setor.id && selecionado?.itens.includes('IMPRESSORA')
            return (
              <div
                key={setor.id}
                className={`rounded-2xl border transition ${
                  selecionado
                    ? 'border-blue-300 bg-blue-50/50 shadow-sm dark:border-blue-800 dark:bg-blue-950/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <button type="button" onClick={() => toggleSetor(setor)} aria-pressed={Boolean(selecionado)} className="flex w-full items-center gap-3 p-3.5 text-left">
                  <CheckMark checked={Boolean(selecionado)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{setor.nome}</span>
                      {!setor.ativo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">inativo</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {setor.com_ativos
                        ? `${plural(setor.contagem.MAQUINA, 'CPU', 'CPUs')} · ${plural(setor.contagem.RAMAL, 'ramal', 'ramais')} · ${plural(totalImpressoras, 'impressora', 'impressoras')}`
                        : 'Sem ativos cadastrados nesta unidade'}
                    </span>
                  </span>
                  {selecionado && (
                    <span className="hidden shrink-0 rounded-full bg-blue-600/10 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 sm:inline">
                      {selecionado.itens.length}/{ITENS_ESTACAO.length} itens
                    </span>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {selecionado && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-blue-200/70 px-3.5 pb-3.5 pt-3 dark:border-blue-900/50">
                        <div className="flex flex-wrap gap-2">
                          {ITENS_ESTACAO.map(item => (
                            <ItemChip
                              key={item.key}
                              active={selecionado.itens.includes(item.key)}
                              count={setor.contagem[item.key]}
                              icon={item.icon}
                              label={item.label}
                              onClick={() => toggleSetorItem(setor.id, item.key)}
                            />
                          ))}
                        </div>
                        {!selecionado.itens.includes('MAQUINA') && selecionado.itens.some(item => item !== 'IMPRESSORA') && (
                          <p className="mt-2 text-xs text-slate-500">Sem CPU, o host da estação é pedido só como referência para os demais itens.</p>
                        )}
                        {selecionado.itens.includes('IMPRESSORA') && totalImpressoras > 0 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setPrintersOpen(current => current === setor.id ? null : setor.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              {impressorasMarcadas === totalImpressoras ? 'Todas as impressoras' : `${impressorasMarcadas} de ${totalImpressoras} impressoras`}
                              <ChevronDown className={`h-3.5 w-3.5 transition ${printerListOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {printerListOpen && (
                              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                {setor.impressoras.map(printer => {
                                  const marcada = selecionado.impressoraIds ? selecionado.impressoraIds.includes(printer.id) : true
                                  return (
                                    <button
                                      key={printer.id}
                                      type="button"
                                      onClick={() => togglePrinter(setor, printer.id)}
                                      aria-pressed={marcada}
                                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${marcada ? 'border-emerald-300 bg-white dark:border-emerald-800 dark:bg-slate-900' : 'border-slate-200 bg-white/60 opacity-70 dark:border-slate-800 dark:bg-slate-900/60'}`}
                                    >
                                      <CheckMark checked={marcada} className="h-4 w-4" />
                                      <span className="min-w-0">
                                        <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{printerLabel(printer)}</span>
                                        <span className="block truncate text-[11px] text-slate-500">{[printer.modelo, printer.andar ? `andar ${printer.andar}` : null].filter(Boolean).join(' · ') || 'Sem detalhes'}</span>
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
        {scope.impressoras_sem_setor > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {plural(scope.impressoras_sem_setor, 'impressora da unidade está', 'impressoras da unidade estão')} sem setor e não entra{scope.impressoras_sem_setor === 1 ? '' : 'm'} no checklist.
          </p>
        )}
      </div>
    )
  }

  function renderRacks() {
    if (!scope) return null
    return (
      <div className="space-y-4">
        <StepHeading title="Racks" description="Cada rack marcado gera uma solicitação de validação de portas.">
          <div className="flex gap-1">
            <LinkButton disabled={scope.racks.length === 0} onClick={() => setRackIds(scope.racks.map(rack => rack.id))}>Marcar todos</LinkButton>
            <LinkButton disabled={rackIds.length === 0} onClick={() => setRackIds([])}>Limpar</LinkButton>
          </div>
        </StepHeading>
        {scope.racks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Nenhum rack cadastrado nesta unidade.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {scope.racks.map(rack => {
              const marcado = rackIds.includes(rack.id)
              return (
                <button
                  key={rack.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => setRackIds(current => marcado ? current.filter(id => id !== rack.id) : [...current, rack.id])}
                  className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                    marcado
                      ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <CheckMark checked={marcado} />
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${marcado ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                    <Server className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{rack.nome_switch ?? 'Rack sem nome'}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[rack.localizacao, rack.setor_nome, rack.quantidade_portas ? `${rack.quantidade_portas} portas` : null].filter(Boolean).join(' · ') || 'Sem detalhes'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderEstoque() {
    if (!scope) return null
    return (
      <div className="space-y-4">
        <StepHeading title="Revisão de estoque" description="Notebooks e aparelhos não dependem de estação: todos os da unidade entram na conferência e na revisão, com diff como nos setores." />
        <button
          type="button"
          aria-pressed={estoqueAtivo}
          onClick={() => setEstoqueAtivo(current => !current)}
          className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
            estoqueAtivo ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${estoqueAtivo ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
            <Boxes className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">Incluir revisão de estoque</span>
            <span className="block text-xs text-slate-500">Gera uma solicitação para cada tipo marcado em {localidadeNome ?? 'a unidade'}.</span>
          </span>
          <Toggle checked={estoqueAtivo} />
        </button>

        <div className={`grid gap-3 sm:grid-cols-2 ${estoqueAtivo ? '' : 'pointer-events-none opacity-50'}`}>
          {ITENS_ESTOQUE.map(item => {
            const marcado = estoqueItens.includes(item.key)
            const lista = scope.estoque[item.key]
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={marcado}
                disabled={!estoqueAtivo}
                onClick={() => setEstoqueItens(current => marcado ? current.filter(key => key !== item.key) : [...current, item.key])}
                className={`flex flex-col rounded-2xl border p-4 text-left transition ${
                  marcado ? 'border-blue-300 bg-white shadow-sm dark:border-blue-800 dark:bg-slate-900' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40'
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${marcado ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}>
                    <item.icon className="h-4 w-4" />
                  </span>
                  <CheckMark checked={marcado} />
                </span>
                <span className="mt-3 flex items-baseline gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                  <span className="text-xs font-bold text-slate-400">{lista.length}</span>
                </span>
                <span className="mt-0.5 text-xs leading-5 text-slate-500">{item.description}</span>
                {lista.length > 0 && (
                  <span className="mt-3 flex flex-wrap gap-1">
                    {lista.slice(0, 4).map(entry => (
                      <span key={entry.id} className="max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{entry.titulo}</span>
                    ))}
                    {lista.length > 4 && <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">+{lista.length - 4}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {estoqueAtivo && estoqueItens.length === 0 && (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Selecione ao menos um tipo de dispositivo ou desative a revisão de estoque.</p>
        )}
      </div>
    )
  }

  function renderResumo() {
    if (!scope) return null
    const setoresSelecionados = scope.setores.filter(setor => setores[setor.id])
    return (
      <div className="space-y-4">
        <StepHeading title="Revisão da abertura" description="Confira o que será gerado antes de abrir o checklist." />
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Setores', value: setoresSelecionados.length, icon: Layers },
            { label: 'Racks', value: rackIds.length, icon: Server },
            { label: 'Estoque', value: estoqueAtivo && estoqueItens.length ? `${estoqueTotal} disp.` : 'Não', icon: Boxes },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
            {nome.trim() || defaultName} · {localidadeNome}
          </p>
          <ul className="max-h-[300px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {setoresSelecionados.map(setor => (
              <li key={setor.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{setor.nome}</span>
                <span className="flex flex-wrap gap-1">
                  {ITENS_ESTACAO.filter(item => setores[setor.id].itens.includes(item.key)).map(item => (
                    <span key={item.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <item.icon className="h-3 w-3" />{item.label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
            {rackIds.length > 0 && (
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-bold text-slate-800 dark:text-slate-100">Racks</span>
                <span className="text-slate-500">{plural(rackIds.length, 'rack', 'racks')}</span>
              </li>
            )}
            {estoqueAtivo && ITENS_ESTOQUE.filter(item => estoqueItens.includes(item.key)).map(item => (
              <li key={item.key} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100"><item.icon className="h-4 w-4 text-slate-400" />Estoque de {item.label.toLowerCase()}</span>
                <span className="text-slate-500">{plural(scope.estoque[item.key].length, 'dispositivo', 'dispositivos')}</span>
              </li>
            ))}
            {totalSolicitacoes === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nada selecionado ainda.</li>}
          </ul>
        </div>
      </div>
    )
  }

  const isLastStep = step === 'resumo'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={event => { if (event.target === event.currentTarget) close() }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-create-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-[min(88vh,820px)] sm:rounded-3xl sm:border sm:border-slate-200 dark:sm:border-slate-800"
          >
            <header className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4 dark:border-slate-800 sm:px-6 sm:pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Abertura de checklist</p>
                  <h2 id="checklist-create-title" className="mt-0.5 truncate text-xl font-black tracking-tight text-slate-900 dark:text-white">
                    {localidadeNome ? `Validação · ${localidadeNome}` : 'Novo ciclo de validação'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={creating}
                  aria-label="Fechar"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Etapas">
                {STEPS.map((item, index) => {
                  const active = item.key === step
                  const done = index < stepIndex
                  const locked = item.key !== 'dados' && !canNavigate
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => goTo(item.key)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold transition sm:flex-1 sm:justify-center ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                          : done
                            ? 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      } ${locked ? 'opacity-50' : ''}`}
                    >
                      <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${active ? 'bg-white/20' : done ? 'bg-blue-100 dark:bg-blue-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                      </span>
                      {item.label}
                    </button>
                  )
                })}
              </nav>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {step === 'dados' && renderDados()}
                  {step === 'setores' && renderSetores()}
                  {step === 'racks' && renderRacks()}
                  {step === 'estoque' && renderEstoque()}
                  {step === 'resumo' && renderResumo()}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <p className="text-xs font-semibold text-slate-500">
                {canNavigate
                  ? `${plural(selectedSetorIds.length, 'setor', 'setores')} · ${plural(rackIds.length, 'rack', 'racks')} · estoque ${estoqueAtivo && estoqueItens.length ? 'incluído' : 'fora'}`
                  : 'Escolha a unidade para montar o escopo.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => stepIndex > 0 ? setStep(STEPS[stepIndex - 1].key) : close()}
                  disabled={creating}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:flex-none"
                >
                  {stepIndex > 0 && <ArrowLeft className="h-4 w-4" />}
                  {stepIndex > 0 ? 'Voltar' : 'Cancelar'}
                </button>
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={create}
                    disabled={creating || totalSolicitacoes === 0 || (estoqueAtivo && estoqueItens.length === 0)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {creating ? 'Abrindo...' : `Abrir checklist (${totalSolicitacoes})`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(STEPS[stepIndex + 1].key)}
                    disabled={step === 'dados' && !canNavigate}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                  >
                    Próximo
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
