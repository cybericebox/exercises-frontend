"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

/**
 * One filter of the catalog toolbar: a chip that opens its choices in a popover. A set filter shows its value after
 * the label and a × inside the chip that clears it (nothing is lost, so × and not a bin).
 */
export function FilterChip({ label, value, onClear, children, open, onOpenChange, contentClassName }: {
  label: string
  /** The chosen value in words; empty = the filter is not set. */
  value: string
  onClear: () => void
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
}) {
  const clearLabel = t("exercises.filter.clearField", { name: label })
  return <Popover open={open} onOpenChange={onOpenChange}>
    <span className={cn("catalog-fchip", value && "catalog-fchip-on")}>
      <PopoverTrigger asChild>
        <button type="button" className="catalog-fchip-main">
          <span>{label}{value && <>: <b>{value}</b></>}</span>
          {!value && <ChevronDown aria-hidden="true" />}
        </button>
      </PopoverTrigger>
      {value && <HoverTooltip text={clearLabel}>
        <button type="button" className="catalog-fchip-x" aria-label={clearLabel} onClick={onClear}><X aria-hidden="true" /></button>
      </HoverTooltip>}
    </span>
    <PopoverContent className={cn("w-64 p-1.5", contentClassName)}>{children}</PopoverContent>
  </Popover>
}

export type ChoiceOption = { value: string; label: string; meta?: string }

/** A checkbox list of a chip: several values at once. */
export function ChoiceList({ options, value, onChange, label }: { options: ChoiceOption[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  return <div role="group" aria-label={label} className="flex flex-col">
    {options.map((option) => {
      const on = value.includes(option.value)
      return <label key={option.value} className="catalog-opt">
        <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((item) => item !== option.value) : [...value, option.value])} />
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {option.meta && <span className="catalog-opt-meta">{option.meta}</span>}
      </label>
    })}
  </div>
}

/** How long typing waits before an async source is asked. */
const LOAD_DEBOUNCE_MS = 200

type Loaded = { query: string; items: ChoiceOption[]; failed: { cause: unknown } | null }

/**
 * Options from the server for the typed text (authors, tags, events): a search field over a list. Loading, empty
 * and error states are centred in the same fixed-height block, so the popover never jumps.
 */
export function useLoadedOptions(load: (query: string) => Promise<ChoiceOption[]>, active: boolean) {
  const [query, setQuery] = useState("")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const text = query.trim()
  useEffect(() => {
    if (!active) return
    let current = true
    const timer = setTimeout(() => {
      load(text).then((items) => { if (current) setLoaded({ query: text, items, failed: null }) })
        .catch((cause) => { if (current) setLoaded({ query: text, items: [], failed: { cause } }) })
    }, loaded ? LOAD_DEBOUNCE_MS : 0)
    return () => { current = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` only chooses the delay
  }, [load, text, active, attempt])
  return { query, setQuery, loaded, retry: () => { setLoaded(null); setAttempt((value) => value + 1) } }
}

/** The search field at the top of an options popover. */
export function OptionSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const id = useId()
  return <div className="catalog-opt-search">
    <Search aria-hidden="true" />
    <label htmlFor={id} className="sr-only">{placeholder}</label>
    <input id={id} type="search" autoFocus value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </div>
}

/** The list block of an async options popover: the crest, the empty mark or the error, each centred in it. */
export function OptionsBlock({ loaded, emptyMessage, errorMessage, onRetry, children }: { loaded: Loaded | null; emptyMessage: string; errorMessage: string; onRetry: () => void; children: (items: ChoiceOption[]) => ReactNode }) {
  return <div className="catalog-opt-block">
    {loaded === null ? <LoadingArea compact className="h-full" label={t("admin.loading")} />
      : loaded.failed ? <LoadError compact message={errorMessage} error={loaded.failed.cause} className="h-full min-h-0" onRetry={onRetry} />
      : loaded.items.length === 0 ? <EmptyState compact message={emptyMessage} className="h-full min-h-0" />
      : children(loaded.items)}
  </div>
}
