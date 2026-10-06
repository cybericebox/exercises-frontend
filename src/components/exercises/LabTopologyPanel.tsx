"use client"

import { useEffect, useMemo, useState } from "react"
import { ExternalLink, RotateCcw, X } from "lucide-react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { readLayout, removeLayout, saveLayout, withLayout, EMPTY_LAYOUT, type LabLayout } from "@/lib/labLayout"
import { labNodeInfo, labTopology } from "@/lib/labTopology"
import { DeviceLiveInfo } from "./DeviceLiveInfo"
import { TopologyDiagram } from "./TopologyDiagram"

/**
 * Read-only topology of the variant's lab. Clicking a node opens its card: the
 * addresses in this lab, the services and, for a web device, «Відкрити». Nothing
 * private (image, environment, resources, flags) ever reaches it.
 */
export function LabTopologyPanel({ deployId, topology, status, openingKey, onOpenWeb }: {
  /** The running lab; the author's arrangement of the diagram is kept in this browser under it. */
  deployId: string
  topology: NormalizedTopology
  status: DeployStatus | null
  /** "device:port" being opened. */
  openingKey: string | null
  onOpenWeb: (device: string, port: number) => void
}) {
  const [layout, setLayout] = useState<LabLayout>(() => readLayout(deployId))
  const shown = useMemo(() => {
    const base = labTopology(topology)
    return { ...base, VisualRender: withLayout(base.VisualRender, layout) }
  }, [topology, layout])
  // Quick successive drags each build on the latest arrangement.
  const move = (part: keyof LabLayout) => (key: string, point: { x: number; y: number }) =>
    setLayout((current) => ({ ...current, [part]: { ...current[part], [key]: point } }))
  useEffect(() => {
    if (layout === EMPTY_LAYOUT) removeLayout(deployId)
    else saveLayout(deployId, layout)
  }, [deployId, layout])
  const [selected, setSelected] = useState<string | null>(null)
  const info = selected ? labNodeInfo(topology, selected, status) : null

  return (
    <section aria-label={t("admin.exTest.topology")} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="absolute inset-0 overflow-auto">
        <TopologyDiagram topology={shown} selectedNodes={selected ? [selected] : []} onNodeSelect={setSelected} onCanvasSelect={() => setSelected(null)}
          onPositionChange={move("nodes")} onLabelOffsetChange={move("labels")} onPortLabelOffsetChange={move("portLabels")}
          toolbarExtra={<HoverTooltip text={t("admin.exTest.layoutReset")}>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("admin.exTest.layoutReset")}
              onClick={() => setLayout(EMPTY_LAYOUT)}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            </Button>
          </HoverTooltip>} />
      </div>
      {info && (
        <div role="region" aria-label={t("admin.exTest.card.title")} className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] space-y-3 overflow-y-auto border-t border-border bg-background p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground">
              {info.kind === "device" ? info.name : t(info.kind === "vpn" ? "admin.exTopo.vpn" : "admin.exTopo.internet")}
            </h3>
            <HoverTooltip text={t("admin.exTest.card.close")}>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={t("admin.exTest.card.close")} onClick={() => setSelected(null)}>
                <X aria-hidden="true" size={14} />
              </Button>
            </HoverTooltip>
          </div>
          {info.kind === "device" ? <>
            <Row label={t("admin.exTest.card.address")}>
              {info.interfaces.length === 0 ? "—" : info.interfaces.map((iface) => (
                <div key={iface.name} className="font-mono">{iface.name}: {iface.dhcp ? t("admin.exTest.card.dhcp") : iface.address}</div>
              ))}
            </Row>
            <Row label={t("admin.exTest.card.services")}>{info.services.length ? info.services.map((service) => <div key={service} className="font-mono">{service}</div>) : "—"}</Row>
            <DeviceLiveInfo key={info.name} deployId={deployId} device={status?.Devices?.find((device) => device.Name === info.name)} />
            {info.web.length > 0 && <Row label={t("admin.exTest.card.web")}>
              {info.web.map((access) => (
                <div key={`${access.Device}:${access.Port}`} className="flex items-center justify-between gap-2">
                  <span className="font-mono">{access.Port}/{access.Protocol}</span>
                  <HoverTooltip text={t("admin.exDeploy.open")}>
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" busy={openingKey === `${access.Device}:${access.Port}`} disabled={openingKey !== null}
                      aria-label={t("admin.exTest.openWeb", { device: access.Device })} onClick={() => onOpenWeb(access.Device, access.Port)}>
                      <ExternalLink aria-hidden="true" size={16} />
                    </Button>
                  </HoverTooltip>
                </div>
              ))}
            </Row>}
          </> : <>
            <Row label={t("admin.exTest.card.subnet")}><span className="font-mono">{info.subnet ?? "—"}</span></Row>
            <Row label={t("admin.exTest.card.dhcpLabel")}>{t(info.dhcp ? "admin.exTest.card.yes" : "admin.exTest.card.no")}</Row>
          </>}
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 space-y-1 text-foreground">{children}</div>
  </div>
}
