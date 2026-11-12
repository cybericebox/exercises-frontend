"use client"

import { useState } from "react"
import { ChevronRight, TriangleAlert } from "lucide-react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedDevice, NormalizedTask } from "@/api/exercises/versions"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { t } from "@/i18n/t"
import { clockTime, deliveredTo, deviceStage, isDeviceFailed, stateTaskView, type StateCheckView } from "@/lib/testLab"
import { cn } from "@/utils/cn"
import { taskKindKey } from "./ParticipantTask"

function Verdict({ check }: { check: StateCheckView }) {
  if (!check.known) return <Badge tone="muted">{t("ed.d.author.notChecked")}</Badge>
  return check.passed ? <Badge tone="ok">{t("ed.d.state.solved")}</Badge> : <Badge tone="muted">{t("ed.d.state.notSolved")}</Badge>
}

/** One state check of a task: the device, the verdict, and the conditions it carries, each named by the kind it observes. */
function CheckBlock({ check }: { check: StateCheckView }) {
  return <div className="space-y-1.5 border-b border-border py-2 last:border-b-0" data-check={check.id}>
    <div className="flex flex-wrap items-center gap-2">
      <code className="font-mono text-xs text-foreground">{t("ed.d.author.onDevice", { device: check.device || "—" })}</code>
      <Verdict check={check} />
      <span className="grow" />
      {check.changedAt && <span className="text-xs text-muted-foreground">{t("ed.d.author.changedAt", { time: clockTime(check.changedAt) })}</span>}
    </div>
    <ol className="m-0 list-none space-y-0.5 p-0 text-sm">
      {check.conditions.map((condition, index) => <li key={index} className="flex min-w-0 gap-2">
        <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
        <span className="min-w-0 break-words"><span className="font-medium text-foreground">{t(`ed.d.cond.${condition.kind}`)}</span>{condition.subject && <> <code className="font-mono text-xs text-muted-foreground">{condition.subject}</code></>}</span>
      </li>)}
    </ol>
    {check.detail && <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/40 p-2 font-mono text-xs text-foreground">{check.detail}</pre>}
  </div>
}

function TaskSection({ task, number, open, onToggle, status, devices, solved }: {
  task: NormalizedTask
  number: number
  open: boolean
  onToggle: () => void
  status: DeployStatus | null
  devices: readonly NormalizedDevice[]
  solved: boolean
}) {
  const kind = taskKindKey(task)
  let body: React.ReactNode = null
  if (kind === "state") {
    const view = stateTaskView(task, status?.StateTasks?.find((entry) => entry.TaskID === task.ID), devices, status)
    body = <>
      {view.checks.length > 0 ? view.checks.map((check) => <CheckBlock key={check.id} check={check} />) : <p className="text-sm text-muted-foreground">{t("ed.d.author.noConditions")}</p>}
      <p className="pt-2 text-xs text-muted-foreground">{t(task.Check.State?.Mode === "continuous" ? "ed.d.author.modeContinuous" : "ed.d.author.modeOnce")}</p>
    </>
  } else if (kind !== "none") {
    const on = deliveredTo(task.Key, devices)
    const dead = on.filter((name) => isDeviceFailed(deviceStage(status?.Devices?.find((device) => device.Name === name), status?.Phase)))
    body = <>
      <p className="text-sm text-muted-foreground">{on.length > 0 ? t("ed.d.author.deliveredTo", { devices: on.join(", ") }) : t("ed.d.author.notDelivered")}</p>
      <p className="pt-1 text-xs text-muted-foreground">{t("ed.d.author.valueHidden")}</p>
      {dead.length > 0 && <p role="alert" className="mt-2 flex items-start gap-2 text-sm"><TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-[var(--ib-warn)]" />{t("ed.d.author.deviceDown", { device: dead[0] })}</p>}
    </>
  }
  return <section className="border-b border-border last:border-b-0">
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-2 py-2.5 text-left text-sm hover:bg-[var(--ib-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
      <ChevronRight aria-hidden="true" size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      <span className="min-w-0 flex-1 truncate"><span className="mr-2 tabular-nums text-muted-foreground">{number}</span>{task.Name}</span>
      {solved && <Badge tone="ok">{t("ed.d.state.solved")}</Badge>}
    </button>
    {open && <div className="pb-3 pl-6">{body ?? <p className="text-sm text-muted-foreground">{t("ed.d.author.noCheck")}</p>}</div>}
  </section>
}

/** «Для автора»: what only the author sees about each task: where its answer is placed, and every state check with its conditions. */
export function AuthorTab({ tasks, currentId, status, devices, solvedIds }: {
  tasks: NormalizedTask[]
  currentId: string | null
  status: DeployStatus | null
  devices: readonly NormalizedDevice[]
  solvedIds: ReadonlySet<string>
}) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  if (tasks.length === 0) return <EmptyState className="min-h-0 flex-1" message={t("ed.d.noTasks")} />
  // The task on screen stands first and is open unless the author closed it.
  const order = [...tasks].sort((a, b) => Number(b.ID === currentId) - Number(a.ID === currentId))
  return <div className="space-y-2">
    <FieldLabel as="span" text={t("ed.d.author.title")} className="text-xs font-semibold uppercase tracking-wider"
      help={{ intro: t("ed.d.author.help"), default: t("ed.d.author.helpNote") }} />
    <div>
      {order.map((task) => {
        const defaultOpen = task.ID === currentId
        const open = toggled.has(task.ID) ? !defaultOpen : defaultOpen
        return <TaskSection key={task.ID} task={task} number={tasks.indexOf(task) + 1} open={open} status={status} devices={devices} solved={solvedIds.has(task.ID)}
          onToggle={() => setToggled((current) => { const next = new Set(current); if (!next.delete(task.ID)) next.add(task.ID); return next })} />
      })}
    </div>
  </div>
}
