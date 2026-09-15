'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, CircleSlash, Laptop, Loader2, Plus, RotateCcw, Save, Search, Smartphone, X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

export type TipoEstoque = 'NOTEBOOK' | 'APARELHO'

type EstoqueItemRegistrado = {
  id: string
  tipo_item: string
  referencia_id?: string | null
  identificador_informado: string | null
  dados_informados_json: Record<string, unknown>
}

export type EstoquePrevisto = {
  notebooks: Array<{ id: string; numero_patrimonio: string | null; modelo: string | null; fabricante: string | null; memoria: string | null; armazenamento: string | null; processador: string | null; emprestado: boolean }>
  aparelhos: Array<{ id: string; modelo: string | null; endereco_mac: string | null; endereco_ip: string | null; chip: boolean | null }>
}

type Previsto = { id: string; titulo: string; detalhe: string; form: Record<string, string> }
type FieldConfig = { key: string; label: string; placeholder?: string; required?: boolean; span?: boolean }

const CATEGORIAS: Record<TipoEstoque, { label: string; singular: string; icon: LucideIcon; fields: FieldConfig[] }> = {
  NOTEBOOK: {
    label: 'Notebooks',
    singular: 'Notebook',
    icon: Laptop,
    fields: [
      { key: 'patrimonio', label: 'Patrimônio', required: true },
      { key: 'fabricante', label: 'Fabricante', placeholder: 'Dell, Lenovo...' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'memoria', label: 'Memória', placeholder: 'Ex.: 8GB' },
      { key: 'armazenamento', label: 'Armazenamento', placeholder: 'Ex.: SSD 256GB' },
      { key: 'processador', label: 'Processador' },
    ],
  },
  APARELHO: {
    label: 'Aparelhos',
    singular: 'Aparelho',
    icon: Smartphone,
    fields: [
      { key: 'modelo', label: 'Modelo', required: true },
      { key: 'endereco_mac', label: 'MAC', placeholder: '00:00:00:00:00:00' },
      { key: 'ip', label: 'IP' },
    ],
  },
}

const ORDEM: TipoEstoque[] = ['NOTEBOOK', 'APARELHO']

function str(value: unknown) {
  return value == null ? '' : String(value)
}

function previstosPorTipo(previsto: EstoquePrevisto | null | undefined): Record<TipoEstoque, Previsto[]> {
  return {
    NOTEBOOK: (previsto?.notebooks ?? []).map(row => ({
      id: row.id,
      titulo: row.numero_patrimonio ?? row.modelo ?? 'Notebook sem patrimônio',
      detalhe: [row.fabricante, row.modelo, row.memoria, row.emprestado ? 'emprestado' : null].filter(Boolean).join(' · '),
      form: { patrimonio: str(row.numero_patrimonio), fabricante: str(row.fabricante), modelo: str(row.modelo), memoria: str(row.memoria), armazenamento: str(row.armazenamento), processador: str(row.processador) },
    })),
    APARELHO: (previsto?.aparelhos ?? []).map(row => ({
      id: row.id,
      titulo: row.modelo ?? row.endereco_mac ?? 'Aparelho sem identificação',
      detalhe: [row.endereco_mac, row.endereco_ip].filter(Boolean).join(' · '),
      form: { modelo: str(row.modelo), endereco_mac: str(row.endereco_mac), ip: str(row.endereco_ip) },
    })),
  }
}

function referenciaDoItem(item: EstoqueItemRegistrado) {
  return item.referencia_id ?? (item.dados_informados_json?.referencia_id as string | undefined) ?? null
}

type ModalState = { tipo: TipoEstoque; referenciaId: string | null; itemId: string | null; form: Record<string, string> }

export function ChecklistEstoquePanel({
  canEdit,
  escopo,
  itens,
  onChanged,
  onDelete,
  onSave,
  podeEditar,
  previsto,
}: {
  canEdit: () => boolean
  escopo: string[]
  itens: EstoqueItemRegistrado[]
  onChanged: (message: string) => Promise<void> | void
  onDelete: (itemId: string) => Promise<void>
  onSave: (tipo: TipoEstoque, dados: Record<string, unknown>, itemId?: string | null) => Promise<void>
  podeEditar: boolean
  previsto: EstoquePrevisto | null | undefined
}) {
  const categorias = ORDEM.filter(tipo => escopo.includes(tipo))
  const [ativo, setAtivo] = useState<TipoEstoque>(categorias[0] ?? 'NOTEBOOK')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const previstos = useMemo(() => previstosPorTipo(previsto), [previsto])
  const registradosPorReferencia = useMemo(() => {
    const map = new Map<string, EstoqueItemRegistrado>()
    for (const item of itens) {
      const ref = referenciaDoItem(item)
      if (ref && !item.dados_informados_json?.nao_conferido) map.set(`${item.tipo_item}:${ref}`, item)
    }
    return map
  }, [itens])

  const stats = useMemo(() => Object.fromEntries(categorias.map(tipo => {
    const lista = previstos[tipo]
    const conferidos = lista.filter(row => registradosPorReferencia.has(`${tipo}:${row.id}`)).length
    const extras = itens.filter(item => item.tipo_item === tipo && !previstos[tipo].some(row => row.id === referenciaDoItem(item))).length
    return [tipo, { total: lista.length, conferidos, extras }]
  })) as Record<TipoEstoque, { total: number; conferidos: number; extras: number }>, [categorias, itens, previstos, registradosPorReferencia])

  const term = search.trim().toLowerCase()
  const listaAtiva = previstos[ativo].filter(row => !term || `${row.titulo} ${row.detalhe}`.toLowerCase().includes(term))
  const extrasAtivos = itens.filter(item => item.tipo_item === ativo && !previstos[ativo].some(row => row.id === referenciaDoItem(item)) && !item.dados_informados_json?.nao_conferido)

  if (categorias.length === 0) return null

  function openFound(tipo: TipoEstoque, row: Previsto | null, item?: EstoqueItemRegistrado) {
    if (!canEdit()) return
    const dados = item?.dados_informados_json ?? {}
    const base = row?.form ?? {}
    const form = Object.fromEntries(CATEGORIAS[tipo].fields.map(field => [field.key, str(dados[field.key] ?? base[field.key])]))
    form.status_observado = str(dados.status_observado ?? 'Em uso')
    form.observacoes = str(dados.observacoes)
    setModal({ tipo, referenciaId: row?.id ?? (item ? referenciaDoItem(item) : null), itemId: item?.id ?? null, form })
  }

  async function markMissing(tipo: TipoEstoque, row: Previsto, item?: EstoqueItemRegistrado) {
    if (!canEdit()) return
    setBusy(row.id)
    try {
      await onSave(tipo, { referencia_id: row.id, identificador_informado: row.titulo, encontrado: false }, item?.id)
      await onChanged(`${CATEGORIAS[tipo].singular} marcado como não encontrado`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar')
    } finally {
      setBusy(null)
    }
  }

  async function undo(item: EstoqueItemRegistrado) {
    if (!canEdit()) return
    setBusy(item.id)
    try {
      await onDelete(item.id)
      await onChanged('Conferência desfeita')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao desfazer')
    } finally {
      setBusy(null)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!modal) return
    setBusy('modal')
    try {
      const dados = Object.fromEntries(Object.entries(modal.form).map(([key, value]) => [key, value.trim() || null]))
      await onSave(modal.tipo, { ...dados, referencia_id: modal.referenciaId, encontrado: true }, modal.itemId)
      setModal(null)
      await onChanged(modal.referenciaId ? `${CATEGORIAS[modal.tipo].singular} conferido` : `${CATEGORIAS[modal.tipo].singular} adicionado ao estoque`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Revisão de estoque</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">Notebooks e aparelhos da unidade</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Confira cada dispositivo cadastrado. O que não for marcado entra na revisão como não conferido.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {categorias.map(tipo => {
            const { icon: Icon, label } = CATEGORIAS[tipo]
            const stat = stats[tipo]
            const percent = stat.total > 0 ? Math.round((stat.conferidos / stat.total) * 100) : 0
            const active = ativo === tipo
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => { setAtivo(tipo); setSearch('') }}
                className={`rounded-2xl border p-3 text-left transition ${active ? 'border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />{label}</span>
                  <span className="text-xs font-black text-slate-500">{stat.conferidos}/{stat.total}</span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
                </span>
                {stat.extras > 0 && <span className="mt-1.5 block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">+{stat.extras} fora da lista</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={`Buscar em ${CATEGORIAS[ativo].label.toLowerCase()}`}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => openFound(ativo, null)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200"
          >
            <Plus className="h-4 w-4" />
            {CATEGORIAS[ativo].singular} fora da lista
          </button>
        </div>

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {listaAtiva.length === 0 && (
            <li className="p-8 text-center text-sm text-slate-500">{term ? 'Nenhum dispositivo encontrado na busca.' : `Nenhum ${CATEGORIAS[ativo].singular.toLowerCase()} previsto em estoque.`}</li>
          )}
          {listaAtiva.map(row => {
            const item = registradosPorReferencia.get(`${ativo}:${row.id}`)
            const encontrado = item?.dados_informados_json?.encontrado
            const status = !item ? 'pendente' : encontrado === false ? 'ausente' : 'encontrado'
            return (
              <li key={row.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                <span
                  className={`hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid ${
                    status === 'encontrado' ? 'bg-emerald-500/10 text-emerald-600' : status === 'ausente' ? 'bg-red-500/10 text-red-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  {status === 'encontrado' ? <Check className="h-4 w-4" /> : status === 'ausente' ? <CircleSlash className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{row.titulo}</span>
                    {status !== 'pendente' && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${status === 'encontrado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'}`}>
                        {status === 'encontrado' ? 'encontrado' : 'não encontrado'}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{row.detalhe || 'Sem detalhes cadastrados'}</span>
                </span>
                {podeEditar && (
                  <span className="flex shrink-0 gap-2">
                    {status === 'pendente' ? (
                      <>
                        <button type="button" disabled={busy === row.id} onClick={() => openFound(ativo, row)} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:flex-none">
                          <Check className="h-3.5 w-3.5" />Encontrado
                        </button>
                        <button type="button" disabled={busy === row.id} onClick={() => markMissing(ativo, row)} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 sm:flex-none">
                          {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleSlash className="h-3.5 w-3.5" />}Não encontrado
                        </button>
                      </>
                    ) : (
                      <>
                        {status === 'encontrado' && (
                          <button type="button" onClick={() => openFound(ativo, row, item)} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300">
                            Editar
                          </button>
                        )}
                        <button type="button" disabled={busy === item!.id} onClick={() => undo(item!)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white">
                          {busy === item!.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Desfazer
                        </button>
                      </>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {extrasAtivos.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Encontrados fora da lista</p>
            <ul className="mt-2 space-y-1.5">
              {extrasAtivos.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.identificador_informado ?? CATEGORIAS[ativo].singular}</span>
                  {podeEditar && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => openFound(ativo, null, item)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Editar</button>
                      <button type="button" onClick={() => undo(item)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">Remover</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[88vh] sm:rounded-3xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">{modal.referenciaId ? 'Conferência' : 'Fora da lista'}</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{CATEGORIAS[modal.tipo].singular} {modal.referenciaId ? 'encontrado' : 'novo no estoque'}</h3>
                  <p className="mt-1 text-sm text-slate-500">Ajuste o que estiver diferente do cadastro. As divergências vão para a revisão.</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
                {[...CATEGORIAS[modal.tipo].fields, { key: 'status_observado', label: 'Status observado' }, { key: 'observacoes', label: 'Observações', span: true } as FieldConfig].map(field => (
                  <label key={field.key} className={`space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 ${field.span ? 'sm:col-span-2' : ''}`}>
                    <span>{field.label}{field.required && <span className="text-blue-600"> *</span>}</span>
                    {field.span ? (
                      <textarea
                        rows={3}
                        value={modal.form[field.key] ?? ''}
                        onChange={event => setModal(current => current ? { ...current, form: { ...current.form, [field.key]: event.target.value } } : current)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    ) : (
                      <input
                        required={field.required}
                        placeholder={field.placeholder}
                        value={modal.form[field.key] ?? ''}
                        onChange={event => setModal(current => current ? { ...current, form: { ...current.form, [field.key]: event.target.value } } : current)}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:p-5">
                <button type="button" onClick={() => setModal(null)} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button>
                <button type="submit" disabled={busy === 'modal'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {busy === 'modal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar conferência
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
