"use client"

import { useId, useState, type Ref } from "react"
import { X } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

/**
 * TagInput — chip input for a list of strings (task tags, catalog filter).
 * Enter/comma/blur adds a chip, Backspace on an empty field removes the last one.
 */
export function TagInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  inputRef,
  id,
  draftValue,
  onDraftValueChange,
  suggestions,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  inputRef?: Ref<HTMLInputElement>
  id?: string
  draftValue?: string
  onDraftValueChange?: (value: string) => void
  suggestions?: { Tag: string; Count: number }[]
}) {
  const [internalDraft, setInternalDraft] = useState("")
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const listId = useId()
  const draft = draftValue ?? internalDraft
  const setDraft = onDraftValueChange ?? setInternalDraft
  const matchingSuggestions = suggestions?.filter(({ Tag }) =>
    draft.trim() && Tag.toLocaleLowerCase().startsWith(draft.trim().toLocaleLowerCase()) &&
    !value.some((selected) => selected.toLocaleLowerCase() === Tag.toLocaleLowerCase())) ?? []
  const showSuggestions = !suggestionsDismissed && matchingSuggestions.length > 0

  function commit(selectedTag?: string) {
    const tag = (selectedTag ?? draft).trim()
    setDraft("")
    setActiveSuggestion(-1)
    setSuggestionsDismissed(false)
    if (!tag || value.some((selected) => selected.toLocaleLowerCase() === tag.toLocaleLowerCase())) return
    onChange([...value, tag])
  }

  return (
    <div className="relative min-w-0">
    <div className={cn("flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5", className)}>
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-secondary/40 px-2 py-0.5 text-xs text-foreground"
        >
          {tag}
          {!disabled && (
            <button type="button" aria-label={`remove-${tag}`} onClick={() => onChange(value.filter((x) => x !== tag))}>
              <X className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        ref={inputRef}
        value={draft}
        disabled={disabled}
        role={suggestions ? "combobox" : undefined}
        aria-autocomplete={suggestions ? "list" : undefined}
        aria-expanded={suggestions ? showSuggestions : undefined}
        aria-controls={showSuggestions ? listId : undefined}
        aria-activedescendant={showSuggestions && activeSuggestion >= 0 ? `${listId}-${activeSuggestion}` : undefined}
        onChange={(e) => { setDraft(e.target.value); setActiveSuggestion(-1); setSuggestionsDismissed(false) }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && showSuggestions) {
            e.preventDefault()
            setActiveSuggestion((current) => (current + 1) % matchingSuggestions.length)
            return
          }
          if (e.key === "ArrowUp" && showSuggestions) {
            e.preventDefault()
            setActiveSuggestion((current) => current <= 0 ? matchingSuggestions.length - 1 : current - 1)
            return
          }
          if (e.key === "Escape" && showSuggestions) {
            e.preventDefault()
            setSuggestionsDismissed(true)
            setActiveSuggestion(-1)
            return
          }
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit(e.key === "Enter" && showSuggestions && activeSuggestion >= 0
              ? matchingSuggestions[activeSuggestion].Tag : undefined)
          }
          if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => commit()}
        placeholder={placeholder ?? t("admin.ex.tagHint")}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
      />
    </div>
    {showSuggestions && <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
      {matchingSuggestions.map(({ Tag, Count }, index) => <div key={Tag} id={`${listId}-${index}`} role="option" aria-selected={activeSuggestion === index}
        onPointerDown={(event) => { event.preventDefault(); commit(Tag) }}
        className={cn("flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent", activeSuggestion === index && "bg-accent")}
      ><span>{Tag}</span><span className="text-xs text-muted-foreground">· {Count}</span></div>)}
    </div>}
    </div>
  )
}
