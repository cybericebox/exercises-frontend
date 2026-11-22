"use client"

import type { ReactNode } from "react"
import { Clock, Lock } from "lucide-react"

import type { NormalizedTask } from "@/api/exercises/versions"
import { AttachmentDownload } from "@/components/exercises/AttachmentDownload"
import { TaskRichTextView, richTextHasBlocks } from "@/components/exercises/TaskRichTextView"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { hintTextHasContent, hintTextToState } from "@/lib/hintText"
import type { TaskValues, ExternalTarget } from "@/lib/placeholderResolve"
import type { StateTaskView } from "@/lib/testLab"
import { AnswerCheck } from "./AnswerCheck"
import { HintList } from "./Hints"
import { StateCheck } from "./StateCheck"

/** Which way the task is checked, as the participant words it. */
export function taskKindKey(task: NormalizedTask): "flag" | "text" | "state" | "none" {
  if (task.Check.State) return "state"
  if (task.Check.Answer) return task.Check.Answer.Type === "flag" ? "flag" : "text"
  return "none"
}

const HEADING = "text-xs font-medium uppercase tracking-wider text-muted-foreground"

/**
 * One task exactly as a participant sees it in this lab: title, difficulty and kind of check, the description with this
 * lab's values, files, the check, hints and the steps around it. Nothing the participant must not see is here: the author's
 * data (what is observed, raw output, where an answer is placed) lives in the lab panel.
 */
export function ParticipantTask({ task, number, locked, values, labReady, waitingForLab, deployId, randomFlag, solvedAt, stateView, openingKey, onOpenExternal, onSolved, revealed, onReveal, onGoTo, prev, next }: {
  task: NormalizedTask
  number: number
  /** The tasks this one waits for (unsolved prerequisites); empty when it is open. */
  locked: { key: string; name: string }[]
  values: TaskValues
  /** The check can be used (the lab is ready, or there is no lab). */
  labReady: boolean
  /** The lab is on its way: the check stands by. */
  waitingForLab: boolean
  deployId: string | null
  randomFlag: boolean
  /** null: open; true: solved, moment unknown. */
  solvedAt: number | null | true
  stateView: StateTaskView | null
  openingKey: string | null
  onOpenExternal: (target: ExternalTarget, destination?: string) => void
  onSolved: (taskId: string) => void
  revealed: ReadonlySet<string>
  onReveal: (id: string) => void
  onGoTo: (key: string) => void
  prev?: { label: string; select: () => void }
  next?: { label: string; select: () => void }
}) {
  const kind = taskKindKey(task)
  const view = (value: unknown): ReactNode => <TaskRichTextView value={value} variables={values.variables} links={values.links}
    external={values.external} openingKey={openingKey} onOpenExternal={(target, _key, destination) => onOpenExternal(target, destination)} />
  const hints = task.Hints.map((hint, index) => ({ hint, index })).filter(({ hint }) => hintTextHasContent(hint.Text))
  const scoped = new Set([...revealed].filter((id) => id.startsWith(`${task.ID}:`)).map((id) => id.slice(task.ID.length + 1)))

  const head = <header className="flex flex-wrap items-center gap-2.5">
    <span aria-hidden="true" className="flex h-8 min-w-8 items-center justify-center rounded-md bg-secondary/60 px-1 text-sm font-semibold text-foreground">{number}</span>
    <h2 className="text-2xl font-semibold leading-8 text-foreground">{task.Name}</h2>
    <Badge tone="muted">{t(`admin.ex.difficulty.${task.Difficulty}`)}</Badge>
    {kind !== "none" && <Badge tone="muted">{t(`ed.d.kind.${kind}`)}</Badge>}
  </header>
  const steps = (prev || next) && <nav aria-label={t("ed.d.task.steps")} className="flex items-center justify-between gap-3 border-t border-border pt-4">
    {prev ? <Button type="button" variant="outline" onClick={prev.select}>{prev.label}</Button> : <span />}
    {next ? <Button type="button" variant="outline" onClick={next.select}>{next.label}</Button> : <span />}
  </nav>

  if (locked.length > 0) {
    return <article className="min-w-0 max-w-[820px] space-y-6">
      {head}
      <div role="status" className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
        <Lock aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span>{t("ed.d.task.locked", { names: locked.map((entry) => `«${entry.name}»`).join(", ") })}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {locked.map((entry) => <Button key={entry.key} type="button" variant="outline" size="sm" onClick={() => onGoTo(entry.key)}>{t("ed.d.task.goTo", { name: entry.name })}</Button>)}
      </div>
      {steps}
    </article>
  }

  return <article className="min-w-0 max-w-[820px] space-y-6">
    {head}
    <div className="[overflow-wrap:anywhere]">{richTextHasBlocks(task.Description) ? view(task.Description) : <p className="text-sm text-muted-foreground">{t("ed.d.task.noDescription")}</p>}</div>

    {task.Attachments.length > 0 && <section>
      <h3 className={HEADING}>{t("ed.d.task.files")}</h3>
      <ul className="mt-2 space-y-1.5">{task.Attachments.map((file) => <li key={file.FileID}><AttachmentDownload file={file} /></li>)}</ul>
    </section>}

    {kind !== "none" && (waitingForLab || !labReady || !deployId
      ? <section className="rounded-lg border border-dashed border-border p-4" aria-label={t(kind === "state" ? "ed.d.state.title" : "ed.d.answer.title")}>
        <h3 className={HEADING}>{t(kind === "state" ? "ed.d.state.title" : "ed.d.answer.title")}</h3>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock aria-hidden="true" size={16} className="shrink-0" />{t("ed.d.check.wait")}</p>
      </section>
      : kind === "state" && stateView
        ? <StateCheck deployId={deployId} task={task} view={stateView} />
        : task.Check.Answer && <AnswerCheck key={task.ID} deployId={deployId} taskId={task.ID} taskName={task.Name} answer={task.Check.Answer}
          solvedAt={solvedAt} randomFlag={randomFlag} onResult={(correct) => { if (correct) onSolved(task.ID) }} />)}

    {hints.length > 0 && <HintList hints={hints} revealed={scoped} onReveal={(id) => onReveal(`${task.ID}:${id}`)} render={(text) => view(hintTextToState(text))} />}

    {steps}
  </article>
}
