"use client"

import { useId, useRef, useState } from "react"

import { checkDeployFlag } from "@/api/exercises/deploy"
import type { AnswerCheckDTO } from "@/api/exercises/model"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { t } from "@/i18n/t"
import { clockTime } from "@/lib/testLab"

type CheckState = { kind: "idle" } | { kind: "correct"; at: number } | { kind: "wrong"; at: number } | { kind: "error" }

/**
 * The answer of a flag or text task, as a participant gives it. The author types what they found and the server says whether
 * it is the value pinned for this lab (`checkDeployFlag`); the pinned value itself never comes back.
 */
export function AnswerCheck({ deployId, taskId, taskName, answer, solvedAt, randomFlag, onResult }: {
  deployId: string
  taskId: string
  taskName: string
  answer: AnswerCheckDTO
  /** The task is already solved (kept with the deploy): the moment, or true when the moment is unknown; null when open. */
  solvedAt: number | null | true
  /** A static test whose task has no fixed value: the flag is random, so it cannot be solved. */
  randomFlag: boolean
  onResult: (correct: boolean) => void
}) {
  const errorId = useId()
  const inputId = useId()
  const [value, setValue] = useState("")
  const [state, setState] = useState<CheckState>({ kind: "idle" })
  const [checking, setChecking] = useState(false)
  const pending = useRef(false)
  const revision = useRef(0)
  const flag = answer.Type === "flag"
  const solved = solvedAt !== null || state.kind === "correct"
  const at = state.kind === "correct" ? state.at : typeof solvedAt === "number" ? solvedAt : null

  function check() {
    if (!value || pending.current) return
    pending.current = true
    setChecking(true)
    const mine = revision.current
    checkDeployFlag(deployId, taskId, value).then(
      (result) => {
        if (revision.current === mine) setState(result.Correct ? { kind: "correct", at: Date.now() } : { kind: "wrong", at: Date.now() })
        onResult(result.Correct)
      },
      () => { if (revision.current === mine) setState({ kind: "error" }) },
    ).finally(() => { pending.current = false; setChecking(false) })
  }

  const help = {
    intro: t(flag ? "ed.d.answer.helpFlag" : "ed.d.answer.helpText"),
    ...(flag ? {} : { default: t(answer.IgnoreCase ? "ed.d.answer.helpIgnoreCase" : "ed.d.answer.helpCase") }),
  }
  return <section className="rounded-lg border border-border p-4" aria-label={t("ed.d.answer.title")}>
    <FieldLabel text={t("ed.d.answer.title")} htmlFor={inputId} help={help} />
    {randomFlag && <p role="note" className="mt-1 text-sm text-muted-foreground">{t("ed.d.answer.random")}</p>}
    {solved
      ? <p role="status" className="mt-2 flex items-center gap-2 text-sm text-[var(--ib-ok)]">
        {t(flag ? "ed.d.answer.foundFlag" : "ed.d.answer.foundText")}{at !== null && <> · <span className="tabular-nums">{clockTime(at)}</span></>}
      </p>
      : <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Input id={inputId} value={value} autoComplete="off" spellCheck={false} className={flag ? "font-mono" : undefined}
            aria-invalid={state.kind === "wrong"} aria-describedby={state.kind === "wrong" || state.kind === "error" ? errorId : undefined}
            placeholder={answer.InputHint || t(flag ? "ed.d.answer.placeholderFlag" : "ed.d.answer.placeholderText")}
            onChange={(event) => { revision.current++; setValue(event.target.value); setState({ kind: "idle" }) }}
            onKeyDown={(event) => { if (event.key === "Enter") check() }} />
          {/* The line is always laid out, so a result never moves the block. */}
          <p id={errorId} role={state.kind === "idle" ? undefined : "alert"} className="mt-1 min-h-4 text-xs text-destructive">
            {state.kind === "wrong" && <>{t(flag ? "ed.d.answer.wrongFlag" : "ed.d.answer.wrongText")} · <span className="tabular-nums">{clockTime(state.at)}</span></>}
            {state.kind === "error" && t("ed.d.answer.failed")}
          </p>
        </div>
        <Button type="button" busy={checking} busyLabel={t("ed.d.answer.checking")} disabled={!value}
          aria-label={t("ed.d.answer.checkNamed", { name: taskName })} onClick={check}>{t("ed.d.answer.check")}</Button>
      </div>}
  </section>
}
