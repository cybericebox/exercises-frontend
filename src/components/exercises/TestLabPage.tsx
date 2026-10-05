"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { destroyDeploy, listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { getExercise, type Exercise } from "@/api/exercises/catalog"
import { getVersion, type NormalizedVariant, type VersionResources } from "@/api/exercises/versions"
import { LabBar, LabTimer, TaskSidebar, TaskView } from "@/components/exercises/LabWorkbench"
import { LabTopologyPanel } from "@/components/exercises/LabTopologyPanel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { deployPhaseLabel } from "@/lib/deployStatus"
import { DeviceFailure } from "@/components/exercises/DeviceLiveInfo"
import { failedDevices, imageWarningText, queueLine } from "@/lib/deviceLive"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref, testLabHref } from "@/lib/exerciseRoutes"
import { VpnDialog } from "@/components/exercises/VpnDialog"
import { LAB_SIDEBAR_COLLAPSED_KEY, LAB_TOPOLOGY_SHOWN_KEY, LAB_TOPOLOGY_WIDTH_KEY, pruneLayouts, removeLayout } from "@/lib/labLayout"
import { taskValues } from "@/lib/placeholderResolve"
import { useOtherLabsRunning } from "@/lib/useOtherLabsRunning"
import { NoRoomPanel } from "@/components/exercises/NoRoomPanel"
import { isNoTestLabRoom } from "@/lib/noTestLabRoom"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"

/** What the page was opened with: a running deploy, or a variant to start one for. */
export type TestLabInitial = { deploy: string | null; version: string | null; variant: string | null }

type Meta = { exercise: Exercise; variant: NormalizedVariant; variantNumber: number; versionId: string; resources: VersionResources | null }
type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; meta: Meta }

/** A deploy the list no longer knows: ended, or its lease ran out. */
class DeployGoneError extends Error {}

const RATIO_DEFAULT = 4 / 9 // task 4 : topology 5
const clampRatio = (value: number) => Math.min(0.75, Math.max(0.25, value))

/** A value kept in localStorage; storage may be unavailable, then it just lives for the visit. */
function usePersisted<T>(key: string, initial: T, parse: (raw: string) => T | null): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const raw = window.localStorage.getItem(key); const parsed = raw === null ? null : parse(raw); return parsed ?? initial } catch { return initial }
  })
  return [value, (next) => {
    setValue(next)
    try { window.localStorage.setItem(key, String(next)) } catch { /* best effort */ }
  }]
}

/**
 * TestLabPage — the author's full-screen testing interface for one variant's lab: a bar
 * with the lab clock and actions, the task sidebar, the chosen task exactly as a
 * participant sees it (this lab's values, hints, a flag check) and a read-only topology.
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
  const [vpnOpen, setVpnOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState("")
  const [ended, setEnded] = useState(false)
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set())
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())
  const [collapsed, setCollapsed] = usePersisted(LAB_SIDEBAR_COLLAPSED_KEY, false, (raw) => raw === "true")
  const [topologyShown, setTopologyShown] = usePersisted(LAB_TOPOLOGY_SHOWN_KEY, true, (raw) => raw !== "false")
  const [ratio, setRatio] = usePersisted(LAB_TOPOLOGY_WIDTH_KEY, RATIO_DEFAULT, (raw) => Number.isFinite(Number(raw)) ? clampRatio(Number(raw)) : null)
  const split = useRef<HTMLDivElement>(null)
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
        setLoad({ state: "ready", meta: { exercise, variant, variantNumber: index + 1, versionId, resources: version.Resources } })
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

  // The author's arrangement of a lab is dropped with the lab: every one that is no longer active goes now...
  useEffect(() => {
    let cancelled = false
    listDeploys().then((items) => { if (!cancelled) pruneLayouts(items.map((entry) => entry.DeployID)) }, () => undefined)
    return () => { cancelled = true }
  }, [])
  // ...and this one when its lease runs out.
  const leaseEnd = item?.ExpiresAt
  useEffect(() => {
    if (!leaseEnd || !deploy.deployId) return
    const id = deploy.deployId
    const left = new Date(leaseEnd).getTime() - Date.now()
    if (left > 2 ** 31 - 1) return
    const timer = setTimeout(() => removeLayout(id), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [leaseEnd, deploy.deployId])

  const othersRunning = useOtherLabsRunning(endOpen ? deploy.deployId : null, 1)
  const status = deploy.status
  // What the server remembers plus what was just checked, so the tick shows before the next poll.
  const solvedIds = useMemo(() => new Set([...solved, ...(status?.SolvedTaskIDs ?? [])]), [solved, status?.SolvedTaskIDs])
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
      removeLayout(deploy.deployId)
      setEnded(true)
      router.push(exerciseHref(exerciseId))
    } catch (cause) {
      setEndError(exerciseErrorMessage(cause))
      setEnding(false)
    }
  }

  const backLink = <Link href={exerciseHref(exerciseId)} className="w-fit text-sm text-primary hover:underline">← {t("admin.exTest.back")}</Link>
  const screen = (children: React.ReactNode) => <div className="flex h-dvh flex-col gap-4 bg-background p-4">{backLink}{children}</div>

  if (load.state === "loading" || ended) {
    return screen(<LoadingArea className="min-h-0 flex-1" label={t("admin.loading")} />)
  }
  if (load.state === "error") {
    const gone = load.cause instanceof DeployGoneError
    return screen(<LoadError className="min-h-0 flex-1" message={gone ? t("admin.exTest.gone") : t("admin.exTest.loadFailed", { reason: exerciseErrorMessage(load.cause) })}
      error={gone ? undefined : load.cause} onRetry={gone ? undefined : retry} />)
  }

  const { meta } = load
  const failed = Boolean(deploy.error) || status?.Phase === "Failed" || status?.Phase === "Error"
  const ready = status?.Ready ?? false
  const values = ready && status ? taskValues(task?.Placeholders, status) : null
  const openingKey = deploy.link === "opening" && deploy.linkKey && values
    ? Object.entries(values.external).find(([, target]) => `${target.device}:${target.port}` === deploy.linkKey)?.[0] ?? null
    : null
  const vpnConfig = status?.VPNConfig ?? ""
  const phase = deploy.error ? "Failed" : status?.Phase ?? "Pending"
  const index = task ? tasks.indexOf(task) : -1
  const stage = (at: number) => tasks[at] ? { number: at + 1, select: () => setSelected(tasks[at].ID) } : undefined
  const showTopology = topologyShown && ready
  const imageNote = imageWarningText(status)

  return <div className="flex h-dvh flex-col bg-background">
    <LabBar title={meta.exercise.Name} progress={{ done: tasks.filter((entry) => solvedIds.has(entry.ID)).length, total: tasks.length }}
      center={<LabTimer expiresAt={ready ? item?.ExpiresAt ?? null : null} fallback={deployPhaseLabel(phase)} />}
      topologyShown={topologyShown} onToggleTopology={() => setTopologyShown(!topologyShown)}
      onOpenVpn={ready && vpnConfig ? () => setVpnOpen(true) : undefined}
      vpn={{ connected: status?.VPNConnected ?? false }}
      onEnd={deploy.deployId ? () => { setEndError(""); setEndOpen(true) } : undefined} />
    {deploy.link === "error" && <LoadError compact error={deploy.linkError}
      message={deploy.linkError instanceof PopupBlockedError ? t("admin.exDeploy.linkPopupBlocked") : t("admin.exDeploy.linkFailed")} onRetry={deploy.retryLink} />}

    {imageNote && <p className="shrink-0 px-4 py-1.5 text-xs text-muted-foreground">{imageNote}</p>}

    {failed && isNoTestLabRoom(deploy.errorCause) ? (
      <NoRoomPanel className="min-h-0 flex-1" error={deploy.errorCause} variant={meta.variant} resources={meta.resources} onRetry={retry} />
    ) : failed ? (
      <LoadError className="min-h-0 flex-1" error={deploy.errorCause}
        message={deploy.error ? t("admin.exDeploy.failedReason", { reason: exerciseErrorMessage(deploy.errorCause) }) : t("admin.exDeploy.failed")}
        onRetry={deploy.deployId ? undefined : retry} />
    ) : !ready ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <LoadingArea className="min-h-0 flex-1" label={t("admin.exDeploy.provisioning")}
          message={queueLine(status?.Queue) ?? (status?.Phase ? deployPhaseLabel(status.Phase) : t("admin.exDeploy.provisioning"))} />
        {failedDevices(status?.Devices).length > 0 && <div className="mx-auto w-full max-w-xl shrink-0 space-y-2 p-4">
          {failedDevices(status?.Devices).map((device) => <div key={device.Name} className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">{device.Name}</div>
            <DeviceFailure device={device} />
          </div>)}
        </div>}
      </div>
    ) : tasks.length === 0 ? (
      <EmptyState className="min-h-0 flex-1" message={t("admin.exTest.noTasks")} />
    ) : (
      <div className="flex min-h-0 flex-1">
        <TaskSidebar tasks={tasks} selectedId={task?.ID ?? null} solved={solvedIds} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onSelect={setSelected} />
        <div ref={split} className="flex min-h-0 min-w-0 flex-1">
          <div className="min-w-0 overflow-y-auto p-6" style={{ flex: showTopology ? `${ratio} 1 0` : "1 1 0" }}>
            {task && values && <TaskView key={task.ID} task={task} values={values} deployId={deploy.deployId ?? ""}
              flagLinked={deploy.tasks.some((entry) => entry.TaskID === task.ID)} solved={solvedIds.has(task.ID)} openingKey={openingKey}
              onOpenExternal={(target) => deploy.openLink(target.device, target.port)}
              onSolved={(id) => setSolved((current) => new Set(current).add(id))}
              revealedHints={revealed} onRevealHint={(key) => setRevealed((current) => new Set(current).add(key))}
              prev={stage(index - 1)} next={stage(index + 1)} />}
          </div>
          {showTopology && <>
            <div role="separator" aria-orientation="vertical" tabIndex={0} aria-label={t("admin.exTest.resize")}
              aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio * 100)}
              className="w-1.5 shrink-0 cursor-col-resize touch-none bg-border hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId) }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId) || !split.current) return
                const box = split.current.getBoundingClientRect()
                setRatio(clampRatio((event.clientX - box.left) / box.width))
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setRatio(clampRatio(ratio - 0.03))
                if (event.key === "ArrowRight") setRatio(clampRatio(ratio + 0.03))
              }} />
            <div className="min-h-0 min-w-0" style={{ flex: `${1 - ratio} 1 0` }}>
              <LabTopologyPanel deployId={deploy.deployId ?? ""} topology={meta.variant.Topology} status={status} openingKey={deploy.link === "opening" ? deploy.linkKey : null}
                onOpenWeb={(device, port) => deploy.openLink(device, port)} />
            </div>
          </>}
        </div>
      </div>
    )}

    <VpnDialog open={vpnOpen && Boolean(vpnConfig)} config={vpnConfig} connected={status?.VPNConnected ?? false} probeUrl={status?.VPNProbeURL} onClose={() => setVpnOpen(false)} />
    <ConfirmDialog open={endOpen} tone="danger" busy={ending} error={endError} title={t("admin.exTest.endTitle")}
      description={t(othersRunning ? "admin.exTest.endDescriptionOthers" : "admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEndOpen(false)} onConfirm={() => void endTest()} />
  </div>
}
