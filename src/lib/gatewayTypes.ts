/**
 * The kinds of gateway device. They are plain values (no I/O), so they live here and not in api/exercises/versions.ts:
 * a test may replace that module by a mock and the editor must keep telling a gateway from another device.
 */
export type GatewayDeviceType = "vpn_gateway" | "internet_gateway"
/** A gateway is a VPN or an Internet exit; the kind of the lab status and of the pictograms. */
export type GatewayKind = "vpn" | "internet"

export const isGatewayType = (type: string): type is GatewayDeviceType => type === "vpn_gateway" || type === "internet_gateway"
export const gatewayKindOf = (type: GatewayDeviceType): GatewayKind => type === "vpn_gateway" ? "vpn" : "internet"
