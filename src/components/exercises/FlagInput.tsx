"use client"

import { useRef, useState } from "react"
import { Braces, ClipboardPaste, Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RemoveAction } from "./RemoveAction"
import { FlagHelp } from "./FlagHelp"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { flagCandidateErrorKey, flagTemplateCanProduce, parseFlagCandidate, type ParsedFlagCandidate } from "@/lib/flagPattern"
import type { FlagPolicy } from "@/api/exercises/flagPolicy"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"

const TEMPLATE_PREFIX = "template:"
type PasteMode = "fixed" | "template"
type PasteLine = { line: number; text: string }
const INSERTION_GROUPS = [
  { key: "insertGroupSingle", items: [
    { key: "insertDigit", text: String.raw`\d`, caretBack: 0 },
    { key: "insertLower", text: String.raw`\l`, caretBack: 0 },
    { key: "insertUpper", text: String.raw`\u`, caretBack: 0 },
  ] },
  { key: "insertGroupCombinations", items: [
    { key: "insertDigitsLower", text: String.raw`[\d\l]`, caretBack: 0 },
    { key: "insertDigitsUpper", text: String.raw`[\d\u]`, caretBack: 0 },
    { key: "insertAllLetters", text: String.raw`[\l\u]`, caretBack: 0 },
    { key: "insertAlphanumeric", text: String.raw`[\d\l\u]`, caretBack: 0 },
  ] },
  { key: "insertGroupExceptions", items: [
    { key: "insertDigitsExcept", text: String.raw`[\d^]`, caretBack: 1 },
    { key: "insertLowerExcept", text: String.raw`[\l^]`, caretBack: 1 },
    { key: "insertUpperExcept", text: String.raw`[\u^]`, caretBack: 1 },
    { key: "insertAllLettersExcept", text: String.raw`[\l\u^]`, caretBack: 1 },
  ] },
  { key: "insertGroupExamples", items: [
    { key: "insertSet", text: "[]", caretBack: 1 },
    { key: "insertTwoLetters", text: "[ab]", caretBack: 0 },
    { key: "insertRangeAndLetter", text: "[A-Ce]", caretBack: 0 },
  ] },
] as const

/** Candidate editor. The explicit mode switch never exposes the storage marker. */
// The same explanation is already shown as help text below the field, so the hint is for the mouse only.
function FlagModeLabel({ hint, children }: { hint?: string; children: string }) {
  const label = <span className="exercise-flag-mode flex w-28 items-center bg-primary px-2 text-sm font-medium text-primary-foreground">{children}</span>
  return hint ? <HoverTooltip text={hint} className="h-full">{label}</HoverTooltip> : label
}

export function FlagInput({
  value, onChange, disabled, errors = [], linkedDeviceID, hasLinkableDevice = false,
  policy = null, policyError = null, onRetryPolicy, namePrefix,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  errors?: (string | undefined)[]
  linkedDeviceID?: string
  hasLinkableDevice?: boolean
  policy?: FlagPolicy | null
  policyError?: { cause: unknown } | null
  onRetryPolicy?: () => void
  namePrefix?: string
}) {
  // The task form always supplies this prop. Undefined keeps compatibility
  // with older standalone component consumers.
  const dynamic = linkedDeviceID === undefined || Boolean(linkedDeviceID)
  const [touched, setTouched] = useState<Set<number>>(new Set())
  const [openInsertIndex, setOpenInsertIndex] = useState<number | null>(null)
  const [pendingPaste, setPendingPaste] = useState<{ index: number; lines: PasteLine[] } | null>(null)
  const [pasteMode, setPasteMode] = useState<PasteMode>("fixed")
  const inputRefs = useRef(new Map<number, HTMLInputElement>())
  const cursorRanges = useRef(new Map<number, [number, number]>())
  const inspected: { info: ParsedFlagCandidate | null; issueKey: ReturnType<typeof flagCandidateErrorKey> | null }[] = value.map((candidate) => {
    try { return { info: parseFlagCandidate(candidate), issueKey: null } }
    catch (error) { return { info: null, issueKey: flagCandidateErrorKey(error) } }
  })
  const parsed = inspected.map(({ info }) => info)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  value.forEach((candidate) => {
    if (seen.has(candidate)) duplicates.add(candidate)
    seen.add(candidate)
  })
  const semanticsKey = !dynamic ? hasLinkableDevice ? "admin.exTask.flag.unlinkedTypeHelp" : "admin.exTask.flag.staticTypeHelp" : value.length === 0 ? "admin.exTask.flag.semantics0"
    : value.length > 1 ? "admin.exTask.flag.semanticsN" : "admin.exTask.flag.semantics1"
  const update = (index: number, candidate: string) => onChange(value.map((v, i) => i === index ? candidate : v))
  const addFlag = () => {
    const index = value.length
    onChange([...value, "ICE{}"])
    requestAnimationFrame(() => {
      const input = inputRefs.current.get(index)
      input?.focus()
      input?.setSelectionRange(4, 4)
    })
  }
  const pasteResults = (() => {
    if (!pendingPaste) return []
    const seen = new Set(value.filter((_, index) => index !== pendingPaste.index))
    return pendingPaste.lines.map((line) => {
      const candidate = pasteMode === "template" ? TEMPLATE_PREFIX + line.text : line.text
      let reason = ""
      try { parseFlagCandidate(candidate) } catch (error) { reason = t(flagCandidateErrorKey(error)) }
      if (seen.has(candidate)) reason = t("admin.ex.val.flagDuplicate")
      seen.add(candidate)
      return { ...line, candidate, reason }
    })
  })()
  const validPaste = pasteResults.filter((line) => !line.reason)
  const invalidPaste = pasteResults.filter((line) => line.reason)
  const pasteAllowed = validPaste.length > 0 && (dynamic || (pasteMode === "fixed" && validPaste.length === 1))
  const confirmPaste = () => {
    if (!pendingPaste || !pasteAllowed) return
    const index = pendingPaste.index
    onChange([...value.slice(0, index), ...validPaste.map((line) => line.candidate), ...value.slice(index + 1)])
    setTouched(new Set())
    setPendingPaste(null)
  }
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData("text/plain")
    const lines = text.split(/\r\n|\r|\n/).map((part, line) => ({ line: line + 1, text: part.trim() })).filter((part) => part.text)
    if (lines.length < 2) return
    event.preventDefault()
    setPasteMode("fixed")
    setPendingPaste({ index, lines })
  }
  const rememberCursor = (index: number) => {
    const input = inputRefs.current.get(index)
    if (input) cursorRanges.current.set(index, [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length])
  }
  const insertAtCursor = (index: number, fragment: string, caretBack: number) => {
    const visible = value[index].slice(TEMPLATE_PREFIX.length)
    const [start, end] = cursorRanges.current.get(index) ?? [visible.length, visible.length]
    const next = visible.slice(0, start) + fragment + visible.slice(end)
    const caret = start + fragment.length - caretBack
    setTouched((current) => { const nextTouched = new Set(current); nextTouched.delete(index); return nextTouched })
    update(index, TEMPLATE_PREFIX + next)
    setOpenInsertIndex(null)
    requestAnimationFrame(() => {
      const input = inputRefs.current.get(index)
      input?.focus()
      input?.setSelectionRange(caret, caret)
      cursorRanges.current.set(index, [caret, caret])
    })
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admin.exTask.flag.title")}<FlagHelp />
          </span>
          {semanticsKey && <span className="text-xs text-muted-foreground">{t(semanticsKey)}</span>}
        </div>
        {!disabled && (dynamic || value.length === 0) && <div data-testid="flag-add-actions" className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {dynamic && <HoverTooltip text={t("admin.exTask.flag.pasteHintHelp")}>
            <span tabIndex={0} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <ClipboardPaste aria-hidden="true" className="h-3.5 w-3.5" />{t("admin.exTask.flag.pasteHint")}
            </span>
          </HoverTooltip>}
          <Button type="button" variant="outline" size="sm" onClick={addFlag}>
            <Plus className="mr-1 h-4 w-4" />{t("admin.exTask.flag.add")}
          </Button>
        </div>}
      </div>
      <div>
      {value.map((candidate, index) => {
        const template = candidate.startsWith(TEMPLATE_PREFIX)
        const visible = template ? candidate.slice(TEMPLATE_PREFIX.length) : candidate
        const info = parsed[index]
        const overlap = info?.kind === "fixed" && parsed.some((other) => other?.kind === "template" && flagTemplateCanProduce(other, candidate))
        const issue = errors[index] || (touched.has(index) && ((duplicates.has(candidate) ? t("admin.ex.val.flagDuplicate") : undefined)
          || (candidate !== "" && !info ? t(inspected[index].issueKey ?? "admin.ex.val.flagFormat") : undefined)))
        const warnings = [
          info && template && policy && info.entropyBits < policy.WarningBits ? t("admin.exTask.flag.weak") : null,
          overlap ? t("admin.exTask.flag.overlap") : null,
        ].filter((warning): warning is string => Boolean(warning))
        return <div key={index} data-testid="flag-candidate-row" className="group grid min-w-0 gap-x-2 py-1" style={{ gridTemplateColumns: "1.5rem minmax(0, 1fr)" }}>
          <span className="pt-2 text-sm font-medium tabular-nums text-muted-foreground">{index + 1}.</span>
          <div className="min-w-0">
          <div data-testid="flag-candidate-main" className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1">
          <div className="min-w-0 max-w-[48rem] flex-[1_1_35rem]">
          <div data-testid="flag-candidate-control" className="flex h-10 min-w-0 w-full items-center overflow-hidden rounded-md border border-border bg-card pr-0.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <div className="h-full shrink-0">
              {!disabled && (dynamic || template) ? <SelectMenu value={template ? "template" : "fixed"}
                ariaLabel={`${t("admin.exTask.flag.mode")} ${index + 1}`}
                compactChevron triggerVariant="default"
                onChange={(mode) => update(index, mode === "template" ? TEMPLATE_PREFIX + visible : visible)}
                options={[{ value: "fixed", label: t("admin.exTask.flag.modeFixed") }, { value: "template", label: t("admin.exTask.flag.modeTemplate") }]}
                className="exercise-flag-mode w-28 border-0 px-2 text-sm font-medium shadow-none focus-visible:ring-0" />
                : <FlagModeLabel hint={!dynamic ? t(semanticsKey) : undefined}>{t(template ? "admin.exTask.flag.modeTemplate" : "admin.exTask.flag.modeFixed")}</FlagModeLabel>}
            </div>
            <Input name={namePrefix ? `${namePrefix}.${index}` : undefined} value={visible} placeholder={template ? String.raw`ICE{room-\d}` : "ICE{...}"}
              ref={(node) => { if (node) inputRefs.current.set(index, node); else inputRefs.current.delete(index) }}
              className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm font-normal placeholder:text-sm focus-visible:border-0 focus-visible:ring-0"
              disabled={disabled} aria-label={`${t("admin.exTask.flag.title")} ${index + 1}`}
              aria-invalid={Boolean(issue)} onBlur={() => setTouched((current) => new Set(current).add(index))}
              onPaste={(event) => handlePaste(event, index)}
              onSelect={() => rememberCursor(index)} onKeyUp={() => rememberCursor(index)} onClick={() => rememberCursor(index)}
              onChange={(event) => update(index, (template ? TEMPLATE_PREFIX : "") + event.target.value)} />
            {!disabled && template && <DropdownMenu open={openInsertIndex === index} onOpenChange={(open) => setOpenInsertIndex(open ? index : null)}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("admin.exTask.flag.insert")}
                  onPointerDown={() => rememberCursor(index)}
                  className="h-8 w-8 shrink-0 opacity-0 pointer-events-none transition-opacity group-focus-within:opacity-100 group-focus-within:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto">
                  <Braces aria-hidden="true" className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 min-w-[20rem] max-w-[calc(100vw-2rem)] overflow-y-auto">
                {INSERTION_GROUPS.map((group, groupIndex) => <div key={group.key}>
                  {groupIndex > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`admin.exTask.flag.${group.key}`)}</DropdownMenuLabel>
                  {group.items.map((item) => <DropdownMenuItem key={item.key} onSelect={() => insertAtCursor(index, item.text, item.caretBack)}>
                    {t(`admin.exTask.flag.${item.key}`)} <code className="ml-auto pl-4 text-xs text-muted-foreground">{item.text}</code>
                  </DropdownMenuItem>)}
                </div>)}
              </DropdownMenuContent>
            </DropdownMenu>}
            {!disabled && <RemoveAction ariaLabel={t("admin.exTask.flag.remove")} onClick={() => { setTouched(new Set()); onChange(value.filter((_, i) => i !== index)) }}
              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />}
          </div>
          <p role={issue ? "alert" : warnings.length ? "status" : undefined} className="min-h-5 pt-1 text-xs leading-4">
            {issue && <span className="text-destructive">{warnings.length ? issue.replace(/[.!?…]\s*$/, "") : issue}</span>}
            {issue && warnings.length > 0 && <span className="text-destructive">. </span>}
            {warnings.map((warning, warningIndex) => <span key={warningIndex} className="text-amber-700">{warningIndex > 0 ? " " : ""}{warning}</span>)}
          </p>
          </div>
          {info && template && <div data-testid="flag-candidate-meta" className="flex min-h-10 min-w-0 flex-[1_1_16rem] flex-col justify-center text-xs leading-5">
          <p className="break-words text-muted-foreground">
            {t("admin.exTask.flag.example")}: <code>{info.example}</code> · {t("admin.exTask.flag.options")}: {info.cardinality.toLocaleString("uk-UA")} · {info.entropyBits.toFixed(1)} {t("admin.exTask.flag.bits")}
          </p>
          </div>}
          </div>
          </div>
        </div>
      })}
      </div>
      {!dynamic && (value.length > 1 || value.some((candidate) => candidate.startsWith(TEMPLATE_PREFIX))) &&
        <p role="alert" className="text-xs text-destructive">{t("admin.exTask.flag.staticCount")}</p>}
      {dynamic && value.length === 0 && (policy
        ? <p className="text-xs text-muted-foreground">{t("admin.exTask.flag.randomExample")}: <code>{`ICE{${"0".repeat(policy.RandomHexLength)}}`}</code> · {policy.RandomBits} {t("admin.exTask.flag.bits")}</p>
        : policyError
          ? <LoadError compact message={t("admin.exTask.flag.policyUnavailable")} error={policyError.cause} onRetry={onRetryPolicy} />
          : <LoadingArea compact className="h-24" label={t("admin.exTask.flag.policyLoading")} />)}
      <Dialog open={pendingPaste !== null} onOpenChange={(open) => { if (!open) setPendingPaste(null) }}>
        <DialogContent className="max-h-[min(90dvh,38rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.exTask.flag.pasteTitle")}</DialogTitle>
            <DialogDescription>{t("admin.exTask.flag.pasteDescription")} {pendingPaste && `${t("admin.exTask.flag.pasteTarget")} ${pendingPaste.index + 1}.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="block text-sm font-medium">{t("admin.exTask.flag.pasteMode")}</span>
              <SelectMenu ariaLabel={t("admin.exTask.flag.pasteMode")} value={pasteMode} onChange={(mode) => setPasteMode(mode as PasteMode)} disabled={!dynamic}
                options={[{ value: "fixed", label: t("admin.exTask.flag.modeFixed") }, ...(dynamic ? [{ value: "template", label: t("admin.exTask.flag.modeTemplate") }] : [])]} className="w-full" />
            </div>
            {pendingPaste && <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t("admin.exTask.flag.pasteCount")} {pendingPaste.lines.length}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>{t("admin.exTask.flag.pasteValid")} {validPaste.length}</span>
                <span className={invalidPaste.length ? "text-destructive" : "text-muted-foreground"}>{t("admin.exTask.flag.pasteInvalid")} {invalidPaste.length}</span>
              </div>
              {invalidPaste.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs" aria-label={t("admin.exTask.flag.pasteInvalid")}>
                {invalidPaste.map((line) => <li key={line.line} className="break-all text-destructive">{line.line}. {line.text} <span className="text-muted-foreground">— {line.reason}</span></li>)}
              </ul>}
              {!dynamic && validPaste.length > 1 && <p className="text-xs text-destructive">{t("admin.exTask.flag.pasteStaticLimit")}</p>}
            </div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingPaste(null)}>{t("admin.exTask.flag.pasteCancel")}</Button>
            <Button type="button" disabled={!pasteAllowed} onClick={confirmPaste}>{t(invalidPaste.length ? "admin.exTask.flag.pasteValidOnly" : "admin.exTask.flag.pasteConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
