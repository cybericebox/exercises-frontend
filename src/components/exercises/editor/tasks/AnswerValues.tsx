"use client"

import { useEffect, useRef, useState } from "react"
import { Braces, RefreshCw } from "lucide-react"
import { useController, useFormContext } from "react-hook-form"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { FieldLabel } from "@/components/ui/field-label"
import { RemoveAction, REVEAL_ON_HOVER } from "@/components/exercises/RemoveAction"
import { SectionAddButton } from "@/components/exercises/SectionAddButton"
import { flagCandidateErrorKey, flagTemplateCanProduce, parseFlagCandidate, TEMPLATE_PREFIX, type ParsedFlagCandidate } from "@/lib/flagPattern"
import { getFlagPolicy, type FlagPolicy } from "@/api/exercises/flagPolicy"
import { MAX_ANSWER_VALUES, type AnswerType } from "@/api/exercises/model"
import { answerValueError } from "@/lib/editor/schemas/task"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { FieldError, fieldId, fieldProps, useFieldError } from "../fieldErrors"
import { lowerFirst } from "./taskShared"

/** Elements of a flag template the author can insert at the caret (the grammar of the platform, not regular expressions). */
const FLAG_PARTS = [
  { stem: "digit", text: String.raw`\d`, back: 0 }, { stem: "lower", text: String.raw`\l`, back: 0 }, { stem: "upper", text: String.raw`\u`, back: 0 },
  { stem: "digitsLower", text: String.raw`[\d\l]`, back: 0 }, { stem: "alphanumeric", text: String.raw`[\d\l\u]`, back: 0 },
  { stem: "set", text: "[]", back: 1 }, { stem: "repeat", text: "{8}", back: 0 },
] as const
const TEXT_PARTS = [
  { stem: "hex8", text: "[a-f0-9]{8}", back: 0 }, { stem: "alnum12", text: "[a-z0-9]{12}", back: 0 }, { stem: "digits4", text: String.raw`\d{4}`, back: 0 }, { stem: "lower6", text: String.raw`\l{6}`, back: 0 },
] as const

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length)
}

/** The first line of the inherited answer of a linked variant: `ICE{…} (+2) · за зразком`. */
function inheritedLine(values: string[]): string {
  if (values.length === 0) return t("ed.b.answer.random")
  const first = values[0].replace(TEMPLATE_PREFIX, "")
  return `${first}${values.length > 1 ? ` (+${values.length - 1})` : ""}${values[0].startsWith(TEMPLATE_PREFIX) ? ` · ${t("ed.b.answer.byPattern").toLowerCase()}` : ""}`
}

type PasteLine = { line: number; text: string }

/**
 * AnswerValues — «Значення» of an answer check (flag or text). Several values; each is «Фіксоване» (one value for all) or
 * «За зразком» (a new value per participant), chosen in a dropdown at the value. A linked variant inherits the base values
 * until it gets its own. Errors sit beside the value they belong to. A pasted list of lines becomes several values.
 */
export function AnswerValues({ variantIndex, taskIndex, type, disabled, linked, baseValues }: {
  variantIndex: number
  taskIndex: number
  type: AnswerType
  /** The editor is read-only. */
  disabled: boolean
  /** The variant is linked: it may change the values only. */
  linked: boolean
  /** The base variant's values (linked variants). */
  baseValues: string[]
}) {
  const path = `Variants.${variantIndex}.Tasks.${taskIndex}.Check.Answer.Values`
  const { control } = useFormContext<DraftFormValues>()
  const { field } = useController({ control, name: path as `Variants.${number}.Tasks.${number}.Check.Answer.Values` })
  const values = field.value ?? []
  const listError = useFieldError(path)
  const [pending, setPending] = useState<{ index: number; lines: PasteLine[] } | null>(null)
  const [pasteMode, setPasteMode] = useState<"fixed" | "template">("fixed")
  const [policy, setPolicy] = useState<FlagPolicy | null>(null)
  const focusLast = useRef(false)
  useEffect(() => { let live = true; getFlagPolicy().then((next) => { if (live) setPolicy(next) }).catch(() => undefined); return () => { live = false } }, [])
  useEffect(() => {
    if (!focusLast.current) return
    focusLast.current = false
    document.getElementById(fieldId(`${path}.${values.length - 1}`))?.focus()
  }, [values.length, path])

  const inherited = linked && values.length === 0
  const change = (next: string[]) => field.onChange(next)
  const add = () => { focusLast.current = true; change([...values, type === "flag" ? "ICE{}" : ""]) }
  const own = () => { focusLast.current = true; change([type === "flag" ? `ICE{${randomHex(16)}}` : ""]) }

  const pasteResults = (() => {
    if (!pending) return []
    const seen = new Set(values.filter((_, index) => index !== pending.index))
    return pending.lines.map((line) => {
      const candidate = pasteMode === "template" ? TEMPLATE_PREFIX + line.text : line.text
      let reason = answerValueError(type, candidate)
      if (!reason && seen.has(candidate)) reason = t("admin.ex.val.flagDuplicate")
      seen.add(candidate)
      return { ...line, candidate, reason }
    })
  })()
  const validPaste = pasteResults.filter((line) => !line.reason)
  const invalidPaste = pasteResults.filter((line) => line.reason)

  return <div className="min-w-0 space-y-1.5" data-testid="answer-values">
    <div className="flex min-h-6 flex-wrap items-center gap-x-2">
      <FieldLabel as="span" id={`${path}-label`} text={t("ed.b.answer.values")} help={{
        intro: t(type === "flag" ? "ed.b.answer.values.helpFlag" : "ed.b.answer.values.helpText"),
        items: [{ term: t("ed.b.answer.fixed"), text: lowerFirst(t("ed.b.answer.fixedHint")) }, { term: t("ed.b.answer.byPattern"), text: lowerFirst(t("ed.b.answer.byPatternHint")) }],
        default: type === "flag" ? t("ed.b.answer.values.defaultFlag") : t("ed.b.answer.values.defaultText"),
      }} />
      {linked && !inherited && <Badge tone="info">{t("ed.b.answer.own")}</Badge>}
    </div>
    <div role="group" aria-labelledby={`${path}-label`} className="space-y-1">
      {inherited
        ? <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{inheritedLine(baseValues)}</span>
          <Badge tone="muted">{t("ed.b.answer.inherited")}</Badge>
          {!disabled && <Button type="button" size="sm" variant="outline" className="h-7" onClick={own}>{t("ed.b.answer.ownAction")}</Button>}
        </div>
        : values.map((raw, index) => <ValueRow key={index} path={`${path}.${index}`} index={index} raw={raw} type={type} values={values}
          disabled={disabled} linked={linked} policy={policy}
          onText={(next) => change(values.map((value, i) => (i === index ? next : value)))}
          onRemove={() => change(values.filter((_, i) => i !== index))}
          onPaste={(lines) => { setPasteMode("fixed"); setPending({ index, lines }) }} />)}
      {!inherited && values.length === 0 && (type === "flag"
        ? <div className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground"><RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />{t("ed.b.answer.random")}</div>
        : <p className="text-sm text-muted-foreground">{t("ed.b.answer.textRequired")}</p>)}
    </div>
    {listError && <FieldError path={path} />}
    {!disabled && !inherited && <div className="flex flex-wrap items-center gap-2 subtask-add-left">
      <SectionAddButton label={t("ed.b.answer.add")} onClick={add} blockedReason={values.length >= MAX_ANSWER_VALUES ? t("ed.b.answer.limit", { max: MAX_ANSWER_VALUES }) : null} />
      {linked && <Button type="button" size="sm" variant="outline" onClick={() => change([])}><RefreshCw aria-hidden="true" className="mr-1 h-4 w-4" />{t("ed.b.answer.reset")}</Button>}
    </div>}
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
      <DialogContent className="max-h-[min(90dvh,38rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ed.b.answer.pasteTitle")}</DialogTitle>
          <DialogDescription>{t("ed.b.answer.pasteDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <span className="block font-medium">{t("ed.b.answer.pasteMode")}</span>
            <SelectMenu ariaLabel={t("ed.b.answer.pasteMode")} value={pasteMode} onChange={(mode) => setPasteMode(mode as "fixed" | "template")} className="w-full"
              options={[{ value: "fixed", label: t("ed.b.answer.fixed") }, { value: "template", label: t("ed.b.answer.byPattern") }]} />
          </div>
          {pending && <div className="space-y-2">
            <p className="text-muted-foreground">{t("ed.b.answer.pasteCount", { count: pending.lines.length })}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>{t("ed.b.answer.pasteValid", { count: validPaste.length })}</span>
              <span className={invalidPaste.length ? "text-destructive" : "text-muted-foreground"}>{t("ed.b.answer.pasteInvalid", { count: invalidPaste.length })}</span>
            </div>
            {invalidPaste.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {invalidPaste.map((line) => <li key={line.line} className="break-all text-destructive">{line.line}. {line.text} <span className="text-muted-foreground">— {line.reason}</span></li>)}
            </ul>}
          </div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPending(null)}>{t("confirm.cancel")}</Button>
          <Button type="button" disabled={validPaste.length === 0} onClick={() => {
            if (!pending) return
            change([...values.slice(0, pending.index), ...validPaste.map((line) => line.candidate), ...values.slice(pending.index + 1)])
            setPending(null)
          }}>{t(invalidPaste.length ? "ed.b.answer.pasteValidOnly" : "ed.b.answer.pasteConfirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}

function ValueRow({ path, index, raw, type, values, disabled, linked, policy, onText, onRemove, onPaste }: {
  path: string
  index: number
  raw: string
  type: AnswerType
  values: string[]
  disabled: boolean
  linked: boolean
  policy: FlagPolicy | null
  onText: (raw: string) => void
  onRemove: () => void
  onPaste: (lines: PasteLine[]) => void
}) {
  const template = raw.startsWith(TEMPLATE_PREFIX)
  const visible = template ? raw.slice(TEMPLATE_PREFIX.length) : raw
  const own = useFieldError(path)
  const parsed: { info: ParsedFlagCandidate | null } = (() => {
    if (type !== "flag") return { info: null }
    try { return { info: parseFlagCandidate(raw) } } catch { return { info: null } }
  })()
  // Zod reports the first problem of the value as the field error; before the first check the row shows the live one.
  const live = own ?? (raw !== "" && raw !== "ICE{}" ? (() => {
    if (type === "flag") { try { parseFlagCandidate(raw); return undefined } catch (error) { return t(flagCandidateErrorKey(error)) } }
    return answerValueError(type, raw) || undefined
  })() : undefined)
  const duplicate = raw !== "" && values.indexOf(raw) < index ? t("admin.ex.val.flagDuplicate") : undefined
  const error = live ?? duplicate
  const info = parsed.info
  const weak = info && template && policy && info.entropyBits < policy.WarningBits ? t("admin.exTask.flag.weak") : null
  const overlap = info?.kind === "fixed" && values.some((other) => { try { const p = parseFlagCandidate(other); return p.kind === "template" && flagTemplateCanProduce(p, raw) } catch { return false } })
  const inputRef = useRef<HTMLInputElement>(null)
  const caret = useRef<[number, number] | null>(null)
  const remember = () => { const node = inputRef.current; if (node) caret.current = [node.selectionStart ?? node.value.length, node.selectionEnd ?? node.value.length] }
  const parts = type === "flag" ? FLAG_PARTS : TEXT_PARTS
  function insert(text: string, back: number) {
    const [start, end] = caret.current ?? [visible.length, visible.length]
    const next = visible.slice(0, start) + text + visible.slice(end)
    onText(TEMPLATE_PREFIX + next)
    const position = start + text.length - back
    caret.current = [position, position]
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(position, position) })
  }
  const modeLabel = t("ed.b.answer.modeN", { n: index + 1 })
  const props = fieldProps(path, error)
  return <div className="min-w-0 space-y-1" data-testid="answer-value-row">
    <div className="group flex h-9 min-w-0 max-w-[48rem] items-center overflow-hidden rounded-md border border-border bg-card pr-0.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 aria-[invalid=true]:border-destructive pointer-coarse:h-11" aria-invalid={error ? true : undefined}>
      {!linked && <SelectMenu value={template ? "template" : "fixed"} ariaLabel={modeLabel} disabled={disabled} triggerVariant="default"
        className="h-full w-auto shrink-0 gap-1 rounded-none border-0 border-r border-border bg-muted/40 px-3 text-xs text-muted-foreground hover:bg-muted pointer-coarse:h-full"
        menuClassName="min-w-64"
        options={[
          { value: "fixed", label: t("ed.b.answer.fixed"), description: t("ed.b.answer.fixedHint") },
          { value: "template", label: t("ed.b.answer.byPattern"), description: t("ed.b.answer.byPatternHint") },
        ]}
        onChange={(mode) => onText(mode === "template" ? TEMPLATE_PREFIX + (visible || (type === "flag" ? String.raw`ICE{\d\d\d\d}` : String.raw`\l\l\l\l`)) : visible)} />}
      <Input {...props} ref={inputRef} name={path} value={visible} disabled={disabled} spellCheck={false} autoComplete="off" aria-label={t("ed.b.answer.valueN", { n: index + 1 })}
        placeholder={template ? (type === "flag" ? String.raw`ICE{\d\d\d\d}` : String.raw`\l\l\l\l`) : type === "flag" ? "ICE{…}" : t("ed.b.answer.textPlaceholder")}
        className="h-full min-w-0 flex-1 border-0 bg-transparent font-mono text-sm focus-visible:border-0 focus-visible:ring-0 pointer-coarse:h-full"
        onChange={(event) => onText((template ? TEMPLATE_PREFIX : "") + event.target.value)}
        onSelect={remember} onKeyUp={remember} onClick={remember}
        onPaste={(event) => {
          const lines = event.clipboardData.getData("text/plain").split(/\r\n|\r|\n/).map((text, line) => ({ line: line + 1, text: text.trim() })).filter((line) => line.text)
          if (lines.length < 2) return
          event.preventDefault()
          onPaste(lines)
        }} />
      {template && !disabled && <DropdownMenu>
        <HoverTooltip text={t("ed.b.answer.insertPart")}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("ed.b.answer.insertPart")} onPointerDown={remember}><Braces aria-hidden="true" className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
        </HoverTooltip>
        <DropdownMenuContent align="end" className="max-h-72 min-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t("ed.b.answer.insertPart")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {parts.map((part) => <DropdownMenuItem key={part.stem} onSelect={() => insert(part.text, part.back)}>
            {t(`ed.b.answer.part.${part.stem}`)} <code className="ml-auto pl-4 text-xs text-muted-foreground">{part.text}</code>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>}
      {!disabled && <RemoveAction ariaLabel={t("ed.b.answer.remove")} onClick={onRemove} className="h-8 w-8" wrapperClassName={REVEAL_ON_HOVER} />}
    </div>
    {error && <FieldError path={path} message={error} />}
    {!error && (weak || overlap) && <p role="status" className={cn("text-xs text-amber-700")}>{[weak, overlap ? t("admin.exTask.flag.overlap") : null].filter(Boolean).join(" ")}</p>}
    {info && template && <p className="text-xs text-muted-foreground">{t("ed.b.answer.meta", { example: info.example, count: info.cardinality.toLocaleString("uk-UA"), bits: info.entropyBits.toFixed(1) })}</p>}
  </div>
}
