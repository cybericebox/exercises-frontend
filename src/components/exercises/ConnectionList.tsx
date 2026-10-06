"use client"

import { Fragment, useState } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { ChevronDown, LocateFixed, Pencil, Plus, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { SelectMenu } from "@/components/ui/select-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { NormalizedEndpoint } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { availableDevicePorts, GATEWAY_PORT, shortForwardingPort } from "@/lib/topologyPorts"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import { RowActions } from "./RowActions"
import { FieldHelp } from "@/components/ui/field-help"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** Encode one connection endpoint into a select value: vpn | internet | device:<id>:<iface>. */
export function encodeEndpoint(ep: NormalizedEndpoint): string {
  if (ep.Kind === "device") return `device:${ep.DeviceID}:${ep.Interface}`
  return ep.Kind
}

export function decodeEndpoint(value: string): NormalizedEndpoint {
  if (value === "vpn" || value === "internet") {
    return { Kind: value, DeviceID: "", Interface: GATEWAY_PORT }
  }
  const rest = value.slice("device:".length)
  const sep = rest.indexOf(":")
  return { Kind: "device", DeviceID: rest.slice(0, sep), Interface: rest.slice(sep + 1) }
}

/**
 * ConnectionList — pairs of endpoints ("device/interface" | VPN | Internet).
 * Devices are addressed by ID (new devices already have a client-side uuid);
 * a switch/hub endpoint names one of 48 logical forwarding ports.
 */
export function ConnectionList({
  variantIndex,
  disabled,
  selectedIndex,
  onSelectIndex,
  onShowInDiagram,
  initialExpandedIndex = null,
}: {
  variantIndex: number
  disabled: boolean
  selectedIndex?: number | null
  onSelectIndex?: (index: number | null) => void
  onShowInDiagram?: (index: number) => void
  /** Row whose editor is open on mount (the canvas «Конфігурація» of a connection). */
  initialExpandedIndex?: number | null
}) {
  const { control } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Connections` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const connections = useWatch({ control, name }) ?? []
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const vpnEnabled = useWatch({ control, name: `Variants.${variantIndex}.Topology.VPN.Enabled` })
  const internetEnabled = useWatch({ control, name: `Variants.${variantIndex}.Topology.Internet.Enabled` })
  const visual = useWatch({ control, name: `Variants.${variantIndex}.Topology.VisualRender` })
  const [expandedIndex, setExpandedIndex] = useState<number | null>(initialExpandedIndex)
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const nodeCount = devices.length + (vpnEnabled ? 1 : 0) + (internetEnabled ? 1 : 0)
  const freeNodeCount = devices.filter((device) => availableDevicePorts({ Connections: connections }, device).length > 0).length
    + (["vpn", "internet"] as const).filter((kind) => (kind === "vpn" ? vpnEnabled : internetEnabled)
      && !connections.some((connection) => connection.Endpoints.some((endpoint) => endpoint.Kind === kind))).length
  const addBlockedReason = nodeCount < 2 ? t("admin.exTopo.needTwoDevices")
    : freeNodeCount < 2 ? t("admin.exTopo.needFreePorts") : null

  function endpointSummary(endpoint: NormalizedEndpoint | undefined): string {
    if (!endpoint) return t("admin.exTopo.endpoint.placeholder")
    if (endpoint.Kind === "vpn" || endpoint.Kind === "internet") {
      return `${gatewayLabelFor(visual, endpoint.Kind, t(`admin.exTopo.endpoint.${endpoint.Kind}`))} · ${endpoint.Interface || "—"}`
    }
    const device = devices.find((candidate) => candidate.ID === endpoint.DeviceID)
    if (!device) return t("admin.exTopo.endpoint.placeholder")
    return `${device.Name || t("admin.exTopo.unnamedDevice")} · ${endpoint.Interface ? shortForwardingPort(endpoint.Interface) : "—"}`
  }

  function canShowOnDiagram(index: number): boolean {
    const endpoints = connections[index]?.Endpoints ?? []
    return endpoints.length === 2 && endpoints.every((endpoint) => {
      if (!endpoint.Interface) return false
      if (endpoint.Kind === "vpn") return vpnEnabled
      if (endpoint.Kind === "internet") return internetEnabled
      return devices.some((device) => device.ID === endpoint.DeviceID)
    })
  }

  function toggleEditor(index: number) {
    setExpandedIndex((current) => current === index ? null : index)
    onSelectIndex?.(index)
  }

  function removeConnection(index: number) {
    setPendingRemoval(null)
    remove(index)
    setExpandedIndex((current) => current === null || current === index ? null : current > index ? current - 1 : current)
    onSelectIndex?.(null)
  }

  function optionsForEndpoint(connectionIndex: number, side: number) {
    const endpointOptions = [
      ...(vpnEnabled ? [{ value: "vpn", label: `${gatewayLabelFor(visual, "vpn", t("admin.exTopo.endpoint.vpn"))} · ${GATEWAY_PORT}` }] : []),
      ...(internetEnabled ? [{ value: "internet", label: `${gatewayLabelFor(visual, "internet", t("admin.exTopo.endpoint.internet"))} · ${GATEWAY_PORT}` }] : []),
      ...devices.flatMap((d) => {
        const label = d.Name || d.ID.slice(0, 8)
        return availableDevicePorts({ Connections: connections }, d, { connectionIndex, side })
          .map((port) => ({ value: `device:${d.ID}:${port}`, label: `${label} · ${shortForwardingPort(port)}` }))
      }),
    ]
    return endpointOptions.filter((option) => {
      if (option.value !== "vpn" && option.value !== "internet") return true
      return !connections.some((connection, ci) => connection.Endpoints.some((endpoint, si) =>
        !(ci === connectionIndex && si === side) && endpoint.Kind === option.value))
    })
  }

  function addConnection() {
    const index = fields.length
    append({
      Endpoints: [
        { Kind: "device", DeviceID: "", Interface: "" },
        { Kind: "device", DeviceID: "", Interface: "" },
      ],
    })
    setExpandedIndex(index)
    onSelectIndex?.(index)
  }

  function addButton() {
    const button = <Button type="button" variant="outline" size="sm" disabled={addBlockedReason !== null} onClick={addConnection}>
      <Plus className="mr-1 h-4 w-4" />
      {t("admin.exTopo.addConnection")}
    </Button>
    return addBlockedReason ? <HoverTooltip text={addBlockedReason} describe>{button}</HoverTooltip> : button
  }

  function removalDescription(index: number): string {
    const [first, second] = connections[index]?.Endpoints ?? []
    return t("admin.exTopo.removeConnectionConfirm", { first: endpointSummary(first), second: endpointSummary(second) })
  }

  return (
    <div className="flex min-h-full flex-col gap-2">
      {!disabled && fields.length > 0 && <div className="flex items-center justify-end">{addButton()}</div>}

      {fields.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center py-2">
          <EmptyState message={t("admin.exTopo.noConnections")} className="min-h-0" />
          {!disabled && <div className="mx-auto mb-3 flex">{addButton()}</div>}
        </div>
      )}

      {fields.length > 0 && <div className="min-w-0 overflow-x-auto rounded-md border border-border">
        <table aria-label={t("admin.exTopo.connections")} className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
          <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground"><tr>
            <th scope="col" className="w-14 px-3 py-2">#</th>
            <th scope="col" className="w-[39%] px-3 py-2">{t("admin.exTopo.endpoint.first")}</th>
            <th scope="col" className="w-[39%] px-3 py-2">{t("admin.exTopo.endpoint.second")}</th>
            <th scope="col" className="w-32 px-2 py-2"><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
          </tr></thead>
          <tbody className="divide-y divide-border">
          {fields.map((field, ci) => <Fragment key={field.id}><tr data-testid={`connection-row-${ci}`}
            className={`group ${selectedIndex === ci ? "bg-accent" : "hover:bg-muted/60"}`}>
            <td className="px-3 py-2 tabular-nums">
              <button type="button" aria-label={`${t("admin.exTopo.overview.editConnection")} ${ci + 1}`}
                aria-expanded={expandedIndex === ci} onClick={() => toggleEditor(ci)}
                className="flex items-center gap-1 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedIndex === ci ? "" : "-rotate-90"}`} />{ci + 1}
              </button>
            </td>
            {([0, 1] as const).map((side) => {
              const label = endpointSummary(connections[ci]?.Endpoints[side])
              return <td key={side} className="min-w-0 px-3 py-2">
                <HoverTooltip text={label} className="max-w-full"><button type="button" aria-label={label}
                  onClick={() => toggleEditor(ci)} className="block w-full truncate rounded-sm text-left focus-visible:outline-2 focus-visible:outline-primary">{label}</button></HoverTooltip>
              </td>
            })}
            <td className="px-2 py-1"><RowActions actions={[
              ...(onShowInDiagram ? [{ key: "show", label: t("admin.exTopo.overview.showOnDiagram"), icon: <LocateFixed className="h-4 w-4" />,
                disabled: !canShowOnDiagram(ci), onSelect: () => onShowInDiagram(ci) }] : []),
              { key: "edit", label: t(disabled ? "admin.exTopo.configure" : "admin.exTopo.overview.editConnection"), icon: <Pencil className="h-4 w-4" />,
                onSelect: () => toggleEditor(ci) },
              ...(disabled ? [] : [{ key: "remove", label: t("admin.exTopo.removeConnection"), icon: <Trash2 className="h-4 w-4" />, danger: true,
                onSelect: () => setPendingRemoval(ci) }]),
            ]} /></td>
          </tr>
          {expandedIndex === ci && <tr><td colSpan={4} className="p-0"><div data-testid={`connection-editor-${ci}`}
            className="grid gap-2 bg-muted/20 p-3 sm:grid-cols-2">
          {([0, 1] as const).map((side) => (
            <Controller
              key={side}
              control={control}
              name={`${name}.${ci}.Endpoints.${side}`}
              render={({ field: epField, fieldState }) => (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t(side === 0 ? "admin.exTopo.endpoint.first" : "admin.exTopo.endpoint.second")}
                    <span className="text-destructive" aria-hidden="true">*</span>
                    <FieldHelp text={t("admin.exTopo.endpoint.help")} />
                  </div>
                  <SelectMenu
                    value={epField.value.Kind === "device" && epField.value.DeviceID === ""
                      ? ""
                      : encodeEndpoint(epField.value)}
                    onChange={(v) => epField.onChange(decodeEndpoint(v))}
                    disabled={disabled}
                    placeholder={t("admin.exTopo.endpoint.placeholder")}
                    ariaLabel={t(side === 0 ? "admin.exTopo.endpoint.first" : "admin.exTopo.endpoint.second")}
                    options={optionsForEndpoint(ci, side)}
                    className="w-full"
                  />
                  <p className="min-h-5 text-xs font-medium leading-5 text-destructive">
                    {fieldState.error ? fieldState.error.message ?? t("admin.ex.val.endpointDevice") : ""}
                  </p>
                </div>
              )}
            />
          ))}
          </div></td></tr>}
          </Fragment>)}
          </tbody>
        </table>
      </div>}
      <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger"
        title={t("admin.exTopo.removeConnectionTitle")} description={pendingRemoval !== null ? removalDescription(pendingRemoval) : undefined}
        cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={t("admin.exTopo.removeConnection")}
        onConfirm={() => { if (pendingRemoval !== null) removeConnection(pendingRemoval) }} />
    </div>
  )
}
