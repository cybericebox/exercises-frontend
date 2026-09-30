"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { destroyDeploy, listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { getExercise, type Exercise } from "@/api/exercises/catalog"
import { exerciseFileURL } from "@/api/exercises/files"
import { getVersion, type NormalizedTask, type NormalizedVariant } from "@/api/exercises/versions"
import { TaskRichTextView, richTextHasBlocks } from "@/components/exercises/TaskRichTextView"
import { TestFlagCheck } from "@/components/exercises/TestFlagCheck"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { deployPhaseLabel } from "@/lib/deployStatus"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref, testLabHref } from "@/lib/exerciseRoutes"
import { hintTextHasContent, hintTextToState } from "@/lib/hintText"
import { downloadBlob } from "@/lib/downloadBlob"
import { taskValues } from "@/lib/placeholderResolve"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"
import { cn } from "@/utils/cn"

/** What the page was opened with: a running deploy, or a variant to start one for. */
export type TestLabInitial = { deploy: string | null; version: string | null; variant: string | null }

type Meta = { exercise: Exercise; variant: NormalizedVariant; variantNumber: number; versionId: string }
type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; meta: Meta }

/** A deploy the list no longer knows: ended, or its lease ran out. */
class DeployGoneError extends Error {}

function untilText(iso: string | null): string | null {
  if (!iso) return null
  return t("admin.exTest.until", { time: new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) })
}

/**
 * TestLabPage — the author's testing interface for one variant's lab: the lab
 * state, its VPN config and web access on top, the variant's tasks on the left and
 * the chosen task on the right exactly as a participant sees it, with this lab's
 * values in the description and a check for the flag the author found.
 */
export function TestLabPage({ exerciseId, initial: opened }: { exerciseId: string; initial: TestLabInitial }) {
  const router = useRouter()
  // What the page opened with; the address changes under it once the lab exists.
  const [initial] = useState(opened)
  const deploy = useDeployTest()
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [item, setItem] = useState<DeployListItem | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [endOpen, setEndOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState("")
  const [ended, setEnded] = useState(false)
  // The hook's methods are stable; the whole object changes on every state change.
  const { start, attach } = deploy

  useEffect(() => {
    let cancelled = false
    async function open() {
      setLoad({ state: "loading" })
      try {
        let versionId = initial.version
        let variantId = initial.variant
        let running: DeployListItem | null = null
        if (initial.deploy) {
          running = (await listDeploys(exerciseId)).find((entry) => entry.DeployID === initial.deploy) ?? null
          if (!running) throw new DeployGoneError()
          versionId = running.VersionID
          variantId = running.VariantID
        }
        if (!versionId || !variantId) throw new DeployGoneError()
        const [exercise, version] = await Promise.all([getExercise(exerciseId), getVersion(exerciseId, versionId)])
        const index = version.Variants.findIndex((candidate) => candidate.ID === variantId)
        if (index < 0) throw new DeployGoneError()
        if (cancelled) return
        const variant = version.Variants[index]
        setSelected(variant.Tasks[0]?.ID ?? null)
        setItem(running)
        setLoad({ state: "ready", meta: { exercise, variant, variantNumber: index + 1, versionId } })
        if (running) attach(running.DeployID, running.Tasks)
        else void start(exerciseId, versionId, variantId)
      } catch (cause) {
        if (!cancelled) setLoad({ state: "error", cause })
      }
    }
    void open()
    return () => { cancelled = true }
  }, [attempt, exerciseId, initial, attach, start])

  // A started deploy: make the address reopenable (a reload attaches instead of starting another),
  // and learn its lease.
  const deployId = deploy.deployId
  useEffect(() => {
    if (!deployId || initial.deploy) return
    window.history.replaceState(null, "", testLabHref(exerciseId, deployId))
    let cancelled = false
    listDeploys(exerciseId).then(
      (items) => { if (!cancelled) setItem(items.find((entry) => entry.DeployID === deployId) ?? null) },
      () => undefined
    )
    return () => { cancelled = true }
  }, [deployId, exerciseId, initial.deploy])

  const status = deploy.status
  const tasks = useMemo(() => load.state === "ready" ? load.meta.variant.Tasks : [], [load])
  const task = tasks.find((candidate) => candidate.ID === selected) ?? tasks[0] ?? null

  const retry = useCallback(() => {
    if (load.state === "ready" && !deploy.deployId) void start(exerciseId, load.meta.versionId, load.meta.variant.ID ?? "")
    else setAttempt((n) => n + 1)
  }, [load, deploy.deployId, start, exerciseId])

  async function endTest() {
    if (!deploy.deployId) return
    setEnding(true)
    setEndError("")
    try {
      await destroyDeploy(deploy.deployId)
      setEnded(true)
      router.push(exerciseHref(exerciseId))
    } catch (cause) {
      setEndError(exerciseErrorMessage(cause))
      setEnding(false)
    }
  }

  const back = <Link href={exerciseHref(exerciseId)} className="w-fit text-sm text-primary hover:underline">← {t("admin.exTest.back")}</Link>

  if (load.state === "loading" || ended) {
    return <div className="flex min-h-full flex-col gap-4">{back}<LoadingArea className="min-h-[24rem] flex-1" label={t("admin.loading")} /></div>
  }
  if (load.state === "error") {
    const gone = load.cause instanceof DeployGoneError
    return <div className="flex min-h-full flex-col gap-4">{back}
      <LoadError className="min-h-[24rem] flex-1" message={gone ? t("admin.exTest.gone") : t("admin.exTest.loadFailed", { reason: exerciseErrorMessage(load.cause) })}
        error={gone ? undefined : load.cause} onRetry={gone ? undefined : retry} />
    </div>
  }

  const { meta } = load
  const failed = Boolean(deploy.error) || status?.Phase === "Failed" || status?.Phase === "Error"
  const ready = status?.Ready ?? false
  const until = untilText(item?.ExpiresAt ?? null)
  const values = ready && status ? taskValues(task?.Placeholders, status) : null
  const openingKey = deploy.link === "opening" && deploy.linkKey && values
    ? Object.entries(values.external).find(([, target]) => `${target.device}:${target.port}` === deploy.linkKey)?.[0] ?? null
    : null
  const vpnConfig = status?.VPNConfig ?? ""

  return <div className="flex min-h-full flex-col gap-4">
    {back}
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-2xl font-semibold text-foreground">{meta.exercise.Name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("admin.exDraft.variant")} {meta.variantNumber}</span>
          <Badge tone={failed ? "warn" : ready ? "ok" : "muted"} data-deploy-status>{deployPhaseLabel(deploy.error ? "Failed" : status?.Phase ?? "Pending")}</Badge>
          {until && <span>{until}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ready && vpnConfig && <Button type="button" variant="outline"
          onClick={() => downloadBlob(new Blob([vpnConfig], { type: "text/plain" }), "cybericebox.conf")}>{t("admin.exTest.vpnDownload")}</Button>}
        {ready && status?.Access?.map((access) => <Button key={`${access.Device}:${access.Port}`} type="button" variant="outline"
          busy={deploy.link === "opening" && deploy.linkKey === `${access.Device}:${access.Port}`} disabled={deploy.link === "opening"}
          onClick={() => deploy.openLink(access.Device, access.Port)}>{t("admin.exTest.openWeb", { device: access.Device })}</Button>)}
        {deploy.deployId && <Button type="button" variant="destructive" onClick={() => { setEndError(""); setEndOpen(true) }}>{t("admin.exTest.end")}</Button>}
      </div>
    </div>
    {deploy.link === "error" && <LoadError compact error={deploy.linkError}
      message={deploy.linkError instanceof PopupBlockedError ? t("admin.exDeploy.linkPopupBlocked") : t("admin.exDeploy.linkFailed")} onRetry={deploy.retryLink} />}

    {failed ? (
      <LoadError className="min-h-[24rem] flex-1" error={deploy.errorCause}
        message={deploy.error ? t("admin.exDeploy.failedReason", { reason: exerciseErrorMessage(deploy.errorCause) }) : t("admin.exDeploy.failed")}
        onRetry={deploy.deployId ? undefined : retry} />
    ) : !ready ? (
      <LoadingArea className="min-h-[24rem] flex-1" label={t("admin.exDeploy.provisioning")}
        message={status?.Phase ? deployPhaseLabel(status.Phase) : t("admin.exDeploy.provisioning")} />
    ) : tasks.length === 0 ? (
      <EmptyState className="min-h-[24rem] flex-1" message={t("admin.exTest.noTasks")} />
    ) : (
      <div className="grid flex-1 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t("admin.exTest.tasks")} className="flex flex-col gap-1">
          <h2 className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exTest.tasks")}</h2>
          {tasks.map((entry, index) => (
            <button key={entry.ID || index} type="button" aria-current={entry === task ? "true" : undefined}
              onClick={() => setSelected(entry.ID)}
              className={cn("rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted", entry === task ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
              {entry.Name}
            </button>
          ))}
        </nav>
        {task && values && <TaskPanel key={task.ID} task={task} values={values} deployId={deploy.deployId ?? ""}
          flagLinked={deploy.tasks.some((entry) => entry.TaskID === task.ID)} openingKey={openingKey}
          onOpenExternal={(target) => deploy.openLink(target.device, target.port)} />}
      </div>
    )}

    <ConfirmDialog open={endOpen} tone="danger" busy={ending} error={endError} title={t("admin.exTest.endTitle")}
      description={t("admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEndOpen(false)} onConfirm={() => void endTest()} />
  </div>
}

function TaskPanel({ task, values, deployId, flagLinked, openingKey, onOpenExternal }: {
  task: NormalizedTask
  values: ReturnType<typeof taskValues>
  deployId: string
  flagLinked: boolean
  openingKey: string | null
  onOpenExternal: (target: { device: string; port: number }) => void
}) {
  const hints = task.Hints.filter((hint) => hintTextHasContent(hint.Text))
  const view = (value: unknown) => <TaskRichTextView value={value} variables={values.variables} links={values.links}
    external={values.external} openingKey={openingKey} onOpenExternal={onOpenExternal} />
  return <article className="min-w-0 rounded-lg border border-border p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-semibold text-foreground">{task.Name}</h2>
      <Badge tone="muted">{t(`admin.ex.difficulty.${task.Difficulty}`)}</Badge>
    </div>
    <div className="mt-3">
      {richTextHasBlocks(task.Description) ? view(task.Description) : <p className="text-sm text-muted-foreground">{t("admin.exTest.noDescription")}</p>}
    </div>

    {task.Attachments.length > 0 && <section className="mt-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exTest.attachments")}</h3>
      <ul className="mt-1.5 space-y-1 text-sm">
        {task.Attachments.map((file) => <li key={file.FileID}>
          <a href={exerciseFileURL(file.FileID)} download={file.Name} className="text-primary underline underline-offset-2">{file.Name}</a>
        </li>)}
      </ul>
    </section>}

    {hints.length > 0 && <section className="mt-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("exercises.hints.title")}</h3>
      <ol className="mt-1.5 space-y-2">
        {hints.map((hint, index) => <li key={hint.ID || index} className="rounded-md border border-border p-3">
          <div className="mb-1 text-xs text-muted-foreground">{t("exercises.hints.item", { n: index + 1 })} · {t(`exercises.hints.level.${hint.Level}`)}</div>
          {view(hintTextToState(hint.Text))}
        </li>)}
      </ol>
    </section>}

    {flagLinked && deployId && <section className="mt-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exDeploy.checkTitle")}</h3>
      <p className="mb-1.5 text-xs text-muted-foreground">{t("admin.exDeploy.checkHelp")}</p>
      <TestFlagCheck deployId={deployId} taskId={task.ID} taskName={task.Name} />
    </section>}
  </article>
}
