import type { SVGProps } from "react"

export type TopologyGlyphKind = "host" | "switch" | "switch-l3" | "hub" | "router" | "firewall" | "vpn" | "internet"

/** Small, original network pictograms drawn on a shared 24-unit grid. */
export function TopologyGlyph({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: TopologyGlyphKind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-topology-glyph={kind} {...props}>
    {kind === "host" && <>
      <rect data-server-rack x="4" y="2" width="16" height="20" rx="1.8" fill="currentColor" stroke="none" />
      <path d="M6.5 7.5h11M6.5 12h11M6.5 16.5h11" stroke="white" strokeWidth="1.2" />
      <circle cx="8" cy="5" r="0.75" fill="white" stroke="none" />
      <circle cx="8" cy="10" r="0.75" fill="white" stroke="none" />
      <circle cx="8" cy="14.5" r="0.75" fill="white" stroke="none" />
      <circle cx="8" cy="19" r="0.75" fill="white" stroke="none" />
    </>}
    {kind === "switch" && <>
      <rect data-switch-chassis x="2" y="2" width="20" height="20" rx="2" fill="currentColor" stroke="none" />
      <path data-switch-flow d="M10 7H5m0 0 2-2M5 7l2 2m7-2h5m0 0-2-2m2 2-2 2M10 16H5m0 0 2-2m-2 2 2 2m7-2h5m0 0-2-2m2 2-2 2" stroke="white" strokeWidth="1.45" />
    </>}
    {kind === "switch-l3" && <>
      <rect data-switch-chassis x="2" y="2" width="20" height="20" rx="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.5" fill="white" stroke="none" />
      <path data-layer3-rays d="M12 8V4m0 4-1-1.5m1 1.5 1-1.5M12 16v4m0-4-1 1.5m1-1.5 1 1.5M8 12H4m4 0-1.5-1m1.5 1-1.5 1M16 12h4m-4 0 1.5-1M16 12l1.5 1M9 9 6 6m3 3-1.7-.4M9 9l-.4-1.7M15 9l3-3m-3 3 .4-1.7M15 9l1.7-.4M9 15l-3 3m3-3-1.7.4M9 15l-.4 1.7m6-1.7 3 3m-3-3 1.7.4M15 15l.4 1.7" stroke="white" strokeWidth="1.1" />
    </>}
    {kind === "hub" && <>
      <rect data-hub-chassis x="2" y="4" width="20" height="16" rx="1.5" fill="currentColor" stroke="none" />
      <path data-hub-spokes d="M5 10h14m-14 0 2-2m-2 2 2 2m12-2-2-2m2 2-2 2" stroke="white" strokeWidth="1.45" />
      <path d="M5.5 15.5h2v2h-2zm3.5 0h2v2H9zm3.5 0h2v2h-2zm3.5 0h2v2h-2z" stroke="white" strokeWidth="0.85" />
    </>}
    {kind === "router" && <>
      <circle data-router-disc cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path data-router-flow d="M10 10 6.5 6.5m0 0 .2 2.2m-.2-2.2 2.2.2M14 10l3.5-3.5m0 0-2.2.2m2.2-.2-.2 2.2M10 14l-3.5 3.5m0 0 .2-2.2m-.2 2.2 2.2-.2M14 14l3.5 3.5m0 0-2.2-.2m2.2.2-.2-2.2" stroke="white" strokeWidth="1.45" />
    </>}
    {kind === "firewall" && <>
      <path data-firewall-shield d="M12 1.5 21 5v6c0 5.2-3.5 8.8-9 11.5C6.5 19.8 3 16.2 3 11V5z" fill="currentColor" stroke="none" />
      <path data-firewall-bricks d="M5.5 9h13M6 13h12M9 5.5V9m6-3.5V9m-3 0v4m-3 0v5m6-5v5" stroke="white" strokeWidth="1.15" />
    </>}
    {kind === "vpn" && <>
      <path d="M12 2 20 5v6c0 5-3.1 8.3-8 11-4.9-2.7-8-6-8-11V5z" />
      <rect x="9" y="11" width="6" height="5" rx="1" /><path d="M10 11V9a2 2 0 0 1 4 0v2" />
    </>}
    {kind === "internet" && <>
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-3 2.5-4.5 5.5-4.5 9S9 18.5 12 21M12 3c3 2.5 4.5 5.5 4.5 9S15 18.5 12 21" />
      <path d="M5 7h14M5 17h14" />
    </>}
  </svg>
}
