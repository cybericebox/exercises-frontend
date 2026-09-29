import type { DeviceType } from "@/api/exercises/versions"

export const TOPOLOGY_ICONS = {
  host: true,
  switch: true,
  "switch-l3": true,
  hub: true,
  router: true,
  firewall: true,
} as const

export type TopologyIconKey = keyof typeof TOPOLOGY_ICONS

export function defaultTopologyIcon(type: DeviceType): TopologyIconKey {
  return type === "unmanaged-switch" ? "switch" : type === "hub" ? "hub" : "host"
}

export function topologyIconFor(
  device: { ID: string; Type: DeviceType },
  visual: Record<string, unknown> | null,
): TopologyIconKey {
  if (device.Type !== "container") return defaultTopologyIcon(device.Type)
  const icons = visual?.icons
  const selected = icons && typeof icons === "object" && !Array.isArray(icons)
    ? (icons as Record<string, unknown>)[device.ID] : undefined
  return typeof selected === "string" && Object.hasOwn(TOPOLOGY_ICONS, selected)
    ? selected as TopologyIconKey : defaultTopologyIcon(device.Type)
}
