"use client"

import { useCallback } from "react"
import { listExerciseTags } from "@/api/exercises/catalog"
import { Segmented } from "@/components/ui/segmented"
import { t } from "@/i18n/t"
import type { TagMode } from "@/lib/catalogList"
import { cn } from "@/utils/cn"
import { OptionSearch, OptionsBlock, useLoadedOptions, type ChoiceOption } from "./FilterChip"

const TAG_LIMIT = 50

/** The words of a tag filter: «web і pcap, без crypto». */
export function tagSummary(tags: string[], mode: TagMode, notTags: string[]): string {
  const parts: string[] = []
  if (tags.length) parts.push(tags.join(t(mode === "all" ? "exercises.filter.tags.and" : "exercises.filter.tags.or")))
  if (notTags.length) parts.push(t("exercises.filter.tags.without", { tags: notTags.join(", ") }))
  return parts.join(", ")
}

/**
 * The tag filter: every tag can be required (+) or excluded (−); the required ones combine as «усі вибрані» (AND)
 * or «хоча б один» (OR), the excluded ones always leave a task out (NOT).
 */
export function TagFilter({ tags, mode, notTags, active, onChange, searchAutoFocus = true }: {
  tags: string[]
  mode: TagMode
  notTags: string[]
  /** The popover is open: the tags are asked only then. */
  active: boolean
  /** The popover focuses its search; the phone sheet does not (it would scroll to the tags). */
  searchAutoFocus?: boolean
  onChange: (patch: { tags?: string[]; notTags?: string[]; tagMode?: TagMode }) => void
}) {
  const load = useCallback(async (query: string): Promise<ChoiceOption[]> =>
    (await listExerciseTags(query, TAG_LIMIT)).map(({ Tag, Count }) => ({ value: Tag, label: Tag, meta: String(Count) })), [])
  const { query, setQuery, loaded, retry } = useLoadedOptions(load, active)
  const chosen = [...tags, ...notTags]
  // The chosen tags stay listed (first) while the search shows other matches.
  const withChosen = (items: ChoiceOption[]) => [
    ...chosen.filter((tag) => !items.some((item) => item.value === tag)).map((tag): ChoiceOption => ({ value: tag, label: tag })),
    ...items,
  ]
  const require = (tag: string) => onChange({ tags: tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag], notTags: notTags.filter((x) => x !== tag) })
  const exclude = (tag: string) => onChange({ notTags: notTags.includes(tag) ? notTags.filter((x) => x !== tag) : [...notTags, tag], tags: tags.filter((x) => x !== tag) })
  const summary = tagSummary(tags, mode, notTags)
  return <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2 px-1.5 pt-1 text-sm">
      <span className="text-muted-foreground">{t("exercises.filter.tags.have")}</span>
      <Segmented value={mode} ariaLabel={t("exercises.filter.tags.mode")} onChange={(value) => onChange({ tagMode: value as TagMode })}
        options={[{ value: "all", label: t("exercises.filter.tags.modeAll") }, { value: "any", label: t("exercises.filter.tags.modeAny") }]} />
    </div>
    <OptionSearch value={query} onChange={setQuery} placeholder={t("admin.ex.filterTags.placeholder")} autoFocus={searchAutoFocus} />
    <OptionsBlock loaded={loaded} emptyMessage={t("admin.ex.filterTags.empty")} errorMessage={t("admin.ex.filterTags.loadError")} onRetry={retry}>
      {(items) => <ul className="flex flex-col">{withChosen(items).map((item) => {
        const plus = tags.includes(item.value)
        const minus = notTags.includes(item.value)
        return <li key={item.value} className="catalog-opt">
          <span className="catalog-tag-seg">
            <button type="button" aria-pressed={plus} className={cn(plus && "on")} aria-label={t("exercises.filter.tags.require", { tag: item.label })} onClick={() => require(item.value)}>+</button>
            <button type="button" aria-pressed={minus} className={cn(minus && "no")} aria-label={t("exercises.filter.tags.exclude", { tag: item.label })} onClick={() => exclude(item.value)}>−</button>
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.meta && <span className="catalog-opt-meta">{item.meta}</span>}
        </li>
      })}</ul>}
    </OptionsBlock>
    <p className="px-1.5 pb-1 text-xs text-muted-foreground" aria-live="polite">{summary ? t("exercises.filter.tags.shown", { value: summary }) : t("exercises.filter.tags.none")}</p>
  </div>
}
