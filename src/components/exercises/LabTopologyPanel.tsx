"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { labNodeInfo, labTopology } from "@/lib/labTopology"
import { TopologyDiagram } from "./TopologyDiagram"

/**
 * Read-only topology of the variant's lab. Clicking a node opens its card: the
 * addresses in this lab, the services and, for a web device, «Відкрити». Nothing
 * private (image, environment, resources, flags) ever reaches it.
 */
export function LabTopologyPanel({ topology, status, openingKey, onOpenWeb }: {
  topology: NormalizedTopology
  status: DeployStatus | null
  /** "device:port" being opened. */
  openingKey: string | null
  onOpenWeb: (device: string, port: number) => void
}) {
  const shown = useMemo(() => labTopology(topology), [topology])
  const [selected, setSelected] = useState<string | null>(null)
  const info = selected ? labNodeInfo(topology, selected, status) : null

  return (
    <section aria-label={t("admin.exTest.topology")} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <TopologyDiagram topology={shown} selectedNodes={selected ? [selected] : []} onNodeSelect={setSelected} onCanvasSelect={() => setSelected(null)} />
      </div>
      {info && (
        <div role="region" aria-label={t("admin.exTest.card.title")} className="shrink-0 space-y-3 border-t border-border bg-background p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground">
              {info.kind === "device" ? info.name : t(info.kind === "vpn" ? "admin.exTopo.vpn" : "admin.exTopo.internet")}
            </h3>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={t("admin.exTest.card.close")} onClick={() => setSelected(null)}>
              <X aria-hidden="true" size={14} />
            </Button>
          </div>
          {info.kind === "device" ? <>
            <Row label={t("admin.exTest.card.address")}>
              {info.interfaces.length === 0 ? "—" : info.interfaces.map((iface) => (
                <div key={iface.name} className="font-mono">{iface.name}: {iface.dhcp ? t("admin.exTest.card.dhcp") : iface.address}</div>
              ))}
            </Row>
            <Row label={t("admin.exTest.card.services")}>{info.services.length ? info.services.map((service) => <div key={service} className="font-mono">{service}</div>) : "—"}</Row>
            {info.web.length > 0 && <Row label={t("admin.exTest.card.web")}>
              {info.web.map((access) => (
                <div key={`${access.Device}:${access.Port}`} className="flex items-center justify-between gap-2">
                  <span className="font-mono">{access.Port}/{access.Protocol}</span>
                  <Button type="button" variant="outline" size="sm" busy={openingKey === `${access.Device}:${access.Port}`} disabled={openingKey !== null}
                    aria-label={t("admin.exTest.openWeb", { device: access.Device })} onClick={() => onOpenWeb(access.Device, access.Port)}>{t("admin.exDeploy.open")}</Button>
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
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-1 space-y-1 text-foreground">{children}</div>
  </div>
}
