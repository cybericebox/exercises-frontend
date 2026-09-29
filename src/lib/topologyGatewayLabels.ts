export type GatewayKind = "vpn" | "internet"

/** Gateway identity is fixed; this optional visual label changes only what the editor displays. */
export function gatewayLabelFor(visual: Record<string, unknown> | null, kind: GatewayKind, fallback: string): string {
  const labels = visual?.gatewayLabels
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return fallback
  const label = (labels as Record<string, unknown>)[kind]
  return typeof label === "string" && label.trim() ? label.trim() : fallback
}
