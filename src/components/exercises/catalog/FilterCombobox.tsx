"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, Minus, X } from "lucide-react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

export type FilterOption = {
  value: string
  label: string
  /** A quiet note on the right of the option (a count, an event tag). */
  meta?: string
}

/** How long typing waits before an async source is asked. */
const LOAD_DEBOUNCE_MS = 200

/**
 * The one multi-select filter of the catalog: a combobox with a search field, chips for the chosen values and
 * «Очистити». Options come from a static list (filtered by the typed text) or from `load` (asked per text). Chosen
 * values keep their labels while the list shows other matches; `labelFor` names chosen values never listed (a
 * shared link). With `excluded` it is a так/ні filter: a press on an option cycles it off → «так» (chosen, `value`) →
 * «ні» (left out, `excluded`) → off; the chips and the options name the state with an icon and a word, never by
 * colour alone. The anchored list is portalled above the table/dialog and constrained to the available viewport,
 * so a scrolling filter panel cannot clip it.
 */
export function FilterCombobox({ label, placeholder, value, onChange, excluded, onExcludedChange, options, load, labelFor, onOptionsLoaded, emptyMessage, errorMessage, className }: {
  label: string
  placeholder: string
  value: string[]
  onChange: (value: string[]) => void
  options?: FilterOption[]
  load?: (query: string) => Promise<FilterOption[]>
  labelFor?: (value: string) => string | undefined
  onOptionsLoaded?: (options: FilterOption[]) => void
  /** The «ні» values of a так/ні filter (with onExcludedChange); absent: a plain multi-select. */
  excluded?: string[]
  onExcludedChange?: (excluded: string[]) => void
  emptyMessage: string
  errorMessage?: string
  className?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loaded, setLoaded] = useState<{ query: string; items: FilterOption[]; failed: { cause: unknown } | null } | null>(null)
  const [reload, setReload] = useState(0)
  // The labels of every option an async source answered, so a chosen value keeps its name in later answers.
  const [known, setKnown] = useState<Record<string, string>>({})
  const listId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const text = query.trim()

  useEffect(() => {
    if (!load || !open || (loaded?.query === text && reload === 0)) return
    let current = true
    const id = setTimeout(() => {
      load(text)
        .then((items) => {
          if (!current) return
          setLoaded({ query: text, items, failed: null })
          setKnown((before) => ({ ...before, ...Object.fromEntries(items.map((item) => [item.value, item.label])) }))
          onOptionsLoaded?.(items)
          setActive(-1)
        })
        .catch((cause) => { if (current) setLoaded({ query: text, items: [], failed: { cause } }) })
        .finally(() => { if (current) setReload(0) })
    }, text ? LOAD_DEBOUNCE_MS : 0)
    return () => { current = false; clearTimeout(id) }
  }, [load, open, text, loaded?.query, reload, onOptionsLoaded])

  const source = load ? (loaded?.query === text ? loaded.items : null) : (options ?? []).filter((option) => matches(option, text))
  const shown = source
  const chipLabel = (item: string) => options?.find((option) => option.value === item)?.label ?? known[item] ?? labelFor?.(item) ?? item
  const triState = excluded !== undefined && onExcludedChange !== undefined
  const left = excluded ?? []
  const state = (item: string): "yes" | "no" | null => value.includes(item) ? "yes" : left.includes(item) ? "no" : null
  const chips = [...value.map((item) => ({ item, no: false })), ...left.map((item) => ({ item, no: true }))]

  function remove(item: string, no: boolean) {
    if (no) onExcludedChange?.(left.filter((entry) => entry !== item))
    else onChange(value.filter((entry) => entry !== item))
  }

  // Plain: chosen ↔ off. Так/ні: off → так → ні → off.
  function toggle(item: string) {
    const now = state(item)
    if (!triState) {
      onChange(now ? value.filter((entry) => entry !== item) : [...value, item])
    } else if (now === null) {
      onChange([...value, item])
    } else if (now === "yes") {
      onChange(value.filter((entry) => entry !== item))
      onExcludedChange?.([...left, item])
    } else {
      onExcludedChange?.(left.filter((entry) => entry !== item))
    }
  }

  function clear() {
    onChange([])
    if (triState) onExcludedChange?.([])
  }

  const failed = load && loaded?.query === text ? loaded.failed : null

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Anchor asChild><div ref={anchorRef} className={cn("relative min-w-0", className)}>
      <div className="flex min-h-9 items-start gap-1 rounded-md border pointer-coarse:min-h-11 border-border bg-card py-1 pl-2 pr-1 focus-within:border-[var(--ib-action)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--ib-action)]"
        onPointerDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); inputRef.current?.focus() } }}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
          {chips.map(({ item, no }) => (
            <span key={`${no ? "no" : "yes"}:${item}`} data-state={triState ? (no ? "no" : "yes") : undefined}
              className={cn("inline-flex max-w-[calc(100%-2.25rem)] items-center gap-1 rounded-[4px] py-0 pl-1.5 pr-0.5 text-sm text-foreground",
                no ? "border border-dashed border-[var(--ib-dim)]" : "bg-border")}>
              {triState && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground">
                {no ? <Minus aria-hidden="true" className="h-3 w-3" /> : <Check aria-hidden="true" className="h-3 w-3" />}
                {t(no ? "exercises.filter.tags.no" : "exercises.filter.tags.yes")}
              </span>}
              <span className="truncate">{chipLabel(item)}</span>
              <button type="button"
                aria-label={triState ? t("exercises.filter.tags.remove", { value: chipLabel(item), state: t(no ? "exercises.filter.tags.no" : "exercises.filter.tags.yes") }) : t("exercises.filter.remove", { value: chipLabel(item) })}
                onClick={() => remove(item, no)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-[var(--ib-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ib-action)]">
                <X aria-hidden="true" className="h-3.5 w-3.5 opacity-70" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && active >= 0 && shown?.[active] ? `${listId}-${active}` : undefined}
            placeholder={chips.length ? "" : placeholder}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1) }}
            onFocus={() => setOpen(true)}
            onBlur={(event) => {
              if (!anchorRef.current?.contains(event.relatedTarget)) { setOpen(false); setActive(-1) }
            }}
            onKeyDown={(event) => {
              const count = shown?.length ?? 0
              if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); if (count) setActive((i) => (i + 1) % count) }
              else if (event.key === "ArrowUp" && count) { event.preventDefault(); setActive((i) => (i <= 0 ? count - 1 : i - 1)) }
              else if (event.key === "Enter") { event.preventDefault(); if (active >= 0 && shown?.[active]) toggle(shown[active].value) }
              else if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); setActive(-1) }
              else if (event.key === "Backspace" && query === "" && chips.length) remove(chips[chips.length - 1].item, chips[chips.length - 1].no)
            }}
            className="h-7 min-w-8 flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
          />
        </div>
        {chips.length > 0 && (
          <button type="button" aria-label={t("exercises.filter.clearField", { name: label })} title={t("exercises.filter.clear")}
            onClick={() => { clear(); inputRef.current?.focus() }}
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ib-action)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      </div></PopoverPrimitive.Anchor>
      {open && <PopoverPrimitive.Portal><PopoverPrimitive.Content
        side="bottom" align="start" sideOffset={4} collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && anchorRef.current?.contains(event.target)) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        className="z-[80] flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] min-w-44 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground outline-none">
        {/* A press inside the list must not blur the input before the click lands. */}
        <div onPointerDown={(event) => event.preventDefault()}
          className="z-[80] flex min-h-0 flex-col overflow-hidden">
        {/* A так/ні list says up front what a press does: the third state is not discoverable otherwise. */}
        {triState && <p id={`${listId}-hint`} className="border-b border-border px-3 py-2 text-xs leading-snug text-muted-foreground">{t("exercises.filter.tags.cycleHint")}</p>}
        <div id={listId} role="listbox" aria-multiselectable="true" aria-label={label} aria-describedby={triState ? `${listId}-hint` : undefined}
          className="h-52 min-h-0 overflow-y-auto overscroll-contain p-1">
          {failed ? <LoadError compact message={errorMessage} error={failed.cause} className="h-full min-h-0" onRetry={() => setReload((n) => n + 1)} />
            : shown === null ? <LoadingArea compact className="h-full" label={t("admin.loading")} />
              : shown.length === 0 ? <EmptyState compact message={emptyMessage} className="h-full min-h-0" />
                : shown.map((option, index) => {
                  const now = state(option.value)
                  return <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={now !== null} data-state={triState ? now ?? "off" : undefined}
                    onClick={() => toggle(option.value)}
                    className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--ib-hover)]", active === index && "bg-[var(--ib-soft)]")}>
                    <span aria-hidden="true" className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border",
                      now === "yes" && "border-primary bg-primary text-primary-foreground", now === "no" && "border-dashed border-[var(--ib-dim)] text-foreground")}>
                      {now === "yes" && <Check className="h-3 w-3" />}
                      {now === "no" && <Minus className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {triState && now && <span className="shrink-0 text-xs font-medium">{t(now === "no" ? "exercises.filter.tags.no" : "exercises.filter.tags.yes")}</span>}
                    {option.meta && <span className="shrink-0 text-xs text-muted-foreground">{option.meta}</span>}
                  </div>
                })}
        </div>
        </div>
      </PopoverPrimitive.Content></PopoverPrimitive.Portal>}
    </PopoverPrimitive.Root>
  )
}

function matches(option: FilterOption, text: string): boolean {
  if (!text) return true
  const needle = text.toLocaleLowerCase("uk")
  return option.label.toLocaleLowerCase("uk").includes(needle) || (option.meta?.toLocaleLowerCase("uk").includes(needle) ?? false)
}
