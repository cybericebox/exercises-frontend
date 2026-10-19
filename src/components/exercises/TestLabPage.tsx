"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { destroyDeploy, extendDeploy, getTestRunLengths, listDeploys, type DeployListItem, type DeployStatus, type TestRunLengths } from "@/api/exercises/deploy"
import { getExercise, type Exercise } from "@/api/exercises/catalog"
import { getVersion, type NormalizedVariant, type VersionResources } from "@/api/exercises/versions"
import { LabBar, LabTimer, TaskSidebar, TaskView } from "@/components/exercises/LabWorkbench"
import { LabTopologyPanel } from "@/components/exercises/LabTopologyPanel"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorPage } from "@/components/ErrorPage"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { deployPhaseLabel } from "@/lib/deployStatus"
import { DeviceFailure } from "@/components/exercises/DeviceLiveInfo"
import { failedDevices, imageWarningText, startingNote } from "@/lib/deviceLive"
import { useLongWait } from "@/lib/useLabWaitStage"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { unavailableImagesOf, type ImageAvailability } from "@/api/exercises/imageCheck"
import { imageReasonText } from "@/lib/imageErrors"
import { exerciseHref, testLabHref } from "@/lib/exerciseRoutes"
import { VpnDialog } from "@/components/exercises/VpnDialog"
import { LAB_SIDEBAR_COLLAPSED_KEY, LAB_TOPOLOGY_SHOWN_KEY, LAB_TOPOLOGY_WIDTH_KEY, pruneLayouts, removeLayout } from "@/lib/labLayout"
import { taskValues } from "@/lib/placeholderResolve"
import { useOtherLabsRunning } from "@/lib/useOtherLabsRunning"
import { NoRoomPanel } from "@/components/exercises/NoRoomPanel"
import { isNoTestLabRoom } from "@/lib/noTestLabRoom"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"
import { useLeaseClock } from "@/lib/useLeaseClock"
import { formatClock } from "@/lib/bookingFormat"
import { initialLength, TestRunLength } from "@/components/exercises/TestRunLength"

/** What the page was opened with: a running deploy, or a variant to start one for. */
export type TestLabInitial = { deploy: string | null; version: string | null; variant: string | null }

type Meta = { exercise: Exercise; variant: NormalizedVariant; variantNumber: number; versionId: string; resources: VersionResources | null; lengths: TestRunLengths | null }
type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; meta: Meta }

/** A deploy the list no longer knows: ended, or its lease ran out. */
class DeployGoneError extends Error {}

/** What a static test resolves its placeholders against: fixed values only, lab-bound ones stay unresolved. */
const STATIC_STATUS: DeployStatus = { Phase: "Ready", Ready: true }

const RATIO_DEFAULT = 4 / 9 // task 4 : topology 5
/** The ending line shows this long before the lease ends, even without the reservation's notice. */
const ENDING_SOON_MS = 5 * 60000
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
// The lab is starting: one calm line, plus a second one after 30 s. Mounted only while starting, so the wait counts
// from when the page first saw it. The second line is always laid out, so showing it moves nothing.
function StartingLoader({ started, status }: { started: boolean; status: DeployStatus | null | undefined }) {
  const longWait = useLongWait(status)
  const message = t(started ? "admin.exDeploy.starting" : "admin.exTest.starting")
  return <LoadingArea className="min-h-0 flex-1" label={message} message={message}
    note={started ? startingNote(status?.Queue, true) ?? undefined : undefined} noteShown={longWait} />
}

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
  // A new test waits for the author to choose its run length and press «Запустити».
  const [choosing, setChoosing] = useState(false)
  const [length, setLength] = useState(0)
  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState("")
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
        // The lengths matter only for a new test; without them the server's default applies.
        const [exercise, version, lengths] = await Promise.all([getExercise(exerciseId), getVersion(exerciseId, versionId),
          running ? Promise.resolve(null) : getTestRunLengths().catch(() => null)])
        const index = version.Variants.findIndex((candidate) => candidate.ID === variantId)
        if (index < 0) throw new DeployGoneError()
        if (cancelled) return
        const variant = version.Variants[index]
        setSelected(variant.Tasks[0]?.ID ?? null)
        setItem(running)
        setLoad({ state: "ready", meta: { exercise, variant, variantNumber: index + 1, versionId, resources: version.Resources, lengths } })
        if (running) attach(running.DeployID, running.Tasks, running.Kind ?? "lab")
        else if (lengths && lengths.AllowedMinutes.length > 0) {
          setLength(initialLength(lengths))
          setChoosing(true)
        } else void start(exerciseId, versionId, variantId)
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
    if (load.state === "ready" && !deploy.deployId) void start(exerciseId, load.meta.versionId, load.meta.variant.ID ?? "", length || undefined)
    else setAttempt((n) => n + 1)
  }, [load, deploy.deployId, start, exerciseId, length])

  // The ending line: the reservation's notice, or the last minutes of the lease.
  const endingAt = deploy.status?.EndingAt ?? item?.EndingAt ?? null
  const now = useLeaseClock(item?.ExpiresAt ? [item.ExpiresAt] : [], Boolean(item?.ExpiresAt) && !deploy.gone)
  const endsSoon = Boolean(item?.ExpiresAt) && new Date(item?.ExpiresAt ?? "").getTime() - now <= ENDING_SOON_MS

  async function extend() {
    if (!deploy.deployId) return
    setExtending(true)
    setExtendError("")
    try {
      const updated = await extendDeploy(deploy.deployId)
      setItem({ ...updated, EndingAt: null })
    } catch (cause) {
      setExtendError(exerciseErrorMessage(cause))
    } finally {
      setExtending(false)
    }
  }

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
  if (load.state === "error" || deploy.gone) {
    const gone = deploy.gone || load.state === "error" && load.cause instanceof DeployGoneError
    const cause = load.state === "error" ? load.cause : undefined
    // the whole test page failed (no lab bar, no shell): the full error page
    return gone
      // The last answer before the lab went carried the reservation's ending notice: its time ran out.
      ? <ErrorPage mode="page" status={404} title={t(deploy.status?.EndingAt ? "admin.exDeploy.ended" : "admin.exTest.gone")} />
      : <ErrorPage mode="page" status={500} body={t("admin.exTest.loadFailed", { reason: exerciseErrorMessage(cause) })} error={cause} onRetry={retry} />
  }

  const { meta } = load
  // The lease is over but the lab is not removed yet: nothing to work with, only to end.
  const expired = Boolean(status?.Expired || item?.Expired)
  const failed = !expired && (Boolean(deploy.error) || status?.Phase === "Failed" || status?.Phase === "Error")
  // A static test has no lab: it is ready at once. Gate on the kind, never on the polled phase (the server leaves it empty).
  const isStatic = deploy.kind === "static"
  const ready = isStatic || (status?.Ready ?? false)
  const values = isStatic ? taskValues(task?.Placeholders, STATIC_STATUS) : ready && status ? taskValues(task?.Placeholders, status) : null
  const openingKey = deploy.link === "opening" && deploy.linkKey && values
    ? Object.entries(values.external).find(([, target]) => `${target.device}:${target.port}` === deploy.linkKey)?.[0] ?? null
    : null
  const vpnConfig = isStatic ? "" : status?.VPNConfig ?? ""
  // Until the start answers there is no kind: say nothing about a lab. A static test never talks about one.
  const neutral = isStatic || !deploy.deployId
  const phase = deploy.error ? "Failed" : isStatic ? "Ready" : status?.Phase ?? "Pending"
  const index = task ? tasks.indexOf(task) : -1
  const stage = (at: number) => tasks[at] ? { number: at + 1, select: () => setSelected(tasks[at].ID) } : undefined
  const showTopology = !isStatic && topologyShown && ready && !expired
  const imageNote = isStatic ? null : imageWarningText(status)
  // The lab will be deleted soon unless it is extended (a static test has no reservation).
  const endingLine = !isStatic && ready && !expired && Boolean(deploy.deployId) && (Boolean(endingAt) || endsSoon)
  const endingTime = endingAt ?? item?.ExpiresAt ?? null
  // A start refused because some images cannot be pulled (409 72803): which ones, and why.
  const unavailableImages = deploy.error ? unavailableImagesOf(deploy.errorCause) : null

  return <div className="flex h-dvh flex-col bg-background">
    <LabBar title={meta.exercise.Name} isStatic={isStatic} backHref={exerciseHref(exerciseId)} progress={{ done: tasks.filter((entry) => solvedIds.has(entry.ID)).length, total: tasks.length }}
      center={<LabTimer isStatic={isStatic} expiresAt={ready && !expired ? item?.ExpiresAt ?? null : null} fallback={choosing ? "" : expired ? t("admin.exTest.expired") : isStatic ? "" : !deploy.deployId ? t(deploy.error ? "admin.exTest.startFailed" : "admin.exTest.starting") : deployPhaseLabel(phase)} />}
      topologyShown={topologyShown} onToggleTopology={isStatic ? undefined : () => setTopologyShown(!topologyShown)}
      onOpenVpn={!expired && ready && vpnConfig ? () => setVpnOpen(true) : undefined}
      vpn={{ connected: status?.VPNConnected ?? false }}
      onEnd={deploy.deployId && !expired ? () => { setEndError(""); setEndOpen(true) } : undefined} />
    <div className="relative flex min-h-0 flex-1 flex-col max-lg:overflow-y-auto">
    {/* Notices float over the content: they appear and go without moving the lab under them. */}
    {(deploy.link === "error" || imageNote || endingLine) && <div className="absolute inset-x-0 top-0 z-20 border-b border-border bg-background">
      {deploy.link === "error" && <LoadError compact error={deploy.linkError}
        message={deploy.linkError instanceof PopupBlockedError ? t("admin.exDeploy.linkPopupBlocked") : t("admin.exDeploy.linkFailed")} onRetry={deploy.retryLink} />}
      {imageNote && <p className="px-4 py-1.5 text-xs text-muted-foreground">{imageNote}</p>}
      {endingLine && endingTime && <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
        <span>{t("admin.exDeploy.ending", { time: formatClock(endingTime) })}</span>
        <Button type="button" size="sm" variant="outline" busy={extending} onClick={() => void extend()}>
          {t(extending ? "admin.exDeploy.extending" : "admin.exDeploy.extend")}
        </Button>
        {extendError && <span role="alert" className="text-xs text-destructive">{extendError}</span>}
      </div>}
    </div>}

    {choosing && meta.lengths ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
        <div className="grid w-full max-w-sm gap-4">
          <TestRunLength lengths={meta.lengths} value={length} onChange={setLength} />
          <Button type="button" onClick={() => {
            setChoosing(false)
            void start(exerciseId, meta.versionId, meta.variant.ID ?? "", length)
          }}>{t("admin.exDeploy.start")}</Button>
        </div>
      </div>
    ) : expired ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
        <EmptyState className="min-h-0 py-0" message={t("admin.exTest.expired")} />
        <Button type="button" variant="destructive" onClick={() => { setEndError(""); setEndOpen(true) }}>{t("admin.exTest.end")}</Button>
      </div>
    ) : failed && isNoTestLabRoom(deploy.errorCause) ? (
      <NoRoomPanel className="min-h-0 flex-1" error={deploy.errorCause} variant={meta.variant} resources={meta.resources} onRetry={retry} />
    ) : failed && unavailableImages ? (
      <LoadError className="min-h-0 flex-1" error={deploy.errorCause} message={t("exercises.image.startRefused")} onRetry={retry}
        details={<UnavailableImages images={unavailableImages} />} />
    ) : failed ? (
      <LoadError className="min-h-0 flex-1" error={deploy.errorCause}
        message={deploy.error
          ? t(neutral ? "admin.exTest.startFailedReason" : "admin.exDeploy.failedReason", { reason: exerciseErrorMessage(deploy.errorCause) })
          : t(neutral ? "admin.exTest.startFailed" : "admin.exDeploy.failed")}
        onRetry={deploy.deployId ? undefined : retry} />
    ) : !ready ? (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <StartingLoader started={Boolean(deploy.deployId)} status={status} />
        {failedDevices(status?.Devices).length > 0 && <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[45%] w-full max-w-xl space-y-2 overflow-y-auto bg-background p-4">
          {failedDevices(status?.Devices).map((device) => <div key={device.Name} className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">{device.Name}</div>
            <DeviceFailure device={device} />
          </div>)}
        </div>}
      </div>
    ) : tasks.length === 0 ? (
      <EmptyState className="min-h-0 flex-1" message={t("admin.exTest.noTasks")} />
    ) : (
      <div className="flex min-h-0 flex-1 flex-col max-lg:flex-none lg:flex-row">
        <TaskSidebar tasks={tasks} selectedId={task?.ID ?? null} solved={solvedIds} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onSelect={setSelected} />
        <div ref={split} className="flex min-h-0 min-w-0 flex-1 flex-col max-lg:flex-none lg:flex-row">
          <div className="min-w-0 p-4 lg:flex-[var(--lab-task-flex)] lg:overflow-y-auto lg:p-6" style={{ "--lab-task-flex": showTopology ? `${ratio} 1 0` : "1 1 0" } as CSSProperties}>
            {task && values && <TaskView key={task.ID} task={task} values={values} deployId={deploy.deployId ?? ""}
              flagLinked={deploy.tasks.some((entry) => entry.TaskID === task.ID)} randomFlag={isStatic && task.Flag.length === 0} solved={solvedIds.has(task.ID)} openingKey={openingKey}
              onOpenExternal={(target) => deploy.openLink(target.device, target.port)}
              onSolved={(id) => setSolved((current) => new Set(current).add(id))}
              revealedHints={revealed} onRevealHint={(key) => setRevealed((current) => new Set(current).add(key))}
              prev={stage(index - 1)} next={stage(index + 1)} />}
          </div>
          {showTopology && <>
            <div role="separator" aria-orientation="vertical" tabIndex={0} aria-label={t("admin.exTest.resize")}
              aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio * 100)}
              className="relative hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-border before:absolute before:inset-y-0 before:-inset-x-[9px] before:content-[''] hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none lg:block"
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
            <div className="h-[70dvh] min-h-[24rem] min-w-0 lg:h-auto lg:min-h-0 lg:flex-[var(--lab-topology-flex)]" style={{ "--lab-topology-flex": `${1 - ratio} 1 0` } as CSSProperties}>
              <LabTopologyPanel deployId={deploy.deployId ?? ""} topology={meta.variant.Topology} status={status} openingKey={deploy.link === "opening" ? deploy.linkKey : null}
                onOpenWeb={(device, port) => deploy.openLink(device, port)} />
            </div>
          </>}
        </div>
      </div>
    )}
    </div>

    <VpnDialog open={vpnOpen && Boolean(vpnConfig)} config={vpnConfig} connected={status?.VPNConnected ?? null} probeUrl={status?.VPNProbeURL} onClose={() => setVpnOpen(false)} />
    <ConfirmDialog open={endOpen} tone="danger" busy={ending} error={endError} title={t("admin.exTest.endTitle")}
      description={t(isStatic ? "admin.exTest.endDescriptionStatic" : othersRunning ? "admin.exTest.endDescriptionOthers" : "admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} busyLabel={t("admin.exTest.ending")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEndOpen(false)} onConfirm={() => void endTest()} />
  </div>
}

/** The images a test start could not pull, each with its reason. */
function UnavailableImages({ images }: { images: ImageAvailability[] }) {
  if (images.length === 0) return null
  return <ul aria-label={t("exercises.image.unavailableList")} className="w-full max-w-xl space-y-2 text-left">
    {images.map((item) => <li key={item.Image} className="min-w-0 rounded-md border border-border px-3 py-2">
      <code className="block break-all font-mono text-xs text-foreground">{item.Image}</code>
      <span className="text-xs text-muted-foreground">{imageReasonText(item.Reason)}</span>
    </li>)}
  </ul>
}
