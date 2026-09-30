"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { destroyDeploy, listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { getExercise, type Exercise } from "@/api/exercises/catalog"
import { getVersion, type NormalizedVariant } from "@/api/exercises/versions"
import { LabBar, TaskList, TaskView } from "@/components/exercises/LabWorkbench"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { deployPhaseLabel } from "@/lib/deployStatus"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref, testLabHref } from "@/lib/exerciseRoutes"
import { downloadBlob } from "@/lib/downloadBlob"
import { taskValues } from "@/lib/placeholderResolve"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"

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
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set())
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

  const phase = deploy.error ? "Failed" : status?.Phase ?? "Pending"
  const statusText = [deployPhaseLabel(phase), ready ? until : null].filter(Boolean).join(" · ")
  const webAccess = ready ? (status?.Access ?? []).map((access) => ({
    key: `${access.Device}:${access.Port}`, device: access.Device, busy: deploy.link === "opening" && deploy.linkKey === `${access.Device}:${access.Port}`,
  })) : []

  return <div className="flex min-h-full flex-col gap-4">
    {back}
    <LabBar title={meta.exercise.Name} subtitle={`${t("admin.exDraft.variant")} ${meta.variantNumber}`} status={statusText}
      statusTone={failed ? "warn" : ready ? "ok" : "muted"}
      onDownloadVpn={ready && vpnConfig ? () => downloadBlob(new Blob([vpnConfig], { type: "text/plain" }), "cybericebox.conf") : undefined}
      onEnd={deploy.deployId ? () => { setEndError(""); setEndOpen(true) } : undefined} />
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
      <div className="grid flex-1 gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
        <TaskList tasks={tasks} selectedId={task?.ID ?? null} solved={solved} onSelect={setSelected} webAccess={webAccess}
          webBusy={deploy.link === "opening"} onOpenWeb={(key) => { const [device, port] = [key.slice(0, key.lastIndexOf(":")), Number(key.slice(key.lastIndexOf(":") + 1))]; deploy.openLink(device, port) }} />
        {task && values && <TaskView key={task.ID} task={task} values={values} deployId={deploy.deployId ?? ""}
          flagLinked={deploy.tasks.some((entry) => entry.TaskID === task.ID)} openingKey={openingKey}
          onOpenExternal={(target) => deploy.openLink(target.device, target.port)}
          onSolved={(id) => setSolved((current) => new Set(current).add(id))} />}
      </div>
    )}

    <ConfirmDialog open={endOpen} tone="danger" busy={ending} error={endError} title={t("admin.exTest.endTitle")}
      description={t("admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEndOpen(false)} onConfirm={() => void endTest()} />
  </div>
}
