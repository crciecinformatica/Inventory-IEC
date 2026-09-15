'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarClock, ClipboardCheck, History, Loader2, UserCheck, UserRound, X } from 'lucide-react'

export type TipoDispositivo = 'MAQUINA' | 'NOTEBOOK' | 'APARELHO' | 'IMPRESSORA' | 'RAMAL' | 'MONITOR' | 'RACK'

type UltimaRevisao = {
  revisado_em: string | null
  origem: 'checklist' | 'manual' | null
  checklist: { id: string; nome: string; localidade_nome: string | null } | null
  solicitacao: { id: string; tipo_solicitacao: string; setor_nome: string | null } | null
  tecnico_nome: string | null
  revisor_nome: string | null
  alteracoes: Array<{ campo: string; antes: string | null; depois: string | null; tipo: string }>
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Mesmo limite usado nos pontos de atenção de impressoras. */
const DIAS_PARA_DESATUALIZAR = 90

function diasDesde(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DIA_MS))
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // Datas sem horário (colunas date) vêm em UTC; timestamps usam o fuso local.
  const dateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime && !dateOnly ? { hour: '2-digit', minute: '2-digit' } : {}),
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date)
}

function relativo(dias: number | null) {
  if (dias == null) return null
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  if (dias < 60) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  return meses < 24 ? `há ${meses} meses` : `há ${Math.floor(dias / 365)} anos`
}

function tone(dias: number | null) {
  if (dias == null) return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
  if (dias > DIAS_PARA_DESATUALIZAR) return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300'
}

function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{value ?? 'Não informado'}</p>
    </div>
  )
}

/**
 * Selo com a data da última revisão do dispositivo. Ao clicar, abre um pop-up
 * com checklist, técnico, revisor e campos alterados na revisão.
 */
export function UltimaRevisaoButton({
  fallbackDate,
  id,
  revisadoEm,
  tipo,
}: {
  fallbackDate?: string | null
  id: string
  revisadoEm?: string | null
  tipo: TipoDispositivo
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<UltimaRevisao | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/ultima-revisao?tipo=${tipo}&id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar revisão')
        return json as UltimaRevisao
      })
      .then(json => { if (!cancelled) setData(json) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar revisão') })
      .finally(() => { if (!cancelled) setLoading(false) })
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
    }
  }, [id, open, tipo])

  const dataSelo = revisadoEm ?? fallbackDate ?? null
  const dias = diasDesde(dataSelo)
  const detalheData = data?.revisado_em ?? dataSelo
  const detalheDias = diasDesde(detalheData)

  return (
    <>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          setOpen(true)
        }}
        title="Ver última revisão"
        className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-bold transition hover:brightness-95 ${tone(dias)}`}
      >
        <History className="h-3.5 w-3.5" />
        {formatDate(dataSelo) ?? 'Sem revisão'}
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}
              onClick={event => event.stopPropagation()}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Última revisão do dispositivo"
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl sm:border sm:border-slate-200 dark:sm:border-slate-800"
              >
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Última revisão</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                      {formatDate(detalheData, data?.origem === 'checklist') ?? 'Nunca revisado'}
                    </p>
                    {detalheData && (
                      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone(detalheDias)}`}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        {relativo(detalheDias)}
                        {detalheDias != null && detalheDias > DIAS_PARA_DESATUALIZAR && ' · revisão desatualizada'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  {loading && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando detalhes...</p>
                  )}
                  {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}

                  {data && !loading && (
                    <>
                      {!data.origem && (
                        <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
                          Este dispositivo ainda não passou por nenhuma revisão. Ele recebe a data automaticamente quando um checklist que o inclui é assimilado.
                        </p>
                      )}

                      {data.origem === 'manual' && (
                        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                          Data registrada manualmente no cadastro. Não há checklist associado a esta revisão.
                        </p>
                      )}

                      {data.origem === 'checklist' && (
                        <>
                          {data.checklist && (
                            <Link
                              href={data.solicitacao ? `/checklists-validacao/solicitacoes/${data.solicitacao.id}/revisao` : `/checklists-validacao/${data.checklist.id}`}
                              className="group flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 dark:border-slate-800 dark:hover:border-blue-800"
                            >
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><ClipboardCheck className="h-5 w-5" /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{data.checklist.nome}</span>
                                <span className="block truncate text-xs text-slate-500">
                                  {[data.checklist.localidade_nome, data.solicitacao?.setor_nome ?? (data.solicitacao?.tipo_solicitacao === 'ESTOQUE' ? 'Estoque' : data.solicitacao?.tipo_solicitacao === 'RACK' ? 'Rack' : null)].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                            </Link>
                          )}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Info icon={UserRound} label="Técnico" value={data.tecnico_nome} />
                            <Info icon={UserCheck} label="Revisor" value={data.revisor_nome} />
                          </div>

                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Alterações aplicadas</p>
                            {data.alteracoes.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">Nenhuma divergência: o cadastro foi confirmado como estava.</p>
                            ) : (
                              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {data.alteracoes.map((alteracao, index) => (
                                  <li key={`${alteracao.campo}-${index}`} className="px-4 py-2.5 text-sm">
                                    <p className="font-bold text-slate-800 dark:text-slate-100">{alteracao.campo}</p>
                                    <p className="mt-0.5 break-words text-xs text-slate-500">
                                      {alteracao.antes != null && <><span className="line-through">{alteracao.antes}</span>{' → '}</>}
                                      <span className="font-semibold text-slate-700 dark:text-slate-200">{alteracao.depois ?? 'Não informado'}</span>
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
