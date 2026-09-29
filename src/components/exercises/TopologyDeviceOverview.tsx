"use client"

import { EmptyState } from "@/components/ui/empty-state"
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
  if (rows.length === 0) return <EmptyState message={t("admin.exTopo.noDevices")} className="flex-1" />

  return <div className="min-w-0 overflow-x-auto">
    <table aria-label={t("admin.exTopo.devices")} className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
      <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
        <tr>
          <th scope="col" className="w-[30%] px-3 py-2">{t("admin.exTopo.overview.device")}</th>
          <th scope="col" className="w-[19%] px-3 py-2">{t("admin.exTopo.deviceType")}</th>
          <th scope="col" className="w-[12%] px-3 py-2">{t("admin.exTopo.overview.ports")}</th>
          <th scope="col" className="w-[10%] px-3 py-2">{t("admin.exTopo.overview.free")}</th>
          <th scope="col" className="w-[10%] px-3 py-2">{t("admin.exTopo.overview.links")}</th>
          <th scope="col" className="w-[13%] px-3 py-2">{t("admin.exTopo.overview.external")}</th>
          <th scope="col" className="w-[5.5rem] px-1 py-2"><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row, index) => {
          const device = topology.Devices.find((candidate) => candidate.ID === row.key)
          const name = row.type === "vpn" || row.type === "internet" ? gatewayLabelFor(topology.VisualRender, row.type, t(`admin.exTopo.${row.type}`))
            : row.name || `${t("admin.exTopo.unnamedDevice")} ${index + 1}`
          const type = row.type === "vpn" || row.type === "internet" ? t(`admin.exTopo.${row.type}`)
            : t(`admin.exTopo.type.${row.type === "unmanaged-switch" ? "switch" : row.type}`)
          const icon = device ? topologyIconFor(device, topology.VisualRender) : row.type === "vpn" ? "vpn" : "internet"
          return <tr key={row.key} aria-selected={selectedKey === row.key}
            className="group hover:bg-muted/50 aria-selected:bg-accent/60">
            <td className="min-w-0 px-3 py-1.5">
              <HoverTooltip text={name} className="max-w-full">
                <button type="button" aria-label={name} onClick={() => onOpen(row.key)}
                  className="flex max-w-full items-center gap-2 rounded-sm text-left font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
                  <TopologyGlyph kind={icon} className="h-5 w-5 shrink-0 text-foreground" />
                  <span className="truncate">{name}</span>
                </button>
              </HoverTooltip>
            </td>
            <td className="truncate px-3 py-1.5 text-muted-foreground">{type}</td>
            <td className="px-3 py-1.5 tabular-nums">{row.used} / {row.capacity}</td>
            <td className="px-3 py-1.5 tabular-nums">{row.free}</td>
            <td className="px-3 py-1.5 tabular-nums">{row.linkCount}</td>
            <td className="px-3 py-1.5">{row.externalEnabled === null ? "—" : t(row.externalEnabled ? "admin.exTopo.overview.yes" : "admin.exTopo.overview.no")}</td>
            <td className="px-1 py-1"><RowActions actions={[
              { key: "settings", label: t("admin.exTopo.configure"), icon: <Settings2 className="h-4 w-4" />, onSelect: () => onOpen(row.key) },
              ...(disabled ? [] : [{ key: "remove", label: t("admin.exTopo.removeDevice"), icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => onRemove(row.key) }]),
            ]} /></td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}
