"use client"

import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableState, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { TopologyFormValues } from "@/lib/exerciseSchemas"
import { topologyIconFor } from "@/lib/topologyIcons"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import { topologyDeviceRows } from "@/lib/topologyOverview"
import { Settings2, Trash2 } from "lucide-react"
import { RowActions } from "./RowActions"
import { TopologyGlyph } from "./TopologyGlyph"

/** Device overview; the row actions open the canvas inspector or remove the device (after a confirm). */
export function TopologyDeviceOverview({ topology, disabled, selectedKey, onOpen, onRemove }: {
  topology: TopologyFormValues
  disabled: boolean
  selectedKey: string | null
  onOpen: (key: string) => void
  onRemove: (key: string) => void
}) {
  const rows = topologyDeviceRows(topology)
  const columns = 7
  const heading = (key: string, width: string) => <th scope="col" className={`${TABLE_HEAD_CELL} ${width}`}>{t(key)}</th>

  return <Table label={t("admin.exTopo.devices")} className="min-w-[42rem] table-fixed">
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          {heading("admin.exTopo.overview.device", "w-[30%]")}
          {heading("admin.exTopo.deviceType", "w-[19%]")}
          {heading("admin.exTopo.overview.ports", "w-[12%]")}
          {heading("admin.exTopo.overview.free", "w-[10%]")}
          {heading("admin.exTopo.overview.links", "w-[10%]")}
          {heading("admin.exTopo.overview.external", "w-[13%]")}
          <th scope="col" className={`${TABLE_HEAD_CELL} w-[5.5rem] px-1`}><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
        </tr>
      </thead>
      {rows.length === 0 ? <TableState colSpan={columns}><EmptyState message={t("admin.exTopo.noDevices")} /></TableState> :
      <tbody>
        {rows.map((row, index) => {
          const device = topology.Devices.find((candidate) => candidate.ID === row.key)
          const name = row.type === "vpn" || row.type === "internet" ? gatewayLabelFor(topology.VisualRender, row.type, t(`admin.exTopo.${row.type}`))
            : row.name || t("admin.exTopo.unnamedDeviceN", { n: index + 1 })
          const type = row.type === "vpn" || row.type === "internet" ? t(`admin.exTopo.${row.type}`)
            : t(`admin.exTopo.type.${row.type === "unmanaged-switch" ? "switch" : row.type}`)
          const icon = device ? topologyIconFor(device, topology.VisualRender) : row.type === "vpn" ? "vpn" : "internet"
          return <tr key={row.key} data-selected={selectedKey === row.key || undefined}
            className={`${TABLE_ROW} group data-[selected]:bg-accent/60`}>
            <td className={`${TABLE_CELL} min-w-0`}>
              <HoverTooltip text={name} className="max-w-full">
                <button type="button" aria-label={name} onClick={() => onOpen(row.key)}
                  className="flex max-w-full items-center gap-2 rounded-sm text-left font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
                  <TopologyGlyph kind={icon} className="h-5 w-5 shrink-0 text-foreground" />
                  <span className="truncate">{name}</span>
                </button>
              </HoverTooltip>
            </td>
            <td className={`${TABLE_CELL} truncate text-muted-foreground`}>{type}</td>
            <td className={`${TABLE_CELL} tabular-nums`}>{row.used} / {row.capacity}</td>
            <td className={`${TABLE_CELL} tabular-nums`}>{row.free}</td>
            <td className={`${TABLE_CELL} tabular-nums`}>{row.linkCount}</td>
            <td className={TABLE_CELL}>{row.externalEnabled === null ? "—" : t(row.externalEnabled ? "admin.exTopo.overview.yes" : "admin.exTopo.overview.no")}</td>
            <td className={`${TABLE_CELL} px-1 py-1`}><RowActions actions={[
              { key: "settings", label: t("admin.exTopo.configure"), icon: <Settings2 className="h-4 w-4" />, onSelect: () => onOpen(row.key) },
              ...(disabled ? [] : [{ key: "remove", label: t("admin.exTopo.removeDevice"), icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => onRemove(row.key) }]),
            ]} /></td>
          </tr>
        })}
      </tbody>}
  </Table>
}
