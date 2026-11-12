"use client"

import { useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, History, Maximize2, Terminal, X } from "lucide-react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { TopologyDiagram, type TopologyNodeStatus } from "@/components/exercises/TopologyDiagram"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { labNodeInfo, labTopology } from "@/lib/labTopology"
import { hasConsole, isDeviceFailed, stageFor, type DeviceStage } from "@/lib/testLab"
import { SidePanel, SummaryList, type SummaryRow } from "../kit/SidePanel"
import { deviceKindText, initText, stageText, type DeviceActions } from "./DeviceList"

/** Below this scale of the view the port labels are too small to read and are hidden. */
export const PORT_LABEL_MIN_SCALE = 0.75

/** The outline stage of a node on the canvas (the canvas draws the colour, the pattern and the mark). */
function nodeStatusOf(stage: DeviceStage): TopologyNodeStatus {
  switch (stage.kind) {
    case "ready": return "ready"
    case "failed": case "initFailed": return "failed"
    case "initializing": return "initializing"
    case "starting": return "starting"
    default: return "pending"
  }
}

/**
 * The read-only schema of the lab: the variant's own arrangement, every device outlined in the colour of its stage, a click
 * on a device selects it. The canvas is the editor's (zoom and pan); nothing can be moved, added or removed here.
 */
export function SchemaView({ topology, status, selected, onSelect }: {
  topology: NormalizedTopology
  status: DeployStatus | null
  selected: string | null
  onSelect: (key: string | null) => void
}) {
  const shown = useMemo(() => labTopology(topology), [topology])
  const statuses = Object.fromEntries(topology.Devices.map((device) => [device.ID, nodeStatusOf(stageFor(device, status))]))

  return <div className="absolute inset-0">
    <TopologyDiagram topology={shown} selectedNodes={selected ? [selected] : []} onNodeSelect={onSelect} onCanvasSelect={() => onSelect(null)}
      nodeStatus={statuses} minPortLabelScale={PORT_LABEL_MIN_SCALE} />
  </div>
}

/** The card of one node in the full-screen schema: its stage and what can be done with it. */
function NodeCard({ topology, status, nodeKey, actions, onClose }: {
  topology: NormalizedTopology
  status: DeployStatus | null
  nodeKey: string
  actions: DeviceActions
  onClose: () => void
}) {
  const info = labNodeInfo(topology, nodeKey, status)
  if (!info) return null
  if (info.kind !== "device") {
    const title = t(info.kind === "vpn" ? "admin.exTopo.vpn" : "admin.exTopo.internet")
    const rows: SummaryRow[] = [{ key: "subnet", label: t("admin.exTest.card.subnet"), value: <span className="font-mono">{info.subnet ?? "—"}</span> },
      { key: "dhcp", label: t("admin.exTest.card.dhcpLabel"), value: t(info.dhcp ? "admin.exTest.card.yes" : "admin.exTest.card.no") }]
    // What is in force for connections the lab starts to the VPN clients (absent for a lab without a VPN).
    if (info.kind === "vpn" && status?.VPNReverse) rows.push({ key: "reverse", label: t("ed.d.schema.reverse"), value: t(`ed.d.schema.reverse.${status.VPNReverse}`) })
    return <SidePanel title={title} onClose={onClose}><SummaryList rows={rows} /></SidePanel>
  }
  const device = topology.Devices.find((candidate) => candidate.ID === nodeKey)!
  const live = status?.Devices?.find((entry) => entry.Name === device.Name)
  const stage = stageFor(device, status)
  const ready = stage.kind === "ready"
  const web = info.web[0]
  const rows: SummaryRow[] = [{ key: "stage", label: t("ed.d.dev.stage"), value: stageText(stage, live) }]
  if (info.interfaces.length > 0) rows.push({ key: "address", label: t("ed.d.dev.address"), value: info.interfaces.map((iface) => <div key={iface.name} className="font-mono">{iface.name} {iface.dhcp ? t("admin.exTest.card.dhcp") : iface.address}</div>) })
  rows.push({ key: "init", label: t("ed.d.dev.init"), value: initText(stage) })
  return <SidePanel title={device.Name} subtitle={deviceKindText(device)} onClose={onClose} footer={device.Type === "node" ? <>
    <div className="flex items-center gap-1">
      {web && <HoverTooltip text={t("ed.d.dev.openWebNamed", { device: device.Name })}>
        <span><Button type="button" variant="outline" size="icon" disabled={!ready || actions.openingKey !== null} busy={actions.openingKey === `${web.Device}:${web.Port}`}
          aria-label={t("ed.d.dev.openWebNamed", { device: device.Name })} onClick={() => actions.openWeb(web.Device, web.Port)}><ExternalLink aria-hidden="true" size={16} /></Button></span>
      </HoverTooltip>}
      {hasConsole(device) && <HoverTooltip text={actions.consoleReason || t("ed.d.dev.openConsoleNamed", { device: device.Name })}>
        <span><Button type="button" variant="outline" size="icon" disabled={!ready || Boolean(actions.consoleReason)}
          aria-label={t("ed.d.dev.openConsoleNamed", { device: device.Name })} onClick={() => actions.openConsole(device.Name)}><Terminal aria-hidden="true" size={16} /></Button></span>
      </HoverTooltip>}
    </div>
    <Button type="button" variant="outline" size="sm" onClick={() => actions.askReset(device.Name)}><History aria-hidden="true" size={14} className="mr-1.5" />{t("admin.exLive.reset")}</Button>
  </> : undefined}>
    <SummaryList rows={rows} />
  </SidePanel>
}

/** The schema over the whole screen (a dialog): the same canvas, and the card of the device that was clicked. */
export function SchemaFull({ open, onClose, topology, status, actions }: {
  open: boolean
  onClose: () => void
  topology: NormalizedTopology
  status: DeployStatus | null
  actions: DeviceActions
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const ready = topology.Devices.filter((device) => stageFor(device, status).kind === "ready").length
  return <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) { setSelected(null); onClose() } }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-(--ib-z-dialog) flex flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">{t("ed.d.schema.title")}</DialogPrimitive.Title>
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("ed.d.schema.ready", { ready, total: topology.Devices.length })}</span>
          <span className="grow" />
          <DialogPrimitive.Close asChild><Button type="button" variant="outline"><X aria-hidden="true" size={16} className="mr-1.5" />{t("ed.d.close")}</Button></DialogPrimitive.Close>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-0 min-w-0 flex-1"><SchemaView topology={topology} status={status} selected={selected} onSelect={setSelected} /></div>
          {selected && <div className="max-h-[50%] w-full shrink-0 p-3 md:max-h-none md:w-80 md:pl-0">
            <NodeCard topology={topology} status={status} nodeKey={selected} actions={actions} onClose={() => setSelected(null)} />
          </div>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

/** The «Схема» tab of the lab panel: the canvas with a button that opens it over the whole screen. */
export function SchemaTab({ topology, status, selected, onSelect, onFull }: {
  topology: NormalizedTopology
  status: DeployStatus | null
  selected: string | null
  onSelect: (key: string | null) => void
  onFull: () => void
}) {
  const stages = topology.Devices.map((device) => stageFor(device, status))
  const busy = stages.filter((stage) => stage.kind !== "ready" && !isDeviceFailed(stage)).length
  const failed = stages.filter(isDeviceFailed).length
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("ed.d.schema.title")}</h3>
      <HoverTooltip text={t("ed.d.schema.full")}>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("ed.d.schema.full")} onClick={onFull}><Maximize2 aria-hidden="true" size={16} /></Button>
      </HoverTooltip>
    </div>
    <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-md border border-border"><SchemaView topology={topology} status={status} selected={selected} onSelect={onSelect} /></div>
    <p className="text-xs text-muted-foreground">{t(busy > 0 && failed > 0 ? "ed.d.schema.summaryBoth" : busy > 0 ? "ed.d.schema.summaryBusy" : failed > 0 ? "ed.d.schema.summaryFailed" : "ed.d.schema.summary",
      { ready: stages.filter((stage) => stage.kind === "ready").length, total: topology.Devices.length, busy, failed })}</p>
  </div>
}
