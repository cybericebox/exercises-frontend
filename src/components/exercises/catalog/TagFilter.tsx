"use client"

import { useEffect, useId, useState } from "react"
import { Check, X } from "lucide-react"
import { listExerciseTags, type ExerciseTagSuggestion } from "@/api/exercises/catalog"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

/**
 * Tag filter: a combobox over existing tags (GET /exercises/tags?prefix=) with
 * multi-select chips. Only tags the API returns can be picked — no free text.
 */
export function TagFilter({ value, onChange, className }: {
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [options, setOptions] = useState<ExerciseTagSuggestion[]>([])
  const [loadedFor, setLoadedFor] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const prefix = draft.trim()

  useEffect(() => {
    if (!prefix) return
    let current = true
    const id = setTimeout(() => {
      listExerciseTags(prefix)
        .then((items) => { if (current) { setOptions(items); setLoadedFor(prefix); setActive(-1) } })
        .catch(() => { if (current) { setOptions([]); setLoadedFor(prefix) } })
    }, 200)
    return () => { current = false; clearTimeout(id) }
  }, [prefix])

  const shown = prefix && loadedFor === prefix ? options : []
  const expanded = open && prefix !== ""
  const selected = (tag: string) => value.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())

  function toggle(tag: string) {
    onChange(selected(tag) ? value.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...value, tag])
  }

  return (
    <div className="relative min-w-0">
      <div className={cn("flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5", className)}>
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary/40 px-2 py-0.5 text-xs text-foreground">
            {tag}
            <button type="button" aria-label={t("admin.ex.filterTags.remove", { tag })} onClick={() => onChange(value.filter((item) => item !== tag))}
              className="rounded-full focus-visible:outline-2 focus-visible:outline-primary">
              <X aria-hidden="true" className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          role="combobox"
          aria-label={t("admin.ex.filterTags.label")}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={value.length ? "" : t("admin.ex.filterTags.placeholder")}
          onChange={(event) => { setDraft(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && shown.length) { event.preventDefault(); setOpen(true); setActive((i) => (i + 1) % shown.length) }
            else if (event.key === "ArrowUp" && shown.length) { event.preventDefault(); setActive((i) => i <= 0 ? shown.length - 1 : i - 1) }
            else if (event.key === "Enter") { event.preventDefault(); if (active >= 0 && shown[active]) toggle(shown[active].Tag) }
            else if (event.key === "Escape") { setOpen(false); setActive(-1) }
            else if (event.key === "Backspace" && draft === "" && value.length) onChange(value.slice(0, -1))
          }}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
        />
      </div>
      {expanded && (
        <div id={listId} role="listbox" aria-multiselectable="true" aria-label={t("admin.ex.filterTags.label")}
          className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground">
          {loadedFor !== prefix ? <LoadingArea compact className="h-16" label={t("admin.loading")} />
            : shown.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("admin.ex.filterTags.empty")}</p>
            : shown.map(({ Tag, Count }, index) => (
              <div key={Tag} id={`${listId}-${index}`} role="option" aria-selected={selected(Tag)}
                onPointerDown={(event) => { event.preventDefault(); toggle(Tag) }}
                className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent", active === index && "bg-accent")}>
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border", selected(Tag) && "border-primary bg-primary text-primary-foreground")}>
                  {selected(Tag) && <Check aria-hidden="true" className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{Tag}</span>
                <span className="text-xs text-muted-foreground">{Count}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
