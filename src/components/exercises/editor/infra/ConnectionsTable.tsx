"use client"

import { Fragment, useEffect, useState } from "react"
import { Controller, get, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { useErrorsAt } from "../fieldErrors"
import { ChevronRight, LocateFixed, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { SelectMenu } from "@/components/ui/select-menu"
import { Table, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW } from "@/components/ui/table"
import type { NormalizedEndpoint } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { availableDevicePorts, shortForwardingPort } from "@/lib/topologyPorts"
import { gatewayClashOfLink } from "@/lib/editor/schemas/infra"
import { TableHeadHelp } from "./TableHeadHelp"
import { cn } from "@/utils/cn"
import { AddButton, FieldError, RowActions, fieldProps, useFieldError } from "../kit"
import { InActionsSlot } from "./ActionsSlot"

/** One connection endpoint as a select value: device:<id>:<iface> (a gateway is a device with its one port). */
export function encodeEndpoint(ep: NormalizedEndpoint): string {
  return `device:${ep.DeviceID}:${ep.Interface}`
}

export function decodeEndpoint(value: string): NormalizedEndpoint {
  const rest = value.slice("device:".length)
  const separator = rest.indexOf(":")
  return { Kind: "device", DeviceID: rest.slice(0, separator), Interface: rest.slice(separator + 1) }
}

/**
 * «Зʼєднання»: pairs of endpoints (device and port, the VPN gateway, the Internet). A row opens by its chevron or a click
 * (no pencil) into two dropdowns; the row actions are «показати на схемі» and the trash.
 */
export function ConnectionsTable({ variantIndex, readOnly, expandedIndex, onExpand, selectedIndex, onShow, onAdded }: {
  variantIndex: number
  readOnly: boolean
  expandedIndex: number | null
  onExpand: (index: number | null) => void
  selectedIndex: number | null
  onShow: (index: number) => void
  onAdded: (index: number) => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Connections` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const connections = useWatch({ control, name }) ?? []
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const errorRows = get(useErrorsAt(name), name) as unknown
  const firstBad = Array.isArray(errorRows) ? errorRows.findIndex(Boolean) : -1
  useEffect(() => {
    if (firstBad >= 0) onExpand(firstBad)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new error opens its row once
  }, [firstBad])

  const nodeCount = devices.length
  const freeNodeCount = devices.filter((device) => availableDevicePorts({ Connections: connections }, device).length > 0).length
  const addBlockedReason = nodeCount < 2 ? t("admin.exTopo.needTwoDevices") : freeNodeCount < 2 ? t("admin.exTopo.needFreePorts") : null

  function endpointSummary(endpoint: NormalizedEndpoint | undefined): string {
    if (!endpoint) return t("admin.exTopo.endpoint.placeholder")
    const device = devices.find((candidate) => candidate.ID === endpoint.DeviceID)
    if (!device) return t("admin.exTopo.endpoint.placeholder")
    return `${device.Name || t("admin.exTopo.unnamedDevice")} · ${endpoint.Interface ? shortForwardingPort(endpoint.Interface) : "—"}`
  }
  function canShow(index: number): boolean {
    const endpoints = connections[index]?.Endpoints ?? []
    return endpoints.length === 2 && endpoints.every((endpoint) => {
      if (!endpoint.Interface) return false
      return devices.some((device) => device.ID === endpoint.DeviceID)
    })
  }
  function options(connectionIndex: number, side: number) {
    // A link that would put a second gateway into one network is offered disabled, with the reason.
    const others = connections.filter((_, index) => index !== connectionIndex)
    const other = connections[connectionIndex]?.Endpoints[side === 0 ? 1 : 0]
    const otherChosen = other && other.DeviceID !== "" && other.Interface !== "" ? other : null
    return devices.flatMap((device) => availableDevicePorts({ Connections: connections }, device, { connectionIndex, side })
      .map((port) => {
        const clash = otherChosen ? gatewayClashOfLink({ Devices: devices, Connections: others }, { DeviceID: device.ID, Interface: port }, otherChosen) : null
        return { value: `device:${device.ID}:${port}`, label: `${device.Name || device.ID.slice(0, 8)} · ${shortForwardingPort(port)}`,
          ...(clash ? { disabled: true, description: t("ed.c.gw.networkTaken", { name: clash }) } : {}) }
      }))
  }
  function add() {
    const index = fields.length
    append({ Endpoints: [{ Kind: "device", DeviceID: "", Interface: "" }, { Kind: "device", DeviceID: "", Interface: "" }] })
    onAdded(index)
  }
  function removeConnection(index: number) {
    setPendingRemoval(null)
    remove(index)
    onExpand(null)
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <InActionsSlot>{!readOnly && <AddButton label={t("admin.exTopo.addConnection")} onClick={add} blockedReason={addBlockedReason} />}</InActionsSlot>
    {fields.length === 0
      ? <div className="flex min-h-48 flex-1 items-center justify-center rounded-md border border-border"><EmptyState message={t("admin.exTopo.noConnections")} /></div>
      : <Table label={t("admin.exTopo.connections")} className="min-w-[36rem] table-fixed" regionClassName="rounded-md border border-border">
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-24 px-0")}><div className="pl-10"><TableHeadHelp text="#" help={{ intro: t("ed.c.th.index") }} /></div></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[39%]")}><TableHeadHelp text={t("admin.exTopo.endpoint.first")} help={{ intro: t("ed.c.th.first") }} /></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[39%]")}><TableHeadHelp text={t("admin.exTopo.endpoint.second")} help={{ intro: t("ed.c.th.second") }} /></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-24 px-1")}><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, ci) => {
            const open = expandedIndex === ci
            return <Fragment key={field.id}>
              <tr data-testid={`connection-row-${ci}`} data-selected={selectedIndex === ci || undefined} className="group h-[49px] cursor-default transition-colors hover:bg-[var(--ib-hover)] data-[selected]:bg-accent/60"
                onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) onExpand(open ? null : ci) }}>
                <td className={cn(TABLE_CELL, "px-0 tabular-nums")}>
                  <button type="button" aria-expanded={open} aria-label={t("admin.exTopo.overview.editConnectionN", { n: ci + 1 })} onClick={() => onExpand(open ? null : ci)}
                    className="flex h-8 items-center gap-1 pr-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="flex w-10 justify-center"><ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} /></span>
                    <span className="font-medium text-foreground">{ci + 1}</span>
                  </button>
                </td>
                {([0, 1] as const).map((side) => <td key={side} className={cn(TABLE_CELL, "min-w-0 truncate")}>{endpointSummary(connections[ci]?.Endpoints[side])}</td>)}
                <td className={cn(TABLE_CELL, "px-1 py-1")}><RowActions actions={[
                  { key: "show", label: t("admin.exTopo.overview.showOnDiagram"), icon: <LocateFixed aria-hidden="true" className="h-4 w-4" />, disabled: !canShow(ci), onSelect: () => onShow(ci) },
                  ...(readOnly ? [] : [{ key: "remove", label: t("admin.exTopo.removeConnection"), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, danger: true, onSelect: () => setPendingRemoval(ci) }]),
                ]} /></td>
              </tr>
              {open && <tr><td colSpan={4} className="border-b border-border/50 p-0"><div data-testid={`connection-editor-${ci}`} className="grid gap-3 bg-muted/20 p-3 pl-14 sm:grid-cols-2">
                {([0, 1] as const).map((side) => <EndpointSelect key={side} path={`${name}.${ci}.Endpoints.${side}`} side={side} disabled={readOnly} options={options(ci, side)} />)}
              </div></td></tr>}
            </Fragment>
          })}
        </tbody>
      </Table>}
    <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger" title={t("admin.exTopo.removeConnectionTitle")}
      description={pendingRemoval !== null ? t("admin.exTopo.removeConnectionConfirm", { first: endpointSummary(connections[pendingRemoval]?.Endpoints[0]), second: endpointSummary(connections[pendingRemoval]?.Endpoints[1]) }) : undefined}
      cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={t("admin.exTopo.removeConnection")} onConfirm={() => { if (pendingRemoval !== null) removeConnection(pendingRemoval) }} />
  </div>
}

function EndpointSelect({ path, side, disabled, options }: { path: `Variants.${number}.Topology.Connections.${number}.Endpoints.${0 | 1}`; side: 0 | 1; disabled: boolean; options: { value: string; label: string }[] }) {
  const { control } = useFormContext<DraftFormValues>()
  const deviceError = useFieldError(`${path}.DeviceID`)
  const portError = useFieldError(`${path}.Interface`)
  const wholeError = useFieldError(path)
  const error = deviceError ?? portError ?? wholeError
  const props = fieldProps(`${path}.DeviceID`, error)
  const label = t(side === 0 ? "admin.exTopo.endpoint.first" : "admin.exTopo.endpoint.second")
  return <Controller control={control} name={path} render={({ field }) => <div className="min-w-0" data-field-name={`${path}.Interface`} tabIndex={-1}>
    <FieldLabel text={label} required htmlFor={props.id} help={{ intro: t("admin.exTopo.endpoint.help") }} />
    <SelectMenu {...props} value={field.value.Kind === "device" && field.value.DeviceID === "" ? "" : encodeEndpoint(field.value)} onChange={(value) => field.onChange(decodeEndpoint(value))}
      disabled={disabled} placeholder={t("admin.exTopo.endpoint.placeholder")} ariaLabel={label} options={options} className="w-full" />
    <FieldError path={`${path}.DeviceID`} message={error} />
  </div>} />
}

