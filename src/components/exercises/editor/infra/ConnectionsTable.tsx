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
import { gatewayClashOfLink, isConsoleCable } from "@/lib/editor/schemas/infra"
import { freeLinePorts, portKindOf } from "@/lib/editor/consolePorts"
import { TableHeadHelp } from "./TableHeadHelp"
import { cn } from "@/utils/cn"
import { FieldError, RowActions, fieldProps, useFieldError } from "../kit"

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
 * “Connections”: pairs of endpoints (device and port, the VPN gateway, the Internet), network links and console cables (the
 * column “Type”). A row opens by its chevron or a click (no pencil) into two dropdowns; the row actions are “Show on the schema”
 * and the trash. A console cable offers only serial and console ports, one of each, on two devices, free ones only.
 */
export function ConnectionsTable({ variantIndex, readOnly, expandedIndex, onExpand, selectedIndex, onShow }: {
  variantIndex: number
  readOnly: boolean
  expandedIndex: number | null
  onExpand: (index: number | null) => void
  selectedIndex: number | null
  onShow: (index: number) => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Connections` as const
  const { fields, remove } = useFieldArray({ control, name })
  const connections = useWatch({ control, name }) ?? []
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const errorRows = get(useErrorsAt(name), name) as unknown
  const firstBad = Array.isArray(errorRows) ? errorRows.findIndex(Boolean) : -1
  useEffect(() => {
    if (firstBad >= 0) onExpand(firstBad)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new error opens its row once
  }, [firstBad])


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
    if (isConsoleCable(connections[connectionIndex] ?? {})) return cableOptions(connectionIndex, side)
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
  /** The ends a console cable may take: free serial and console ports; once the other end is chosen, only the other kind on another device. */
  function cableOptions(connectionIndex: number, side: number) {
    const other = connections[connectionIndex]?.Endpoints[side === 0 ? 1 : 0]
    const otherDevice = other && other.DeviceID ? devices.find((device) => device.ID === other.DeviceID) : undefined
    const otherKind = otherDevice && other?.Interface ? portKindOf(otherDevice, other.Interface) : null
    return devices.flatMap((device) => {
      if (otherDevice && device.ID === otherDevice.ID) return []
      const free = freeLinePorts(connections, device, { connectionIndex, side })
      const serial = otherKind === "serial" ? [] : free.serial.map((port) => ({ port, kind: "serial" as const }))
      const consolePorts = otherKind === "console" ? [] : free.console.map((port) => ({ port, kind: "console" as const }))
      return [...serial, ...consolePorts].map(({ port, kind }) => ({
        value: `device:${device.ID}:${port}`,
        label: `${device.Name || device.ID.slice(0, 8)} · ${port}`,
        description: t(kind === "serial" ? "ed.c.cable.serialEnd" : "ed.c.cable.consoleEnd"),
      }))
    })
  }
  function removeConnection(index: number) {
    setPendingRemoval(null)
    remove(index)
    onExpand(null)
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    {fields.length === 0
      ? <div className="flex min-h-48 flex-1 items-center justify-center rounded-md border border-border"><EmptyState message={t("admin.exTopo.noConnections")} /></div>
      : <Table label={t("admin.exTopo.connections")} className="min-w-[36rem] table-fixed" regionClassName="rounded-md border border-border">
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-24 px-0")}><div className="pl-10"><TableHeadHelp text="#" help={{ intro: t("ed.c.th.index") }} /></div></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-44")}>{t("ed.c.th.typeTitle")}</th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[33%]")}><TableHeadHelp text={t("admin.exTopo.endpoint.first")} help={{ intro: t("ed.c.th.first") }} /></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[33%]")}><TableHeadHelp text={t("admin.exTopo.endpoint.second")} help={{ intro: t("ed.c.th.second") }} /></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "w-24 px-1")}><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, ci) => {
            const cable = isConsoleCable(connections[ci] ?? {})
            const open = expandedIndex === ci
            return <Fragment key={field.id}>
              <tr data-testid={`connection-row-${ci}`} data-console={cable || undefined} data-selected={selectedIndex === ci || undefined} className="group h-[49px] cursor-default transition-colors hover:bg-[var(--ib-hover)] data-[selected]:bg-accent/60"
                onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) onExpand(open ? null : ci) }}>
                <td className={cn(TABLE_CELL, "px-0 tabular-nums")}>
                  <button type="button" aria-expanded={open} aria-label={t("admin.exTopo.overview.editConnectionN", { n: ci + 1 })} onClick={() => onExpand(open ? null : ci)}
                    className="flex h-8 items-center gap-1 pr-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="flex w-10 justify-center"><ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} /></span>
                    <span className="font-medium text-foreground">{ci + 1}</span>
                  </button>
                </td>
                <td className={cn(TABLE_CELL, "min-w-0")} data-connection-kind={cable ? "console" : "network"}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{cable
                    ? <><CableSwatch console />{t("ed.c.th.kindConsole")}</>
                    : <><CableSwatch />{t("ed.c.th.kindNetwork")}</>}</span>
                </td>
                {([0, 1] as const).map((side) => <td key={side} className={cn(TABLE_CELL, "min-w-0 truncate")}>{endpointSummary(connections[ci]?.Endpoints[side])}</td>)}
                <td className={cn(TABLE_CELL, "px-1 py-1")}><RowActions actions={[
                  { key: "show", label: t("admin.exTopo.overview.showOnDiagram"), icon: <LocateFixed aria-hidden="true" className="h-4 w-4" />, disabled: !canShow(ci), onSelect: () => onShow(ci) },
                  ...(readOnly ? [] : [{ key: "remove", label: t("admin.exTopo.removeConnection"), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, danger: true, onSelect: () => setPendingRemoval(ci) }]),
                ]} /></td>
              </tr>
              {open && <tr><td colSpan={5} className="border-b border-border/50 p-0"><div data-testid={`connection-editor-${ci}`} className="grid gap-3 bg-muted/20 p-3 pl-14 sm:grid-cols-2">
                {([0, 1] as const).map((side) => <EndpointSelect key={side} path={`${name}.${ci}.Endpoints.${side}`} side={side} disabled={readOnly} options={options(ci, side)} />)}
                {cable && <p className="text-xs text-muted-foreground sm:col-span-2">{t("ed.c.cable.outsideNetworks")}</p>}
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

/** The line of the cable type as the schema draws it: solid grey for a network link, dashed light blue for a console cable. */
export function CableSwatch({ console: isConsole = false }: { console?: boolean }) {
  return <svg aria-hidden="true" width="20" height="8" className="shrink-0">
    <line x1="1" y1="4" x2="19" y2="4" strokeWidth={2} className={isConsole ? "stroke-[var(--ib-console)]" : "stroke-muted-foreground/70"}
      strokeDasharray={isConsole ? "5 3" : undefined} strokeLinecap={isConsole ? "round" : undefined} />
  </svg>
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

