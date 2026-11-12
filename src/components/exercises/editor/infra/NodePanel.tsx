"use client"

import { useMemo, type ReactElement } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Settings2, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { DeviceSection } from "@/lib/editorPosition"
import { deliveriesOfTask } from "@/lib/editor/refs"
import { devicePreset } from "@/lib/deviceResources"
import { amountLabel, blocksLabel } from "@/lib/presetLabels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import { shortForwardingPort } from "@/lib/topologyPorts"
import { outsideFrame } from "@/lib/deviceResources"
import { parsePlatformRef } from "../../ImageUpload"
import { useResourcesConfig } from "../../ResourcesConfigContext"
import { SidePanel, SummaryList, type SummaryRow } from "../kit"
import { useEditor } from "../context"

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>
const lines = (items: string[]) => <>{items.map((item) => <span key={item} className="block">{item}</span>)}</>

/**
 * The one side panel of every node kind (H10): a read-only summary with a header (name, close), a two-column definition
 * list whose rows open the editor on the matching section, and a pinned footer: «Налаштувати» and the trash. A control that
 * cannot act stays, disabled, with its reason.
 */
export function NodePanel({ variantIndex, nodeKey, readOnly, readOnlyReason, onClose, onConfigure, onDelete }: {
  variantIndex: number
  nodeKey: string
  /** The schema cannot be changed (viewing, or a linked variant); the editor still opens to read. */
  readOnly: boolean
  readOnlyReason: string
  onClose: () => void
  onConfigure: (section?: DeviceSection) => void
  onDelete: () => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const { goTo } = useEditor()
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  const tasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const config = useResourcesConfig()
  const device = topology?.Devices.find((candidate) => candidate.ID === nodeKey)
  const gateway = nodeKey === "vpn" || nodeKey === "internet" ? nodeKey : null

  const connections = useMemo(() => {
    if (!topology) return [] as string[]
    const nameOf = (endpoint: { Kind: string; DeviceID: string; Interface: string }) => endpoint.Kind === "device"
      ? `${topology.Devices.find((candidate) => candidate.ID === endpoint.DeviceID)?.Name || t("admin.exTopo.unnamedDevice")} · ${endpoint.Interface ? shortForwardingPort(endpoint.Interface) : "—"}`
      : `${gatewayLabelFor(topology.VisualRender, endpoint.Kind as "vpn" | "internet", t(`admin.exTopo.${endpoint.Kind}`))} · ${endpoint.Interface || "—"}`
    const mine = (endpoint: { Kind: string; DeviceID: string }) => endpoint.Kind === "device" ? endpoint.DeviceID === nodeKey : endpoint.Kind === nodeKey
    return topology.Connections.filter((connection) => connection.Endpoints.some(mine)).map((connection) => {
      const own = connection.Endpoints.find(mine) ?? connection.Endpoints[0]
      const other = connection.Endpoints.find((endpoint) => endpoint !== own) ?? connection.Endpoints[0]
      return `${own.Interface ? `${shortForwardingPort(own.Interface)} → ` : ""}${nameOf(other)}`
    })
  }, [topology, nodeKey])

  if (!topology || (!device && !gateway)) return null
  const isNode = device?.Type === "node"
  const label = gateway ? gatewayLabelFor(topology.VisualRender, gateway, t(`admin.exTopo.${gateway}`)) : device?.Name || t("admin.exTopo.unnamedDevice")
  const kindText = gateway ? t(`admin.exTopo.${gateway}`) : device?.Type === "hub" ? t("ed.c.panel.kindHub") : device?.Type === "unmanaged-switch" ? t("ed.c.panel.kindSwitch") : t("ed.c.panel.kindNode")
  const open = (section: DeviceSection) => () => onConfigure(section)
  const on = (value: boolean) => t(value ? "ed.c.panel.on" : "ed.c.panel.off")

  const linkRow: SummaryRow = { key: "links", label: t("ed.c.panel.links"), value: connections.length ? lines(connections) : muted(t("ed.c.panel.none")) }
  let rows: SummaryRow[] = []

  if (device && isNode) {
    const preset = config ? devicePreset(device, config) : null
    const image = device.Image.trim()
    const platform = parsePlatformRef(image)
    const init = [device.Bootstrap.Files.length ? t("ed.c.panel.files", { n: device.Bootstrap.Files.length }) : "", device.Bootstrap.Script ? t("ed.c.panel.script") : ""].filter(Boolean)
    const service = [device.Command.length ? t("ed.c.panel.ownCommand") : t("ed.c.panel.imageCommand"), device.Bootstrap.Env.length ? t("ed.c.panel.vars", { n: device.Bootstrap.Env.length }) : t("ed.c.panel.noVars"),
      [device.WaitReadyFile ? t("ed.c.panel.readySignal") : "", device.Persistence?.Enabled ? t("ed.c.panel.persist") : ""].filter(Boolean).join(", ")].filter(Boolean)
    const access = device.Access.map((entry) => entry.Kind === "http" ? t("ed.c.panel.accessWeb", { protocol: entry.Protocol, port: entry.Port }) : entry.Kind === "terminal" ? t("ed.c.panel.accessTerminal") : entry.Kind.toUpperCase())
    const related = tasks.flatMap((task, index) => {
      if (!task.Key && task.Check?.Kind !== "state") return []
      const parts: string[] = []
      if (task.Check?.Kind === "state" && task.Check.State.Conditions.some((condition) => condition.DeviceID === device.ID)) parts.push(t("ed.c.panel.relState"))
      for (const delivery of deliveriesOfTask(topology, task.Key).filter((item) => item.deviceId === device.ID)) {
        parts.push(delivery.kind === "file" ? t("ed.c.panel.relFile", { path: delivery.path }) : delivery.kind === "env" ? t("ed.c.panel.relEnv", { name: delivery.name }) : t("ed.c.panel.relScript"))
      }
      return parts.length ? [{ index, name: task.Name || t("ed.c.panel.taskN", { n: index + 1 }), parts }] : []
    })
    rows = [
      { key: "image", label: t("ed.c.panel.image"), onSelect: open("main"), value: image ? <span className="font-mono text-[13px]">{platform?.name ?? image}</span> : muted(t("ed.c.panel.imageEmpty")) },
      { key: "profile", label: t("ed.c.panel.profile"), onSelect: open("main"), value: t(`ed.c.profile.${device.Profile}`) },
      { key: "resources", label: t("ed.c.panel.resources"), onSelect: open("main"), value: preset && config
        ? <>{t(`exercises.res.preset.${preset.ID}`)}, {blocksLabel(preset.Blocks)} · {amountLabel(preset.CPUMillicores, preset.MemoryBytes)}{outsideFrame(preset.Blocks, config) && <span className="ml-1 text-[var(--ib-warn)]">{t("exercises.res.tag.approval")}</span>}</>
        : device.ResourcePreset ? t("admin.exTopo.resourcesPreset", { preset: device.ResourcePreset }) : muted(t("admin.exTopo.resourcesDefault")) },
      { key: "interfaces", label: t("ed.c.panel.interfaces"), onSelect: open("network"), value: device.Interfaces.length
        ? <>{device.Interfaces.map((iface) => <span key={iface.Name} className="block"><span className="font-mono text-[13px]">{iface.Name}</span> {ifaceWords(iface.IP)}</span>)}</> : muted(t("ed.c.panel.none")) },
      { key: "init", label: t("ed.c.panel.init"), onSelect: open("init"), value: init.length ? lines(init) : muted(t("ed.c.panel.none")) },
      { key: "service", label: t("ed.c.panel.service"), onSelect: open("service"), value: lines(service) },
      { key: "access", label: t("ed.c.panel.access"), onSelect: open("access"), value: access.length ? lines(access) : muted(t("ed.c.panel.none")) },
      { key: "tasks", label: t("ed.c.panel.tasks"), value: related.length
        ? <>{related.map((item) => <span key={item.index} className="block"><button type="button" className="text-left text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={t("ed.c.panel.openTask", { name: item.name })} onClick={() => goTo({ tab: "tasks", variant: variantIndex, task: item.index })}>{item.name}</button> <span className="text-muted-foreground">{item.parts.join(", ")}</span></span>)}</>
        : muted(t("ed.c.panel.none")) },
    ]
  } else if (gateway) {
    const network = gateway === "vpn" ? topology.VPN : topology.Internet
    const ranges = (network.DHCPRanges ?? []).map((range) => `.${range.Start}–.${range.End}`)
    rows = [
      ...(gateway === "vpn" ? [{ key: "reverse", label: t("ed.c.panel.reverse"), onSelect: () => onConfigure(), value: t(network.ReverseConnections ? "ed.c.panel.allowed" : "ed.c.panel.denied") }] : []),
      { key: "dhcp", label: t("ed.c.panel.dhcp"), onSelect: () => onConfigure(), value: on(network.DHCP) },
      ...(network.DHCP ? [
        { key: "ranges", label: t("ed.c.panel.ranges"), onSelect: () => onConfigure(), value: ranges.length ? <span className="font-mono text-[13px]">{ranges.join(", ")}</span> : muted(t("ed.c.panel.allAddresses")) },
        ...(gateway === "internet" ? [{ key: "dns", label: t("ed.c.panel.dns"), onSelect: () => onConfigure(), value: network.DNS ? <span className="font-mono text-[13px]">{network.DNS}</span> : muted(t("ed.c.panel.dnsNone")) }] : []),
      ] : []),
      linkRow,
    ]
  } else if (device) {
    rows = [{ key: "type", label: t("ed.c.panel.type"), value: kindText }, linkRow, { key: "ports", label: t("ed.c.panel.ports"), value: t("ed.c.panel.portsAuto") }]
  }

  const hasSettings = isNode || Boolean(gateway)
  const settingsLabel = readOnly ? t("ed.c.panel.view") : t("ed.c.panel.configure")
  const settingsReason = hasSettings ? null : t("ed.c.panel.noSettings")
  const deleteReason = readOnly ? readOnlyReason : null
  const guarded = (control: ReactElement, reason: string | null) => reason ? <HoverTooltip text={reason} describe="always">{control}</HoverTooltip> : control

  return <SidePanel title={label} subtitle={kindText} onClose={onClose} className="bg-background"
    footer={<>
      {guarded(<Button type="button" variant="outline" aria-disabled={settingsReason ? true : undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => { if (!settingsReason) onConfigure() }}><Settings2 aria-hidden="true" className="mr-1.5 h-4 w-4" />{settingsLabel}</Button>, settingsReason)}
      {guarded(<Button type="button" variant="outline" size="icon" aria-label={t("ed.c.panel.delete")} aria-disabled={deleteReason ? true : undefined}
        className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => { if (!deleteReason) onDelete() }}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>, deleteReason ?? t("ed.c.panel.delete"))}
    </>}>
    <SummaryList rows={rows} />
  </SidePanel>
}

function ifaceWords(ip: DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Interfaces"][number]["IP"]): string {
  if (ip.Type === "static") return ip.AddressRef ? t("ed.c.net.fromNetwork", { network: t(ip.AddressRef.Network === "vpn" ? "ed.c.net.vpnShort" : "ed.c.net.internetShort"), host: ip.AddressRef.Host }) : ip.Addresses.join(", ") || "—"
  return t(ip.Type === "dhcp" ? "admin.exTopo.ip.dhcp" : ip.Type === "dhcp-preset" ? "admin.exTopo.ip.dhcpPreset" : "ed.c.net.noIp")
}
