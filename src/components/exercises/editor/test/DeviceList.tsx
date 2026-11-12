"use client"

import { useEffect, useState } from "react"
import { ChevronRight, CircleCheck, Clock, ExternalLink, History, TriangleAlert, Terminal, MoreHorizontal } from "lucide-react"

import { resetDeployDevice, type DeployDeviceStatus, type DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedDevice, NormalizedTopology } from "@/api/exercises/versions"
import { DeviceFailure, DeviceLiveInfo } from "@/components/exercises/DeviceLiveInfo"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { earliestQueuedAt, failureReasonLabel, startingNote } from "@/lib/deviceLive"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { labNodeInfo } from "@/lib/labTopology"
import { BOOTSTRAP_MAX_ATTEMPTS, formatElapsed, stageFor, hasConsole, isDeviceBusy, type DeviceStage, type LabChip } from "@/lib/testLab"
import { useLongWait } from "@/lib/useLabWaitStage"
import { cn } from "@/utils/cn"

/** The words for where a device is on its way up. */
export function stageText(stage: DeviceStage, device: DeployDeviceStatus | undefined): string {
  switch (stage.kind) {
    case "ready": return t("ed.d.dev.ready")
    case "failed": return t("ed.d.dev.failed", { reason: failureReasonLabel(device?.Scheduling?.Failure?.Reason ?? "") })
    case "initFailed": return t("ed.d.dev.initFailed")
    case "initializing": return t("ed.d.dev.initializing", { n: stage.attempt, max: BOOTSTRAP_MAX_ATTEMPTS })
    case "starting": return t("ed.d.dev.starting")
    case "queued": return t("ed.d.dev.queued")
    default: return t("ed.d.dev.waiting")
  }
}

export function initText(stage: DeviceStage): string {
  if (!stage.hasInit) return t("ed.d.dev.initNone")
  if (stage.kind === "ready") return stage.attempt > 1 ? t("ed.d.dev.initDoneAttempt", { n: stage.attempt, max: BOOTSTRAP_MAX_ATTEMPTS }) : t("ed.d.dev.initDone")
  if (stage.kind === "initFailed") return t("ed.d.dev.initFailedAttempt", { n: stage.attempt, max: BOOTSTRAP_MAX_ATTEMPTS })
  if (stage.kind === "initializing") return t("ed.d.dev.initAttempt", { n: stage.attempt, max: BOOTSTRAP_MAX_ATTEMPTS })
  return t("ed.d.dev.initWaiting")
}

function StageIcon({ stage }: { stage: DeviceStage }) {
  if (stage.kind === "ready") return <CircleCheck aria-hidden="true" size={18} className="text-[var(--ib-ok)]" />
  if (stage.kind === "failed" || stage.kind === "initFailed") return <TriangleAlert aria-hidden="true" size={18} className="text-destructive" />
  if (stage.kind === "waiting" || stage.kind === "queued") return <Clock aria-hidden="true" size={18} className="text-muted-foreground" />
  return <Spinner size="sm" label={t("admin.loading")} />
}

/** The strip under a starting device: one segment per step, filled up to the step reached. */
function Segments({ stage }: { stage: DeviceStage }) {
  if (stage.kind === "ready") return null
  const bad = stage.kind === "failed" || stage.kind === "initFailed"
  return <span aria-hidden="true" className="mt-1.5 flex gap-1">
    {Array.from({ length: stage.steps }, (_, index) => <i key={index} className={cn("h-1 flex-1 rounded-full bg-border", index <= stage.step && (bad ? "bg-destructive" : "bg-primary"))} />)}
  </span>
}

/** Resets one device to its initial image after a danger confirmation. */
export function ResetDeviceDialog({ deployId, device, onClose }: { deployId: string; device: string | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function reset() {
    if (!device) return
    setBusy(true)
    setError("")
    try {
      await resetDeployDevice(deployId, device)
      toast.success(t("admin.exLive.resetDone"))
      onClose()
    } catch (cause) {
      setError(t("admin.exLive.resetFailed", { reason: exerciseErrorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }
  return <ConfirmDialog open={device !== null} tone="danger" busy={busy} error={error} title={t("admin.exLive.resetTitle")}
    description={t("ed.d.dev.resetDescription", { device: device ?? "" })} confirmLabel={t("admin.exLive.reset")} busyLabel={t("admin.exLive.resetting")}
    cancelLabel={t("ed.d.cancel")} onCancel={() => { setError(""); onClose() }} onConfirm={() => void reset()} />
}

export type DeviceActions = {
  openWeb: (device: string, port: number) => void
  openConsole: (device: string) => void
  askReset: (device: string) => void
  openingKey: string | null
  /** Why the console cannot be used in every lab, or "" when it can. */
  consoleReason: string
}

/** The kind of a device in words: a node is «вузол», a hub «концентратор», a switch «комутатор». */
export const deviceKindText = (device: NormalizedDevice) => t(`ed.d.dev.kind.${device.Type === "node" ? "node" : device.Type === "hub" ? "hub" : "switch"}`)

function DeviceRow({ device, live, status, topology, expanded, onToggle, actions, deployId, author }: {
  device: NormalizedDevice
  live: DeployDeviceStatus | undefined
  status: DeployStatus | null
  topology: NormalizedTopology
  expanded: boolean
  onToggle: () => void
  actions: DeviceActions
  deployId: string
  author: boolean
}) {
  const stage = stageFor(device, status)
  const isNode = device.Type === "node"
  const failed = stage.kind === "failed" || stage.kind === "initFailed"
  const open = isNode && (failed ? !expanded : expanded)
  const web = (status?.Access ?? []).filter((access) => access.Device === device.Name)
  const ready = stage.kind === "ready"
  const info = labNodeInfo(topology, device.ID, status)
  const rows: [string, React.ReactNode][] = []
  if (info?.kind === "device" && info.interfaces.length > 0) rows.push([t("ed.d.dev.address"), info.interfaces.map((iface) => <div key={iface.name} className="font-mono">{iface.name} {iface.dhcp ? t("admin.exTest.card.dhcp") : iface.address}</div>)])
  rows.push([t("ed.d.dev.init"), initText(stage)])
  if (author && stage.hasInit && device.Bootstrap.Timeout) rows.push([t("ed.d.dev.limit"), <span key="limit" className="font-mono">{device.Bootstrap.Timeout}</span>])
  const access = [web.length > 0 ? t("ed.d.dev.accessWeb", { port: web[0].Port, protocol: web[0].Protocol }) : "", hasConsole(device) ? t("ed.d.dev.accessConsole") : ""].filter(Boolean)
  if (access.length > 0) rows.push([t("ed.d.dev.access"), access.join(", ")])

  return <div data-device={device.Name} data-stage={stage.kind} className="border-b border-border last:border-b-0">
    <div className="group relative flex items-start gap-1 py-2">
      <button type="button" disabled={!isNode} aria-expanded={isNode ? open : undefined} onClick={onToggle} id={`dev-row-${device.Name}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-primary enabled:hover:bg-[var(--ib-hover)]">
        <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center"><StageIcon stage={stage} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm"><span className="font-mono font-semibold text-foreground">{device.Name}</span> <span className="text-xs text-muted-foreground">{deviceKindText(device)}</span></span>
          <span className={cn("block text-sm", ready ? "text-[var(--ib-ok)]" : failed ? "text-destructive" : "text-muted-foreground")}>{stageText(stage, live)}</span>
          <Segments stage={stage} />
        </span>
        {isNode && <ChevronRight aria-hidden="true" size={16} className={cn("mt-1 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />}
      </button>
      {isNode && <div className="absolute right-7 top-1.5 flex items-center rounded-md bg-background opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {hasConsole(device) && <HoverTooltip text={actions.consoleReason || t(ready ? "ed.d.dev.openConsole" : "ed.d.dev.consoleLater")}>
          <span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={!ready || Boolean(actions.consoleReason)} aria-label={t("ed.d.dev.openConsoleNamed", { device: device.Name })} onClick={() => actions.openConsole(device.Name)}><Terminal aria-hidden="true" size={16} /></Button></span>
        </HoverTooltip>}
        {web.length > 0 && <HoverTooltip text={t(ready ? "ed.d.dev.openWeb" : "ed.d.dev.webLater", { device: device.Name })}>
          <span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" busy={actions.openingKey === `${web[0].Device}:${web[0].Port}`} disabled={!ready || actions.openingKey !== null}
            aria-label={t("ed.d.dev.openWebNamed", { device: device.Name })} onClick={() => actions.openWeb(web[0].Device, web[0].Port)}><ExternalLink aria-hidden="true" size={16} /></Button></span>
        </HoverTooltip>}
        <DropdownMenu>
          <HoverTooltip text={t("ed.d.dev.actions")}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("ed.d.dev.actionsNamed", { device: device.Name })}><MoreHorizontal aria-hidden="true" size={16} /></Button>
            </DropdownMenuTrigger>
          </HoverTooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem disabled={isDeviceBusy(stage)} onSelect={() => actions.askReset(device.Name)} className="items-start text-destructive focus:text-destructive">
              <History aria-hidden="true" size={16} className="mr-2 mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col"><span>{t("admin.exLive.reset")}</span>
                <span className="whitespace-normal text-xs text-muted-foreground">{t(isDeviceBusy(stage) ? "ed.d.dev.resetBusy" : "ed.d.dev.resetHint")}</span></span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </div>
    {open && <div className="space-y-3 pb-3 pl-9 pr-1">
      <dl className="m-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 break-words text-foreground">{value}</dd></div>)}
      </dl>
      {stage.kind === "failed" && live && <DeviceFailure device={live} />}
      {stage.kind === "initFailed" && <div role="alert" className="space-y-2 rounded-md bg-destructive/10 p-3 text-xs text-foreground">
        <div className="flex items-start gap-2 font-medium"><TriangleAlert aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-destructive" />
          <span>{stage.reason ? t("ed.d.dev.initFailedReason", { reason: stage.reason }) : t("ed.d.dev.initFailed")}</span></div>
        <Button type="button" variant="outline" size="sm" onClick={() => actions.askReset(device.Name)}><History aria-hidden="true" size={14} className="mr-1.5" />{t("admin.exLive.reset")}</Button>
      </div>}
      {live && stage.kind === "ready" && <DeviceLiveInfo deployId={deployId} device={live} />}
    </div>}
  </div>
}

/** While the lab starts: how long it has been going, plus a calm second line after 30 s. Mounted only while starting. */
function StartBar({ status }: { status: DeployStatus | null }) {
  const longWait = useLongWait(status)
  const queuedAt = earliestQueuedAt(status?.Devices)
  const [since] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <section className="border-b border-border pb-3">
    <div className="flex items-center justify-between gap-2">
      <FieldLabel as="span" text={t("ed.d.dock.startTitle")} className="text-xs font-semibold uppercase tracking-wider" help={{ intro: t("ed.d.dock.startHelp"), default: t("ed.d.dock.startHelpNote") }} />
      <span className="text-xs text-muted-foreground">{t("ed.d.dock.elapsed", { time: formatElapsed(now - (queuedAt ?? since)) })}</span>
    </div>
    {/* Laid out always, so the line appearing moves nothing. */}
    <p className={cn("mt-2 min-h-8 text-xs text-muted-foreground", !longWait && "invisible")}>{startingNote(status?.Queue, true)}</p>
  </section>
}

/** The first stage, before any device is known: the crest in the middle of the block, with the place in the queue. */
function CreatingBlock({ chip, queueMessage }: { chip: LabChip; queueMessage: string | null }) {
  return <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 text-center">
    <Spinner size="lg" label={t("ed.d.dock.creating")} />
    <p className="text-sm text-muted-foreground">{t(chip.kind === "removing" ? "ed.d.dock.removing" : "ed.d.dock.creating")}</p>
    {queueMessage && <p className="text-xs text-muted-foreground">{queueMessage}</p>}
  </div>
}

/** The «Пристрої» tab of the lab panel: how far the start is, then every device with its stage and what can be done with it. */
export function DeviceList({ topology, status, chip, deployId, expanded, onToggle, actions, author }: {
  topology: NormalizedTopology
  status: DeployStatus | null
  chip: LabChip
  deployId: string
  /** The devices whose row was toggled: a row is shut by default and open for it, a failed one is open by default and shut for it. */
  expanded: ReadonlySet<string>
  onToggle: (device: string) => void
  actions: DeviceActions
  author: boolean
}) {
  if (!status || chip.kind === "creating" || chip.kind === "queued" || chip.kind === "removing") {
    const queue = chip.queuePosition !== null ? t("ed.d.dock.queue", { position: chip.queuePosition, length: status?.Queue?.Length ?? chip.queuePosition }) : null
    return <CreatingBlock chip={chip} queueMessage={queue} />
  }
  const starting = chip.kind === "starting" && !status.Ready
  const known = topology.Devices.map((device) => ({ device, live: status.Devices?.find((entry) => entry.Name === device.Name) }))
  const ready = known.filter(({ device }) => stageFor(device, status).kind === "ready").length
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    {starting && <StartBar status={status} />}
    <section>
      <div className="pb-1"><FieldLabel as="span" text={t("ed.d.dock.devices", { ready, total: known.length })} className="text-xs font-semibold uppercase tracking-wider"
        help={{ intro: t("ed.d.dock.devicesHelp"), items: [{ term: t("ed.d.dev.init"), text: t("ed.d.dock.initHelp", { max: BOOTSTRAP_MAX_ATTEMPTS }) }] }} /></div>
      <div>{known.map(({ device, live }) => <DeviceRow key={device.ID} device={device} live={live} status={status} topology={topology} deployId={deployId} author={author}
        expanded={expanded.has(device.Name)} onToggle={() => onToggle(device.Name)} actions={actions} />)}</div>
    </section>
  </div>
}
