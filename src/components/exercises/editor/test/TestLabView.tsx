"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock } from "lucide-react"

import { ErrorPage } from "@/components/ErrorPage"
import { destroyDeploy, extendDeploy, listDeploys, type DeployListItem, type DeployStatus } from "@/api/exercises/deploy"
import { getExerciseCapabilities, type LabCapabilities } from "@/api/exercises/capabilities"
import { getExercise, type Exercise } from "@/api/exercises/catalog"
import { unavailableImagesOf, type ImageAvailability } from "@/api/exercises/imageCheck"
import { getVersion, type NormalizedVariant, type VersionResources } from "@/api/exercises/versions"
import { DeviceFailure } from "@/components/exercises/DeviceLiveInfo"
import { NoRoomPanel } from "@/components/exercises/NoRoomPanel"
import { VpnDialog } from "@/components/exercises/VpnDialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { formatClock } from "@/lib/bookingFormat"
import { failedDevices, imageWarningText } from "@/lib/deviceLive"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref, testLabHref } from "@/lib/exerciseRoutes"
import { imageReasonText } from "@/lib/imageErrors"
import { isNoTestLabRoom } from "@/lib/noTestLabRoom"
import { deviceStage, isDeviceFailed, labChip, stateTaskView, vpnView } from "@/lib/testLab"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"
import { useLeaseClock } from "@/lib/useLeaseClock"
import { useOtherLabsRunning } from "@/lib/useOtherLabsRunning"
import { cn } from "@/utils/cn"
import { LabCapabilitiesProvider, useLabSupport } from "../labCapabilities"
import { ConsolePanel } from "./ConsolePanel"
import { type DeviceActions, ResetDeviceDialog } from "./DeviceList"
import { LabDock, type DockTab } from "./LabDock"
import { LabHeader } from "./LabHeader"
import { ParticipantTask, taskKindKey } from "./ParticipantTask"
import { SchemaFull } from "./SchemaView"
import { TaskRail, TaskSwitcher, type RailTask } from "./TaskRail"
import { CONSOLE_PORT, participantValues, PENDING_STATUS, STATIC_STATUS } from "./taskValues"

/** What the page was opened with: a running deploy, or a variant to start one for (and for how long). */
export type TestLabInitial = { deploy: string | null; version: string | null; variant: string | null; minutes: number | null }

type Meta = { exercise: Exercise; variant: NormalizedVariant; variantNumber: number; versionId: string; resources: VersionResources | null }
type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; meta: Meta }

/** A deploy the list no longer knows: ended, or its lease ran out. */
class DeployGoneError extends Error {}

/** The ending line shows this long before the lease ends, even without the reservation's notice. */
const ENDING_SOON_MS = 5 * 60000
/** The panel sits beside the task from this width up; below it, it slides over the page. */
const WIDE_QUERY = "(min-width: 1100px)"
const DOCK_SHOWN_KEY = "cib_lab_dock_shown"

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => { const list = window.matchMedia(query); list.addEventListener("change", notify); return () => list.removeEventListener("change", notify) },
    () => window.matchMedia(query).matches,
    () => true,
  )
}

/** A value kept in localStorage; storage may be unavailable, then it just lives for the visit. */
function usePersistedFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => { try { const raw = window.localStorage.getItem(key); return raw === null ? initial : raw === "true" } catch { return initial } })
  return [value, (next) => { setValue(next); try { window.localStorage.setItem(key, String(next)) } catch { /* best effort */ } }]
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

/**
 * The full-screen test of one variant: the participant's view of the task in the middle (the task rail at the left), and
 * at the right the lab panel with everything only the author sees. The lab starts in place: the tasks can be read while the
 * devices come up.
 */
export function TestLabView(props: { exerciseId: string; initial: TestLabInitial }) {
  const [capabilities, setCapabilities] = useState<LabCapabilities | null>(null)
  useEffect(() => {
    let cancelled = false
    getExerciseCapabilities().then((caps) => { if (!cancelled) setCapabilities(caps.LabCapabilities ?? null) }, () => undefined)
    return () => { cancelled = true }
  }, [])
  return <LabCapabilitiesProvider value={capabilities}><TestLab {...props} /></LabCapabilitiesProvider>
}

function TestLab({ exerciseId, initial: opened }: { exerciseId: string; initial: TestLabInitial }) {
  const router = useRouter()
  const support = useLabSupport()
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
  const [extending, setExtending] = useState(false)
  const [solvedAtById, setSolvedAtById] = useState<Readonly<Record<string, number>>>({})
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())
  const [tab, setTab] = useState<DockTab>("devices")
  const [dockShown, setDockShown] = usePersistedFlag(DOCK_SHOWN_KEY, true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [authorShown, setAuthorShown] = useState(true)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [schemaSelected, setSchemaSelected] = useState<string | null>(null)
  const [schemaFull, setSchemaFull] = useState(false)
  const [resetDevice, setResetDevice] = useState<string | null>(null)
  const [consoleDevice, setConsoleDevice] = useState<string | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const wide = useMedia(WIDE_QUERY)
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
        if (running) attach(running.DeployID, running.Tasks, running.Kind ?? "lab")
        else void start(exerciseId, versionId, variantId, initial.minutes ?? undefined)
      } catch (cause) {
        if (!cancelled) setLoad({ state: "error", cause })
      }
    }
    void open()
    return () => { cancelled = true }
  }, [attempt, exerciseId, initial, attach, start])

  // A started deploy: make the address reopenable (a reload attaches instead of starting another), and learn its lease.
  const deployId = deploy.deployId
  useEffect(() => {
    if (!deployId || initial.deploy) return
    window.history.replaceState(null, "", testLabHref(exerciseId, deployId))
    let cancelled = false
    listDeploys(exerciseId).then(
      (items) => { if (!cancelled) setItem(items.find((entry) => entry.DeployID === deployId) ?? null) },
      () => undefined,
    )
    return () => { cancelled = true }
  }, [deployId, exerciseId, initial.deploy])

  const othersRunning = useOtherLabsRunning(endOpen ? deploy.deployId : null, 1)
  const status: DeployStatus | null = deploy.status
  const isStatic = deploy.kind === "static"
  const meta = load.state === "ready" ? load.meta : null
  const tasks = useMemo(() => meta?.variant.Tasks ?? [], [meta])
  const devices = meta?.variant.Topology.Devices
  const task = tasks.find((candidate) => candidate.ID === selected) ?? tasks[0] ?? null

  // Solved: what the server remembers (answer tasks and state tasks) plus what was just checked, so the tick shows before the next poll.
  const solvedIds = useMemo(() => new Set([...Object.keys(solvedAtById), ...(status?.SolvedTaskIDs ?? [])]), [solvedAtById, status?.SolvedTaskIDs])
  const expired = Boolean(status?.Expired || item?.Expired)
  const startFailed = Boolean(deploy.error)
  const labFailed = !expired && (startFailed || status?.Phase === "Failed" || status?.Phase === "Error")
  const ready = isStatic || (status?.Ready ?? false)
  const labState = useMemo(() => labChip(status, startFailed, devices), [status, startFailed, devices])
  // The end stays in view as the mockup has it: the chip and the panel say «Завершуємо тест» until the page leaves.
  const chip = ending || ended ? { ...labState, kind: "removing" as const } : labState
  const vpn = useMemo(() => vpnView(status), [status])

  const expiresAt = status?.ExpiresAt ?? item?.ExpiresAt ?? null
  const now = useLeaseClock(expiresAt ? [expiresAt] : [], Boolean(expiresAt) && !deploy.gone)
  const left = expiresAt && !expired ? Math.max(0, new Date(expiresAt).getTime() - now) : null
  const endingAt = status?.EndingAt ?? item?.EndingAt ?? null
  const endsSoon = left !== null && left <= ENDING_SOON_MS

  const retry = useCallback(() => {
    if (load.state === "ready") void start(exerciseId, load.meta.versionId, load.meta.variant.ID ?? "", initial.minutes ?? undefined)
    else setAttempt((n) => n + 1)
  }, [load, start, exerciseId, initial.minutes])

  async function extend() {
    if (!deploy.deployId) return
    setExtending(true)
    try {
      const updated = await extendDeploy(deploy.deployId)
      setItem({ ...updated, EndingAt: null })
      toast.success(t("ed.d.extend.done"))
    } catch (cause) {
      toast.error(t("ed.d.extend.failed", { reason: exerciseErrorMessage(cause) }))
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
      setEnded(true)
      router.push(exerciseHref(exerciseId))
    } catch (cause) {
      setEndError(exerciseErrorMessage(cause))
      setEnding(false)
    }
  }

  // The console: the placeholder in the task text and the buttons on a device open the same panel.
  const consoleSupport = support({ access: "terminal" })
  const openConsole = useCallback((device: string) => {
    setConsoleDevice(device)
    setSheetOpen(false)
    window.setTimeout(() => consoleRef.current?.scrollIntoView?.({ block: "nearest" }), 0)
  }, [])

  const actions: DeviceActions = {
    openWeb: (device, port) => deploy.openLink(device, port),
    openConsole,
    askReset: setResetDevice,
    openingKey: deploy.link === "opening" ? deploy.linkKey : null,
    consoleReason: consoleSupport.state === "disabled" ? consoleSupport.reason : "",
  }

  // A click on a device of the schema: its row opens in the device list.
  function selectNode(key: string | null) {
    setSchemaSelected(key)
    const device = devices?.find((candidate) => candidate.ID === key)
    if (!device || !status) return
    const failed = isDeviceFailed(deviceStage(status.Devices?.find((entry) => entry.Name === device.Name), status.Phase))
    setExpanded((current) => {
      const next = new Set(current)
      // A failed device is open unless it was toggled shut, the others are shut unless toggled open.
      if (failed) next.delete(device.Name)
      else next.add(device.Name)
      return next
    })
    setTab("devices")
  }

  const backLink = <Link href={exerciseHref(exerciseId)} className="w-fit text-sm text-primary hover:underline">← {t("ed.d.header.back")}</Link>
  const screen = (children: React.ReactNode) => <div className="flex h-dvh flex-col gap-4 bg-background p-4">{backLink}{children}</div>

  if (load.state === "loading") return screen(<LoadingArea className="min-h-0 flex-1" label={t("admin.loading")} />)
  if (load.state === "error" || (deploy.gone && !ended)) {
    const gone = deploy.gone || (load.state === "error" && load.cause instanceof DeployGoneError)
    const cause = load.state === "error" ? load.cause : undefined
    return gone
      ? <ErrorPage mode="page" status={404} title={t(deploy.status?.EndingAt ? "ed.d.gone.ended" : "ed.d.gone.title")} />
      : <ErrorPage mode="page" status={500} body={t("ed.d.loadFailed", { reason: exerciseErrorMessage(cause) })} error={cause} onRetry={retry} />
  }

  const { variant } = load.meta
  const taskIdByKey = new Map(tasks.map((entry) => [entry.Key, entry]))
  const unsolvedRequires = (entry: (typeof tasks)[number]) => solvedIds.has(entry.ID) ? [] : entry.Requires.map((key) => taskIdByKey.get(key)).filter((required): required is (typeof tasks)[number] => Boolean(required) && !solvedIds.has(required!.ID))
  const railTasks: RailTask[] = tasks.map((entry) => ({ id: entry.ID, name: entry.Name, kind: taskKindKey(entry), solved: solvedIds.has(entry.ID), waitsFor: unsolvedRequires(entry).map((required) => tasks.indexOf(required) + 1) }))
  const index = task ? tasks.indexOf(task) : -1
  const step = (at: number, direction: "prev" | "next") => tasks[at] ? { label: t(direction === "prev" ? "ed.d.task.prev" : "ed.d.task.next"), select: () => setSelected(tasks[at].ID) } : undefined
  const labReadyForCheck = ready && !expired
  const resolveStatus = isStatic ? STATIC_STATUS : status ?? PENDING_STATUS
  const values = task ? participantValues(task, resolveStatus, labReadyForCheck && !isStatic) : null
  const stateView = task?.Check.State ? stateTaskView(task, status?.StateTasks?.find((entry) => entry.TaskID === task.ID), variant.Topology.Devices, status) : null
  const solvedAt = !task || !solvedIds.has(task.ID) ? null : solvedAtById[task.ID] ?? (stateView?.solvedAt ? new Date(stateView.solvedAt).getTime() : true)
  const openingKey = deploy.link === "opening" && deploy.linkKey && values
    ? Object.entries(values.external).find(([, target]) => `${target.device}:${target.port}` === deploy.linkKey)?.[0] ?? null : null
  const imageNote = isStatic ? null : imageWarningText(status)
  const endingLine = !isStatic && ready && !expired && Boolean(deploy.deployId) && (Boolean(endingAt) || endsSoon)
  const endingTime = endingAt ?? expiresAt
  const unavailableImages = deploy.error ? unavailableImagesOf(deploy.errorCause) : null
  const failedList = failedDevices(status?.Devices)
  const initFailedList = (status?.Devices ?? []).filter((device) => device.Bootstrap?.Phase === "failed")
  const showDock = !isStatic && !labFailed && !expired && !startFailed && Boolean(deploy.deployId || deploy.busy || status)
  const dockOpen = wide ? dockShown : sheetOpen
  const toggleDock = () => (wide ? setDockShown(!dockShown) : setSheetOpen(!sheetOpen))
  const canEnd = Boolean(deploy.deployId)
  const askEnd = () => { setEndError(""); setEndOpen(true) }

  const failure = labFailed ? (
    startFailed && isNoTestLabRoom(deploy.errorCause)
      ? <NoRoomPanel className="min-h-0 flex-1" error={deploy.errorCause} variant={variant} resources={load.meta.resources} onRetry={retry} />
      : startFailed && unavailableImages
        ? <LoadError className="min-h-0 flex-1" error={deploy.errorCause} message={t("exercises.image.startRefused")} onRetry={retry} details={<UnavailableImages images={unavailableImages} />} />
        : <LoadError className="min-h-0 flex-1" error={deploy.errorCause}
          message={startFailed ? t(deploy.error ? "ed.d.fail.startReason" : "ed.d.fail.start", { reason: exerciseErrorMessage(deploy.errorCause) }) : t("ed.d.fail.deploy")}
          help={!startFailed ? t("ed.d.fail.deployHelp") : undefined} onRetry={retry}
          details={failedList.length + initFailedList.length > 0 ? <div className="w-full max-w-xl space-y-2 text-left">
            {failedList.map((device) => <div key={device.Name} className="space-y-1"><div className="font-mono text-xs text-muted-foreground">{device.Name}</div><DeviceFailure device={device} /></div>)}
            {initFailedList.map((device) => <div key={device.Name} className="space-y-1 rounded-md bg-[var(--ib-warn-bg)] p-3 text-xs text-foreground" role="alert">
              <div className="font-mono text-muted-foreground">{device.Name}</div>
              <div>{device.Bootstrap?.Reason ? t("ed.d.dev.initFailedReason", { reason: device.Bootstrap.Reason }) : t("ed.d.dev.initFailed")}</div>
            </div>)}
          </div> : undefined} />
  ) : null

  const dock = showDock && <LabDock tab={tab} onTab={setTab} topology={variant.Topology} status={status} chip={chip} deployId={deploy.deployId ?? ""} tasks={tasks} currentTaskId={task?.ID ?? null}
    solvedIds={solvedIds} expanded={expanded} onToggleDevice={(name) => setExpanded((current) => { const next = new Set(current); if (!next.delete(name)) next.add(name); return next })}
    actions={actions} schemaSelected={schemaSelected} onSchemaSelect={selectNode} onFull={() => setSchemaFull(true)} author={authorShown} sheet={!wide}
    onClose={() => (wide ? setDockShown(false) : setSheetOpen(false))} />

  return <div className="flex h-dvh flex-col bg-background" onKeyDown={(event) => { if (event.key === "Escape" && sheetOpen && !wide) setSheetOpen(false) }}>
    <LabHeader title={load.meta.exercise.Name} subtitle={t("ed.d.header.subtitle", { variant: t("admin.exDraft.variantN", { n: load.meta.variantNumber }) })} backHref={exerciseHref(exerciseId)}
      progress={{ done: tasks.filter((entry) => solvedIds.has(entry.ID)).length, total: tasks.length }} chip={isStatic ? null : chip} isStatic={isStatic} left={left}
      vpn={isStatic ? null : vpn} onVpn={() => setVpnOpen(true)} authorShown={authorShown} onToggleAuthor={() => setAuthorShown(!authorShown)}
      dockShown={dockOpen} onToggleDock={toggleDock} canExtend={!isStatic && ready && !expired && Boolean(deploy.deployId)} onExtend={() => void extend()} canEnd={canEnd} endBusy={ending || ended} onEnd={askEnd} panel={showDock} />

    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Notices stand above the content, in the flow: nothing the participant reads is ever covered by them. */}
      {(deploy.link === "error" || imageNote || endingLine) && <div className="shrink-0 border-b border-border bg-background">
        {deploy.link === "error" && <LoadError compact error={deploy.linkError}
          message={deploy.linkError instanceof PopupBlockedError ? t("admin.exDeploy.linkPopupBlocked") : t("admin.exDeploy.linkFailed")} onRetry={deploy.retryLink} />}
        {imageNote && <p className="px-4 py-1.5 text-xs text-muted-foreground">{imageNote}</p>}
        {endingLine && endingTime && <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[var(--ib-warn-bg)] px-4 py-2 text-sm text-foreground">
          <Clock aria-hidden="true" size={16} className="shrink-0 text-[var(--ib-warn)]" />
          <span className="min-w-0 flex-1">{t("ed.d.extend.ending", { time: formatClock(endingTime) })}</span>
          <Button type="button" busy={extending} busyLabel={t("ed.d.extend.busy")} onClick={() => void extend()}>{t("ed.d.extend.action")}</Button>
        </div>}
      </div>}

      {failure ?? (expired ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <EmptyState className="min-h-0 py-0" message={t("ed.d.expired")} />
          <Button type="button" variant="destructive" onClick={askEnd}>{t("ed.d.header.end")}</Button>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState className="min-h-0 flex-1" message={t("ed.d.noTasks")} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <TaskRail tasks={railTasks} selectedId={task?.ID ?? null} onSelect={setSelected} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TaskSwitcher tasks={railTasks} selectedId={task?.ID ?? null} onSelect={setSelected} />
            <section id="lab-task" aria-label={t("ed.d.task.region")} tabIndex={-1} className="@container min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
              <div className={cn("flex flex-col gap-6", consoleDevice && "@[980px]:flex-row @[980px]:items-start")}>
                <div className="min-w-0 flex-1">
                  {task && values && <ParticipantTask key={task.ID} task={task} number={index + 1} values={values} deployId={deploy.deployId} labReady={labReadyForCheck}
                    waitingForLab={!isStatic && !ready} locked={unsolvedRequires(task).map((entry) => ({ key: entry.Key, name: entry.Name }))}
                    randomFlag={isStatic && taskKindKey(task) !== "state" && (task.Check.Answer?.Values ?? []).length === 0} solvedAt={solvedAt} stateView={stateView}
                    openingKey={openingKey} onSolved={(id) => setSolvedAtById((current) => ({ ...current, [id]: Date.now() }))}
                    onOpenExternal={(target, destination) => (target.port === CONSOLE_PORT ? openConsole(target.device) : deploy.openLink(target.device, target.port, destination))}
                    revealed={revealed} onReveal={(id) => setRevealed((current) => new Set(current).add(id))} onGoTo={(key) => { const target = taskIdByKey.get(key); if (target) setSelected(target.ID) }}
                    prev={step(index - 1, "prev")} next={step(index + 1, "next")} />}
                </div>
                {consoleDevice && deploy.deployId && <div ref={consoleRef} className="min-w-0 @[980px]:sticky @[980px]:top-0 @[980px]:w-[46%] @[980px]:shrink-0">
                  <ConsolePanel key={consoleDevice} deployId={deploy.deployId} device={consoleDevice} allowed={consoleSupport.state !== "disabled"} reason={consoleSupport.state === "disabled" ? consoleSupport.reason : ""}
                    onClose={() => setConsoleDevice(null)} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background" />
                </div>}
              </div>
            </section>
          </div>
          {showDock && wide && dockShown && <div className={cn("hidden min-h-0 shrink-0 border-l border-border min-[1100px]:flex", tab === "schema" ? "w-[30rem]" : "w-96")}>{dock}</div>}
        </div>
      ))}

      {/* Under the wide breakpoint the panel is a sheet over the page, under the header. */}
      {showDock && !wide && sheetOpen && <>
        <div aria-hidden="true" className="absolute inset-0 z-30 bg-[var(--ib-backdrop)]" onClick={() => setSheetOpen(false)} />
        <div role="dialog" aria-modal="true" aria-label={t("ed.d.dock.label")} className="absolute inset-y-0 right-0 z-40 flex w-full max-w-md border-l border-border bg-background">{dock}</div>
      </>}
    </div>

    <VpnDialog open={vpnOpen} ready={vpn.ready} config={status?.VPNConfig ?? ""} connected={vpn.connected} probeUrl={status?.VPNProbeURL} onClose={() => setVpnOpen(false)} />
    {variant.Topology.Devices.length > 0 && <SchemaFull open={schemaFull} onClose={() => setSchemaFull(false)} topology={variant.Topology} status={status} actions={actions} />}
    <ResetDeviceDialog deployId={deploy.deployId ?? ""} device={resetDevice} onClose={() => setResetDevice(null)} />
    <ConfirmDialog open={endOpen} tone="danger" busy={ending} error={endError} title={t("ed.d.end.title")}
      description={t(isStatic ? "ed.d.end.descriptionStatic" : othersRunning ? "ed.d.end.descriptionOthers" : "ed.d.end.description")} confirmLabel={t("ed.d.end.confirm")} busyLabel={t("ed.d.end.busy")} cancelLabel={t("ed.d.cancel")}
      onCancel={() => setEndOpen(false)} onConfirm={() => void endTest()} />
  </div>
}
