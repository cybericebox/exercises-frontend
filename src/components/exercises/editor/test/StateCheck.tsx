"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

import { runDeployChecks } from "@/api/exercises/deploy"
import { ApiError } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { clockTime, durationSeconds, type StateTaskView } from "@/lib/testLab"
import type { NormalizedTask } from "@/api/exercises/versions"

/** «30 с», «5 хв», «2 год»: an interval as the participant reads it. */
export function intervalText(seconds: number): string {
  if (seconds % 3600 === 0) return t("ed.d.unit.hours", { n: seconds / 3600 })
  if (seconds % 60 === 0) return t("ed.d.unit.minutes", { n: seconds / 60 })
  return t("ed.d.unit.seconds", { n: seconds })
}

/**
 * The check of a task that the laboratory makes by itself. The participant sees only the verdict, when it was reached and
 * «Перевірити зараз» (when the task allows it, at most 3 a minute: the next ask answers 429 and the button waits). The
 * definition of the check, what it observed and the laboratory's own words stay in the author's panel.
 */
export function StateCheck({ deployId, task, view }: { deployId: string; task: NormalizedTask; view: StateTaskView }) {
  const state = task.Check.State
  const [busy, setBusy] = useState(false)
  // The verdict the ask was made under: a new verdict answers it.
  const [askedUnder, setAskedUnder] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const cooling = until > now
  useEffect(() => {
    if (until <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [until])
  const verdictKey = `${view.status}|${view.checks.map((check) => check.changedAt ?? "").join(",")}`
  const asked = askedUnder === verdictKey

  const solved = view.status === "solved"
  const manual = Boolean(state?.Manual) && !(solved && state?.Mode !== "continuous")
  const every = durationSeconds(state?.Interval)
  const left = Math.max(1, Math.ceil((until - now) / 1000))

  async function ask() {
    setBusy(true)
    setError("")
    setAskedUnder(null)
    try {
      await runDeployChecks(deployId, task.ID)
      setAskedUnder(verdictKey)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setUntil(Date.now() + Math.max(1, cause.retryAfterSeconds ?? 20) * 1000)
        setNow(Date.now())
      } else setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const badge = solved ? <Badge tone="ok">{t("ed.d.state.solved")}</Badge>
    : view.status === "notSolved" ? <Badge tone="muted">{t("ed.d.state.notSolved")}</Badge>
      : <Badge tone="muted">{t("ed.d.state.unknown")}</Badge>
  const disabledTip = cooling && !solved ? t("ed.d.state.tooOften") : undefined
  const button = <Button type="button" variant="outline" busy={busy} busyLabel={t("ed.d.state.asking")} disabled={cooling && !solved} onClick={() => void ask()}>
    <RefreshCw aria-hidden="true" size={16} className="mr-1.5" />{t("ed.d.state.now")}
  </Button>
  return <section className="rounded-lg border border-border p-4" aria-label={t("ed.d.state.title")}>
    <FieldLabel as="span" text={t("ed.d.state.title")} help={{
      intro: [t("ed.d.state.helpIntro"), t("ed.d.state.helpDo")],
      ...(every ? { items: [{ term: t("ed.d.state.auto"), text: t("ed.d.state.autoEvery", { time: intervalText(every) }) }] } : {}),
    }} />
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span data-state-verdict={view.status}>{badge}</span>
      {solved && view.solvedAt && <span className="text-sm text-muted-foreground">{t("ed.d.state.solvedAt", { time: clockTime(view.solvedAt) })}</span>}
      {!solved && state?.Mode === "continuous" && view.firstSolvedAt && <span className="text-sm text-muted-foreground">{t("ed.d.state.wasSolvedAt", { time: clockTime(view.firstSolvedAt) })}</span>}
      <span className="grow" />
      {manual && (disabledTip ? <HoverTooltip text={disabledTip}><span>{button}</span></HoverTooltip> : button)}
    </div>
    {!solved && view.blockedBy.length > 0 && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("ed.d.state.deviceNotReady", { device: view.blockedBy[0] })}</p>}
    {/* One line for the ask, its refusal and its failure; always laid out, so nothing under it moves. */}
    <p role={error || cooling ? "alert" : "status"} className={error || cooling ? "mt-2 min-h-4 text-xs text-destructive" : "mt-2 min-h-4 text-xs text-muted-foreground"}>
      {error ? error : cooling ? t("ed.d.state.waitSeconds", { n: left }) : asked ? t("ed.d.state.asked") : ""}
    </p>
    {!solved && every && <p className="text-xs text-muted-foreground">{t("ed.d.state.autoLine", { time: intervalText(every) })}</p>}
  </section>
}
