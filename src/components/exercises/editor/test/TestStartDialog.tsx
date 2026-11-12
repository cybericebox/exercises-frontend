"use client"

import { useCallback, useEffect, useState } from "react"

import { getTestRunLengths, type TestRunLengths } from "@/api/exercises/deploy"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadError } from "@/components/ui/load-error"
import { SelectMenu } from "@/components/ui/select-menu"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { durationLabel } from "@/lib/durations"
import type { TestVariantOption } from "../../ExerciseHeader"

export type TestStartDialogProps = {
  /** The variants with the reason when one cannot be started. */
  variants: TestVariantOption[]
  busy: boolean
  /** Starts the test of a variant for a length in minutes; the page checks the draft first. */
  onStart: (variantIndex: number, leaseMinutes?: number) => void
  onClose: () => void
}

/** The length offered first: the server's default when it is one of the choices, else 1 h, else the shortest. */
export function initialLength(lengths: TestRunLengths): number {
  const allowed = lengths.AllowedMinutes
  if (allowed.includes(lengths.DefaultMinutes)) return lengths.DefaultMinutes
  if (allowed.includes(60)) return 60
  return allowed[0] ?? lengths.DefaultMinutes
}

type Lengths = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; lengths: TestRunLengths }

/**
 * The start of a test lab: the variant (one of many: the dot mark) and how long the lab lives. «Тестувати» opens this only
 * when no lab of the exercise is running; a running one opens its test view directly.
 */
export function TestStartDialog({ variants, busy, onStart, onClose }: TestStartDialogProps) {
  const firstFree = variants.find((variant) => !variant.disabled)?.index ?? variants[0]?.index ?? 0
  const [variant, setVariant] = useState(firstFree)
  const [minutes, setMinutes] = useState(0)
  const [attempt, setAttempt] = useState(0)
  // The answer belongs to the attempt that asked: a new attempt reads as loading until its own answer arrives.
  const [answer, setAnswer] = useState<{ attempt: number; load: Lengths } | null>(null)
  const load: Lengths = answer?.attempt === attempt ? answer.load : { state: "loading" }

  useEffect(() => {
    let cancelled = false
    getTestRunLengths().then(
      (lengths) => { if (cancelled) return; setMinutes(initialLength(lengths)); setAnswer({ attempt, load: { state: "ready", lengths } }) },
      (cause) => { if (!cancelled) setAnswer({ attempt, load: { state: "error", cause } }) },
    )
    return () => { cancelled = true }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const chosen = variants.find((entry) => entry.index === variant)
  // Without a list of lengths the server's default applies, so a failed read never blocks the start.
  const lengths = load.state === "ready" ? load.lengths : null
  const canStart = !busy && load.state !== "loading" && Boolean(chosen) && !chosen?.disabled
  const title = t("ed.d.start.title")

  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose() }}>
    <DialogContent className="max-w-md" aria-describedby="test-start-description">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription id="test-start-description" className="sr-only">{t("ed.d.start.description")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <FieldLabel text={t("ed.d.start.variant")} required htmlFor="test-start-variant"
            help={{ intro: t("ed.d.start.variantHelp"), default: t("ed.d.start.variantHelpNote") }} />
          <SelectMenu id="test-start-variant" value={String(variant)} disabled={busy} onChange={(next) => setVariant(Number(next))}
            options={variants.map((entry) => ({ value: String(entry.index), label: entry.label, disabled: entry.disabled, description: entry.disabled ? entry.reason : undefined }))} />
          {chosen?.disabled && chosen.reason && <p role="status" className="text-xs text-muted-foreground">{chosen.reason}</p>}
        </div>
        {load.state === "loading" && <LoadingArea compact className="min-h-[4.5rem]" label={t("admin.loading")} />}
        {load.state === "error" && <LoadError compact message={t("ed.d.start.lengthsFailed")} help={t("ed.d.start.lengthsFailedHelp")} error={load.cause} onRetry={retry} />}
        {lengths && lengths.AllowedMinutes.length > 0 && <div className="grid gap-1.5">
          <FieldLabel text={t("ed.d.start.length")} required htmlFor="test-start-length"
            help={{ intro: t("ed.d.start.lengthHelp"), default: t("ed.d.start.lengthHelpNote") }} />
          <SelectMenu id="test-start-length" value={String(minutes)} disabled={busy} onChange={(next) => setMinutes(Number(next))}
            options={lengths.AllowedMinutes.map((m) => ({ value: String(m), label: durationLabel(m) }))} />
        </div>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("ed.d.cancel")}</Button>
        <Button type="button" disabled={!canStart} busy={busy} busyLabel={t("ed.d.start.busy")}
          onClick={() => onStart(variant, lengths && minutes > 0 ? minutes : undefined)}>{t("ed.d.start.go")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
