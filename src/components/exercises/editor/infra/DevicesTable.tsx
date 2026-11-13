"use client"

import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { LocateFixed, Settings2, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableState, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW } from "@/components/ui/table"
import { deliveriesOfTask } from "@/lib/editor/refs"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { gatewayKindOf, isGatewayType } from "@/lib/gatewayTypes"
import { gatewaysOverLimit } from "@/lib/editor/schemas/infra"
import { useMaxLabGateways } from "../gatewayLimit"
import { FieldError } from "../fieldErrors"
import { topologyIconFor } from "@/lib/topologyIcons"
import { TableHeadHelp } from "./TableHeadHelp"
import { cn } from "@/utils/cn"
import { TopologyGlyph } from "../../TopologyGlyph"
import { RowActions } from "../kit"
import { parsePlatformRef } from "../../ImageUpload"

function accessWords(access: DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Access"]): string {
  if (access.length === 0) return t("ed.c.devices.accessNone")
  return access.map((entry) => entry.Kind === "http" ? t("ed.c.devices.accessWeb") : entry.Kind === "terminal" ? t("ed.c.devices.accessTerminal") : entry.Kind.toUpperCase()).join(", ")
}

/** «Пристрої»: every node of the schema in one table; the name shows it on the schema, the row actions open the editor or remove it. */
export function DevicesTable({ variantIndex, readOnly, selectedKey, onShow, onConfigure, onRemove }: {
  variantIndex: number
  readOnly: boolean
  selectedKey: string | null
  onShow: (key: string) => void
  onConfigure: (key: string) => void
  onRemove: (key: string) => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  const taskList = useWatch({ control, name: `Variants.${variantIndex}.Tasks` })
  const maxGateways = useMaxLabGateways()

  const rows = useMemo(() => {
    if (!topology) return []
    const tasks = taskList ?? []
    const linksOf = (match: (endpoint: { Kind: string; DeviceID: string }) => boolean) => topology.Connections.filter((connection) => connection.Endpoints.some(match)).length
    const related = (deviceId: string) => tasks.filter((task) => (task.Check?.Kind === "state" && task.Check.State.Conditions.some((condition) => condition.DeviceID === deviceId))
      || deliveriesOfTask(topology, task.Key).some((delivery) => delivery.deviceId === deviceId)).length
    const overLimit = new Set(maxGateways === null ? [] : gatewaysOverLimit(topology.Devices, maxGateways))
    return topology.Devices.map((device, index) => {
      const gateway = isGatewayType(device.Type)
      return {
        key: device.ID, name: device.Name || t("admin.exTopo.unnamedDevice"), glyph: isGatewayType(device.Type) ? gatewayKindOf(device.Type) : topologyIconFor(device, topology.VisualRender),
        type: gateway ? t(device.Type === "vpn_gateway" ? "admin.exTopo.vpn" : "admin.exTopo.internet") : device.Type === "node" ? t("ed.c.panel.kindNode") : device.Type === "hub" ? t("ed.c.panel.kindHub") : t("ed.c.panel.kindSwitch"),
        image: device.Type === "node" ? device.Image.trim() : "", node: device.Type === "node" || gateway, links: linksOf((endpoint) => endpoint.DeviceID === device.ID),
        tasks: device.Type === "node" ? related(device.ID) : null, access: device.Type === "node" ? accessWords(device.Access) : null,
        limitError: overLimit.has(index) && maxGateways !== null ? t("ed.c.val.gatewayLimit", { max: maxGateways }) : null,
      }
    })
  }, [topology, taskList, maxGateways])

  return <Table label={t("ed.c.devices.title")} className="min-w-[44rem] table-fixed" regionClassName="min-h-0 rounded-md border border-border">
    <thead>
      <tr className={TABLE_HEAD_ROW}>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[20%]")}><TableHeadHelp text={t("ed.c.devices.device")} help={{ intro: t("ed.c.th.device") }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[20%]")}><TableHeadHelp text={t("ed.c.devices.type")} help={{ intro: t("ed.c.th.type"), items: [{ term: t("ed.c.th.typeNode"), text: t("ed.c.th.typeNodeText") }, { term: t("ed.c.th.typeNet"), text: t("ed.c.th.typeNetText") }] }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[17%]")}><TableHeadHelp text={t("ed.c.devices.image")} help={{ intro: t("ed.c.th.image") }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[12%]")}><TableHeadHelp text={t("ed.c.devices.links")} help={{ intro: t("ed.c.th.links") }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[14%]")}><TableHeadHelp text={t("ed.c.devices.tasks")} help={{ intro: t("ed.c.th.tasks") }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[14%]")}><TableHeadHelp text={t("ed.c.devices.access")} help={{ intro: t("ed.c.th.access"), items: [{ term: t("ed.c.th.accessWeb"), text: t("ed.c.th.accessWebText") }, { term: t("ed.c.th.accessTerminal"), text: t("ed.c.th.accessTerminalText") }] }} /></th>
        <th scope="col" className={cn(TABLE_HEAD_CELL, "w-[6.5rem] px-1")}><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
      </tr>
    </thead>
    {rows.length === 0
      ? <TableState colSpan={7}><EmptyState message={t("ed.c.devices.empty")} /></TableState>
      : <tbody>{rows.map((row) => <tr key={row.key} data-selected={selectedKey === row.key || undefined} className="group h-[49px] transition-colors hover:bg-[var(--ib-hover)] data-[selected]:bg-accent/60">
        <td className={cn(TABLE_CELL, "min-w-0")}>
          <button type="button" aria-label={t("ed.c.devices.showN", { name: row.name })} onClick={() => onShow(row.key)}
            className="flex max-w-full items-center gap-2 rounded-sm text-left font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
            <TopologyGlyph kind={row.glyph} className="h-5 w-5 shrink-0 text-foreground" /><span className="truncate">{row.name}</span>
          </button>
          {row.limitError && <FieldError path={`${row.key}-limit`} message={row.limitError} className="mt-0.5" />}
        </td>
        <td className={cn(TABLE_CELL, "truncate text-muted-foreground")}>{row.type}</td>
        <td className={cn(TABLE_CELL, "truncate font-mono text-[13px]")}>{row.image ? (parsePlatformRef(row.image)?.name ?? row.image) : "—"}</td>
        <td className={cn(TABLE_CELL, "tabular-nums")}>{row.links}</td>
        <td className={cn(TABLE_CELL, "tabular-nums")}>{row.tasks ?? "—"}</td>
        <td className={cn(TABLE_CELL, "truncate")}>{row.access ?? "—"}</td>
        <td className={cn(TABLE_CELL, "px-1 py-1")}><RowActions actions={[
          row.node
            ? { key: "settings", label: readOnly ? t("ed.c.panel.view") : t("ed.c.panel.configure"), icon: <Settings2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => onConfigure(row.key) }
            : { key: "show", label: t("ed.c.devices.show"), icon: <LocateFixed aria-hidden="true" className="h-4 w-4" />, onSelect: () => onShow(row.key) },
          ...(readOnly ? [] : [{ key: "remove", label: t("ed.c.devices.removeN", { name: row.name }), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, danger: true, onSelect: () => onRemove(row.key) }]),
        ]} /></td>
      </tr>)}</tbody>}
  </Table>
}
