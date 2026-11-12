"use client"

import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Eye, EyeOff } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { fromDisplay, toDisplay } from "./refDisplay"
import { TaskRefPicker } from "./TaskRefPicker"

type RefFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  variantIndex: number
  /** The raw text (with `{{task.<key>}}` and `{{var.<name>}}` tokens). */
  value: string
  onValueChange: (raw: string) => void
  /** Show the «Вставити значення» button. */
  picker?: boolean
  mono?: boolean
  /** A text area (a script, the content of a file) instead of a line. */
  multiline?: boolean
  rows?: number
  /** A plain typed value is shown as dots with an eye; a value that holds a reference is shown as it is. */
  mask?: boolean
  /** Offers «Нова змінна схеми» in the picker: create the variable, then call `insert(name)` to put its token in. */
  onNewVariable?: (insert: (name: string) => void) => void
  /** More tools at the right end of the field (a button that opens a larger editor). */
  expandTool?: ReactNode
  /** A task that must not be offered in the picker (the task being edited). */
  excludeTaskKey?: string
}

type Range = { start: number; end: number }
type Piece = { text: string; kind: "plain" | "task" | "var" | "unknown" }

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The substitutions as the author sees them (`{{відповідь: Вхід}}`, `{{змінна: pw}}`). */
function tokenRe(): RegExp {
  return new RegExp(`\\{\\{\\s*(${escapeRe(t("ed.ui.ref.tagAnswer"))}|${escapeRe(t("ed.ui.ref.tagVar"))}):\\s*(.+?)\\s*\\}\\}`, "g")
}

function tokenRanges(display: string): Range[] {
  return [...display.matchAll(tokenRe())].map((match) => ({ start: match.index, end: match.index + match[0].length }))
}

function pieces(display: string, taskNames: string[], variables: string[]): Piece[] {
  const out: Piece[] = []
  let last = 0
  for (const match of display.matchAll(tokenRe())) {
    if (match.index > last) out.push({ text: display.slice(last, match.index), kind: "plain" })
    const isAnswer = match[1] === t("ed.ui.ref.tagAnswer")
    const known = isAnswer ? taskNames.includes(match[2]) : variables.includes(match[2])
    out.push({ text: match[0], kind: known ? (isAnswer ? "task" : "var") : "unknown" })
    last = match.index + match[0].length
  }
  if (last < display.length) out.push({ text: display.slice(last), kind: "plain" })
  return out
}

const TOKEN_CLASS = {
  task: "rounded-sm bg-[color-mix(in_srgb,var(--ib-action)_16%,transparent)] text-[var(--ib-action)]",
  var: "rounded-sm bg-[color-mix(in_srgb,var(--ib-ok)_18%,transparent)] text-[var(--ib-ok)]",
  unknown: "underline decoration-wavy decoration-destructive",
  plain: "",
} as const

/**
 * RefField — a text field for a value that may hold references to answers and schema variables. ONE notation: the
 * highlighted brace token in the code font (`{{відповідь: Вхід}}`, `{{змінна: pw}}`), atomic (one Backspace removes it
 * whole), an unknown reference underlined. The form keeps the raw token (`{{task.<key>}}`, `{{var.<name>}}`); the field
 * shows names and inserts a picked answer or variable at the caret. Optional: several lines, a masked plain value with an
 * eye, «Нова змінна схеми» in the picker, an expand tool. The ref is the input (or the text area).
 */
export const RefField = forwardRef<HTMLInputElement & HTMLTextAreaElement, RefFieldProps>(function RefField({
  variantIndex, value, onValueChange, picker = true, mono = true, multiline = false, rows = 4, mask = false, onNewVariable, expandTool, excludeTaskKey,
  disabled, className, onBlur, onSelect, onKeyUp, onClick, onKeyDown, ...rest
}, forwardedRef) {
  const { control } = useFormContext<DraftFormValues>()
  const watchedTasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` })
  const watchedVariables = useWatch({ control, name: `Variants.${variantIndex}.Topology.Variables` })
  const tasks = useMemo(() => watchedTasks ?? [], [watchedTasks])
  const variables = useMemo(() => watchedVariables ?? [], [watchedVariables])
  const element = useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null)
  const caret = useRef<[number, number] | null>(null)
  const pendingCaret = useRef<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [scroll, setScroll] = useState({ left: 0, top: 0 })
  const shown = toDisplay(value, tasks)
  const ranges = tokenRanges(shown)
  const hidden = mask && shown !== "" && ranges.length === 0 && !revealed
  const canReveal = mask && shown !== "" && ranges.length === 0 && !disabled

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !element.current) return
    element.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    caret.current = [pendingCaret.current, pendingCaret.current]
    pendingCaret.current = null
  })

  const remember = () => {
    const node = element.current
    if (!node) return
    caret.current = [node.selectionStart ?? node.value.length, node.selectionEnd ?? node.value.length]
    setScroll({ left: node.scrollLeft, top: node.scrollTop })
  }

  const commit = useCallback((display: string, position: number) => {
    pendingCaret.current = position
    onValueChange(fromDisplay(display, tasks))
  }, [onValueChange, tasks])

  function insert(token: string) {
    const [start, end] = caret.current ?? [shown.length, shown.length]
    const display = toDisplay(token, tasks)
    commit(shown.slice(0, Math.min(start, shown.length)) + display + shown.slice(Math.min(end, shown.length)), Math.min(start, shown.length) + display.length)
    requestAnimationFrame(() => element.current?.focus())
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || (event.key !== "Backspace" && event.key !== "Delete")) return
    const node = event.currentTarget
    if (node.selectionStart === null || node.selectionStart !== node.selectionEnd) return
    const position = node.selectionStart
    const token = ranges.find((range) => event.key === "Backspace" ? range.start < position && position <= range.end : range.start <= position && position < range.end)
    if (!token) return
    event.preventDefault()
    commit(shown.slice(0, token.start) + shown.slice(token.end), token.start)
  }

  const setRef = (node: (HTMLInputElement & HTMLTextAreaElement) | null) => {
    element.current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }
  const handlers = {
    onSelect: (event: React.SyntheticEvent<HTMLInputElement>) => { remember(); onSelect?.(event) },
    onKeyUp: (event: KeyboardEvent<HTMLInputElement>) => { remember(); onKeyUp?.(event) },
    onClick: (event: React.MouseEvent<HTMLInputElement>) => { remember(); onClick?.(event) },
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => { remember(); onBlur?.(event) },
    onScroll: remember,
    onKeyDown: keyDown,
    onChange: (event: ChangeEvent<HTMLInputElement>) => { remember(); onValueChange(fromDisplay(event.target.value, tasks)) },
  }
  const invalid = rest["aria-invalid"] === true || rest["aria-invalid"] === "true"
  const frame = cn("relative min-w-0 rounded-md border border-border bg-card text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40", invalid && "border-destructive", disabled && "opacity-50", className)
  const font = cn("block w-full bg-transparent px-3 leading-5 outline-none", mono ? "font-mono text-[13px]" : "text-sm")
  const tools = (picker && !disabled ? 1 : 0) + (canReveal ? 1 : 0) + (expandTool ? 1 : 0)
  const padRight = tools >= 3 ? "pr-24" : tools === 2 ? "pr-16" : tools === 1 ? "pr-10" : ""

  const toolbar = (picker && !disabled) || canReveal || expandTool
    ? <span className={cn("absolute right-0.5 flex items-center gap-0.5", multiline ? "top-0.5" : "inset-y-0")}>
      {canReveal && <HoverTooltip text={revealed ? t("ed.ui.hideValue") : t("ed.ui.showValue")}>
        <button type="button" aria-pressed={revealed} aria-label={revealed ? t("ed.ui.hideValue") : t("ed.ui.showValue")} onClick={() => setRevealed(!revealed)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          {revealed ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </HoverTooltip>}
      {picker && !disabled && <TaskRefPicker variantIndex={variantIndex} onPick={insert} excludeTaskKey={excludeTaskKey}
        onNewVariable={onNewVariable ? () => onNewVariable((name) => insert(`{{var.${name}}}`)) : undefined} />}
      {expandTool}
    </span>
    : null

  if (hidden) {
    return <div className={frame}>
      <input {...rest} {...handlers} ref={setRef as Ref<HTMLInputElement>} type="password" autoComplete="new-password" value={shown} disabled={disabled} spellCheck={false} className={cn(font, "h-[34px] py-[7px]", padRight)} />
      {toolbar}
    </div>
  }
  const taskNames = tasks.filter((task) => task.Key !== "").map((task) => task.Name.trim())
  const mirror = pieces(shown, taskNames, variables.map((variable) => variable.Name)).map((piece, index) => <span key={index} data-ref-token={piece.kind === "plain" ? undefined : piece.kind} className={TOKEN_CLASS[piece.kind]}>{piece.text}</span>)
  const hasTokens = ranges.length > 0
  return <div className={frame}>
    {/* The mirror shows the text with its tokens highlighted; the real field above it is transparent but for the caret. */}
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden pl-3", tools >= 3 ? "pr-24" : tools === 2 ? "pr-16" : tools === 1 ? "pr-10" : "pr-3")}>
      <div className={cn("whitespace-pre leading-5 text-foreground", mono ? "font-mono text-[13px]" : "text-sm", multiline ? "py-2" : "py-[7px]")} style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{mirror}{"\n"}</div>
    </div>
    {multiline
      ? <textarea {...(rest as object)} {...(handlers as object)} ref={setRef as Ref<HTMLTextAreaElement>} rows={rows} wrap="off" value={shown} disabled={disabled} spellCheck={false} autoComplete="off"
        className={cn(font, "resize-y overflow-auto py-2 text-transparent caret-foreground placeholder:text-placeholder", padRight)} style={{ minHeight: `calc(${rows}lh + 1rem)` }} />
      : <input {...rest} {...handlers} ref={setRef as Ref<HTMLInputElement>} type="text" value={shown} disabled={disabled} spellCheck={false} autoComplete="off"
        className={cn(font, "h-[34px] py-[7px] placeholder:text-placeholder", hasTokens || shown !== "" ? "text-transparent caret-foreground" : "", padRight)} />}
    {toolbar}
  </div>
})
