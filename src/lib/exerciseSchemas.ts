/**
 * exerciseSchemas.ts — zod mirror of the domain validation for exercise versions
 * (inside the backend's internal/model/exercise) + editor form types and factories.
 *
 * Validation here catches errors BEFORE the request; the server is still authoritative.
 * The schemas describe DraftFormValues (form is 1:1 with SaveDraftInput; one difference:
 * External in the form is {Enabled, Port, Protocol} instead of a nullable object).
 */
import { LINK_SCHEMES, isValidLinkPath, isValidLinkPort } from "@/lib/placeholderLink"
import { z } from "zod"
import ipaddr from "ipaddr.js"
import { t } from "@/i18n/t"
import { flagCandidateErrorKey, parseFlagCandidate } from "@/lib/flagPattern"
import { GATEWAY_PORT, isForwardingPort } from "@/lib/topologyPorts"
import { hintsAligned } from "@/lib/hintSync"
import { hintTextHasContent } from "@/lib/hintText"
import { MAX_HINTS, MAX_HINT_TEXT } from "@/lib/hintLimits"
import type {
  ConnectionDTO,
  DeviceDTO,
  InterfaceDTO,
  NormalizedDevice,
  NormalizedInterface,
  NormalizedTask,
  NormalizedTopology,
  NormalizedVariant,
  PlaceholderDTO,
  PlaceholderKind,
  Protocol,
  SaveDraftInput,
  TaskDTO,
  TopologyDTO,
  VariantDTO,
  Version,
} from "@/api/exercises/versions"
import { HINT_LEVELS } from "@/lib/hintLevels"

// ── Regexes and parsers (mirror the domain) ─────────────────────────────────────

/**
 * A container's name becomes part of the lab's web address
 * (<name>-<code>.<domain>, code is 3-4 random chars), which must be one 63-char
 * DNS label; we use 35 for a round limit. Keep in sync with the backend and laboratory.
 */
export const MAX_DEVICE_NAME_LEN = 35
export const DNS_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,33}[a-z0-9])?$/

/** Inline error for a container name, or null when it is valid. */
export function containerNameError(name: string): string | null {
  if (name.length > MAX_DEVICE_NAME_LEN) return t("admin.ex.val.deviceNameTooLong", { max: MAX_DEVICE_NAME_LEN })
  return DNS_LABEL_RE.test(name) ? null : t("admin.ex.val.deviceName")
}
// MAC requires ONE consistent separator across all octets (all ":" OR all "-"):
// net.ParseMAC rejects mixed separators like "02:42-ac:11:00:02".
export const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$|^[0-9A-Fa-f]{2}(-[0-9A-Fa-f]{2}){5}$/
// Strict octet: 0–255 with no leading zeros (Go netip rejects "010.0.0.1").
// The regex itself enforces the range, so a manual "≤255" check isn't needed.
const OCTET = "(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])"
const IPV4_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)
const CIDR_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}\\/(\\d{1,2})$`)

export function isValidIPv4(v: string): boolean {
  return IPV4_RE.test(v)
}

export function isValidCIDR(v: string): boolean {
  const m = CIDR_RE.exec(v)
  if (m) return Number(m[5]) <= 32
  if (!v.includes(":")) return false
  try { return ipaddr.parseCIDR(v)[0].kind() === "ipv6" } catch { return false }
}

function ipFamily(v: string): "ipv4" | "ipv6" | null {
  if (isValidIPv4(v)) return "ipv4"
  if (v.includes(":") && ipaddr.IPv6.isValid(v)) return "ipv6"
  return null
}

function cidrFamily(v: string): "ipv4" | "ipv6" | null {
  if (!isValidCIDR(v)) return null
  return v.includes(":") ? "ipv6" : "ipv4"
}

// Kubernetes quantity suffixes. This mirrors the common resource quantities;
// the server's resource.ParseQuantity remains the authority for unusual forms.
const QUANTITY_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:(e[+-]?\d+|E[+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E))?$/
const QUANTITY_SCALE: Record<string, number> = { n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6 }

function quantityValue(value: string): number | null {
  const match = QUANTITY_RE.exec(value)
  if (!match) return null
  const result = Number(match[1]) * (match[2] ? 10 ** Number(match[2].slice(1)) : (QUANTITY_SCALE[match[3]] ?? 1))
  return Number.isFinite(result) && result > 0 ? result : null
}

// ── Form types ─────────────────────────────────────────────────────────────────

export type ExternalFormValues = { Enabled: boolean; Port: number; Protocol: Protocol }
/** Persistence in the form: Debounce is not edited here, it only travels back as loaded. */
export type PersistenceFormValues = { Enabled: boolean; Debounce: string }
export type DeviceFormValues = Omit<NormalizedDevice, "External" | "Persistence"> & { External: ExternalFormValues; Persistence?: PersistenceFormValues }
export type TopologyFormValues = Omit<NormalizedTopology, "Devices"> & { Devices: DeviceFormValues[] }
export type PlaceholderFormValues = {
  Key: string
  Kind: PlaceholderKind
  IPReference: string
  Octets1to3: string
  LastOctet: number
  ShowMask: boolean
  DeviceName: string
  /** IP link form. PortText is the typed port: "" = the scheme default. */
  AsLink?: boolean
  Scheme?: string
  PortText?: string
  Path?: string
}
export type TaskFormValues = Omit<NormalizedTask, "Placeholders"> & { Placeholders: PlaceholderFormValues[] }
export type VariantFormValues = Omit<NormalizedVariant, "Topology" | "Tasks"> & {
  Topology: TopologyFormValues
  Tasks: TaskFormValues[]
}
export type DraftFormValues = {
  AdminNote: string
  Variants: VariantFormValues[]
}

// ── identity ───────────────────────────────────────────────────────────────────

export const identitySchema = z.object({
  Name: z.string().trim().min(3, t("admin.ex.val.name")).max(50, t("admin.ex.val.name")),
  Description: z.string().max(2000, t("admin.ex.val.description")),
  Tags: z
    .array(z.string().trim().min(1, t("admin.ex.val.tag")).max(30, t("admin.ex.val.tag")))
    .max(20, t("admin.ex.val.tags")),
})
export type IdentityFormValues = z.infer<typeof identitySchema>

// ── draft snapshot ───────────────────────────────────────────────────────────────

const networkSchema = z.object({
  Enabled: z.boolean(), DHCP: z.boolean(),
  DHCPRanges: z.array(z.object({ Start: z.number().int(), End: z.number().int() })).optional(),
  DNS: z.string().optional(),
}).superRefine((network, ctx) => {
  if (network.Enabled && network.DHCP && !network.DHCPRanges?.length) {
    ctx.addIssue({ code: "custom", path: ["DHCPRanges"], message: t("admin.ex.val.dhcpRangesRequired") })
  }
  const used = new Set<number>()
  network.DHCPRanges?.forEach((range) => {
    if (range.Start < 2 || range.End > 254 || range.Start > range.End) {
      ctx.addIssue({ code: "custom", path: ["DHCPRanges"], message: t("admin.ex.val.dhcpRange") })
      return
    }
    for (let host = range.Start; host <= range.End; host += 1) {
      if (used.has(host)) {
        ctx.addIssue({ code: "custom", path: ["DHCPRanges"], message: t("admin.ex.val.dhcpRangeOverlap") })
        break
      }
      used.add(host)
    }
  })
})
const networkIPRefSchema = z.object({ Network: z.enum(["vpn", "internet"]), Host: z.number().int() })
const networkSubnetRefSchema = z.object({ Network: z.enum(["vpn", "internet"]) })

const ipConfigSchema = z
  .object({
    Type: z.enum(["static", "dhcp", "dhcp-preset", "none"]),
    Addresses: z.array(z.string()),
    AddressRef: networkIPRefSchema.nullable().optional(),
    Gateway: z.string(),
    GatewayRef: networkIPRefSchema.nullable().optional(),
    Routes: z.array(z.object({
      Dst: z.string(), DstRef: networkSubnetRefSchema.nullable().optional(),
      Via: z.string(), ViaRef: networkIPRefSchema.nullable().optional(),
    })),
  })
  .superRefine((ip, ctx) => {
    if (ip.Type === "static") {
      if (ip.AddressRef ? ip.Addresses.length !== 0 : ip.Addresses.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["Addresses"], message: t("admin.ex.val.addressesRequired") })
      }
      if (ip.AddressRef && (ip.AddressRef.Host < 2 || ip.AddressRef.Host > 254)) {
        ctx.addIssue({ code: "custom", path: ["AddressRef"], message: t("admin.ex.val.addressRefHost") })
      }
      ip.Addresses.forEach((a, i) => {
        if (!isValidCIDR(a)) {
          ctx.addIssue({ code: "custom", path: ["Addresses", i], message: t("admin.ex.val.cidr") })
        }
      })
      if (ip.GatewayRef && (ip.Gateway || ip.GatewayRef.Host < 1 || ip.GatewayRef.Host > 254 || (ip.Addresses[0] && cidrFamily(ip.Addresses[0]) === "ipv6"))) {
        ctx.addIssue({ code: "custom", path: ["GatewayRef"], message: t("admin.ex.val.gatewayRef") })
      }
      if (ip.Gateway !== "" && !ipFamily(ip.Gateway)) {
        ctx.addIssue({ code: "custom", path: ["Gateway"], message: t("admin.ex.val.gateway") })
      }
      if (ip.AddressRef && ip.Gateway && ipFamily(ip.Gateway) === "ipv6") {
        ctx.addIssue({ code: "custom", path: ["Gateway"], message: t("admin.ex.val.gatewayRef") })
      }
      ip.Routes.forEach((route, index) => {
        const family = route.DstRef ? "ipv4" : cidrFamily(route.Dst)
        if (route.DstRef ? route.Dst !== "" : !family) {
          ctx.addIssue({ code: "custom", path: ["Routes", index, "Dst"], message: t("admin.ex.val.routeDst") })
        }
        const viaFamily = route.ViaRef ? "ipv4" : ipFamily(route.Via)
        if (route.ViaRef ? route.Via !== "" || route.ViaRef.Host < 1 || route.ViaRef.Host > 254 || family !== "ipv4" : !viaFamily || (family && viaFamily !== family)) {
          ctx.addIssue({ code: "custom", path: ["Routes", index, "Via"], message: t("admin.ex.val.routeVia") })
        }
      })
    } else {
      if (ip.Addresses.length > 0) {
        ctx.addIssue({ code: "custom", path: ["Addresses"], message: t("admin.ex.val.addressesForbidden") })
      }
      if (ip.Gateway !== "") {
        ctx.addIssue({ code: "custom", path: ["Gateway"], message: t("admin.ex.val.gatewayStaticOnly") })
      }
      if (ip.AddressRef || ip.GatewayRef || ip.Routes.some((route) => route.DstRef || route.ViaRef)) {
        ctx.addIssue({ code: "custom", path: ["AddressRef"], message: t("admin.ex.val.addressRefStaticOnly") })
      }
      if (ip.Routes.length > 0) ctx.addIssue({ code: "custom", path: ["Routes"], message: t("admin.ex.val.routesStaticOnly") })
    }
  })

const interfaceSchema = z.object({
  Name: z.string().min(1, t("admin.ex.val.ifaceName")),
  MAC: z.string().refine((v) => v === "" || MAC_RE.test(v), t("admin.ex.val.mac")),
  IP: ipConfigSchema,
})

const envVarSchema = z.object({
  Name: z.string().min(1, t("admin.ex.val.envName")),
  Value: z.string(),
  Secret: z.boolean(),
  HasValue: z.boolean(),
}).superRefine((variable, ctx) => {
  if (variable.Secret && !variable.HasValue && variable.Value === "") {
    ctx.addIssue({ code: "custom", path: ["Value"], message: t("admin.ex.val.secretValue") })
  }
})

const externalSchema = z
  .object({
    Enabled: z.boolean(),
    Port: z.number().int(t("admin.ex.val.port")),
    Protocol: z.enum(["http", "https"]),
  })
  .superRefine((ext, ctx) => {
    if (ext.Enabled && (ext.Port < 1 || ext.Port > 65535)) {
      ctx.addIssue({ code: "custom", path: ["PortText"], message: t("admin.ex.val.port") })
    }
  })

const deviceSchema = z
  .object({
    ID: z.string(),
    Name: z.string(),
    Type: z.enum(["container", "unmanaged-switch", "hub"]),
    SecurityPreset: z.enum(["", "basic", "service", "net", "debug"]),
    Image: z.string(),
    Resources: z.object({ CPURequest: z.string(), MemoryRequest: z.string(), CPULimit: z.string(), MemoryLimit: z.string() }),
    Interfaces: z.array(interfaceSchema),
    EnvVars: z.array(envVarSchema),
    External: externalSchema,
    Persistence: z.object({ Enabled: z.boolean(), Debounce: z.string() }).optional(),
  })
  .superRefine((d, ctx) => {
    const nameError = d.Type === "container" ? containerNameError(d.Name) : d.Name.trim() ? null : t("admin.ex.val.deviceDisplayName")
    if (nameError) ctx.addIssue({ code: "custom", path: ["Name"], message: nameError })
    const forwarding = d.Type === "unmanaged-switch" || d.Type === "hub"
    const hasResources = Object.values(d.Resources).some(Boolean)
    if (forwarding && (d.Image !== "" || d.Interfaces.length > 0 || d.EnvVars.length > 0 || d.External.Enabled || d.Persistence?.Enabled || d.SecurityPreset !== "" || hasResources)) {
      ctx.addIssue({ code: "custom", path: ["Type"], message: t("admin.ex.val.forwardingBare") })
    }
    if (!forwarding && d.Interfaces.length === 0) {
      ctx.addIssue({ code: "custom", path: ["Interfaces"], message: t("admin.ex.val.interfacesRequired") })
    }
    for (const field of ["CPURequest", "MemoryRequest", "CPULimit", "MemoryLimit"] as const) {
      const value = d.Resources[field]
      if (value !== "" && quantityValue(value) === null) ctx.addIssue({ code: "custom", path: ["Resources", field], message: t("admin.ex.val.resourceQuantity") })
    }
    for (const [request, limit] of [["CPURequest", "CPULimit"], ["MemoryRequest", "MemoryLimit"]] as const) {
      const requestValue = quantityValue(d.Resources[request])
      const limitValue = quantityValue(d.Resources[limit])
      if (requestValue !== null && limitValue !== null && requestValue > limitValue) {
        ctx.addIssue({ code: "custom", path: ["Resources", request], message: t("admin.ex.val.resourceRequestLimit") })
      }
    }
  })

const endpointSchema = z
  .object({
    Kind: z.enum(["device", "vpn", "internet"]),
    DeviceID: z.string(),
    Interface: z.string(),
  })
  .superRefine((ep, ctx) => {
    if (ep.Kind === "device") {
      if (ep.DeviceID === "") {
        ctx.addIssue({ code: "custom", path: ["DeviceID"], message: t("admin.ex.val.endpointDevice") })
      }
    } else {
      // VPN and Internet expose exactly one logical port.
      if (ep.DeviceID !== "" || ep.Interface !== GATEWAY_PORT) {
        ctx.addIssue({ code: "custom", path: ["DeviceID"], message: t("admin.ex.val.endpointGateway") })
      }
    }
  })

const connectionSchema = z.object({
  Endpoints: z.array(endpointSchema).length(2, t("admin.ex.val.connectionArity")),
})

const topologySchema = z
  .object({
    VPN: networkSchema,
    Internet: networkSchema,
    Devices: z.array(deviceSchema),
    Connections: z.array(connectionSchema),
    VisualRender: z.custom<Record<string, unknown> | null>((value) => value === null || (typeof value === "object" && !Array.isArray(value))),
  })
  .superRefine((topology, ctx) => {
    if (topology.VPN.DNS) {
      ctx.addIssue({ code: "custom", path: ["VPN", "DNS"], message: t("admin.ex.val.internetDns") })
    }
    if (topology.Internet.DNS && ipFamily(topology.Internet.DNS) !== "ipv4") {
      ctx.addIssue({ code: "custom", path: ["Internet", "DNS"], message: t("admin.ex.val.internetDns") })
    }
    // The backend exposes VPN/Internet as singleton gateways: each may occur
    // in at most one connection, even when both endpoints are in the same row.
    const usedGateways = new Set<string>()
    topology.Connections.forEach((connection, ci) => connection.Endpoints.forEach((ep, side) => {
      if (ep.Kind !== "vpn" && ep.Kind !== "internet") return
      const enabled = ep.Kind === "vpn" ? topology.VPN.Enabled : topology.Internet.Enabled
      if (!enabled || usedGateways.has(ep.Kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["Connections", ci, "Endpoints", side],
          message: t(!enabled ? "admin.ex.val.gatewayDisabled" : "admin.ex.val.gatewayAlreadyConnected"),
        })
      }
      usedGateways.add(ep.Kind)
    }))
    // Device endpoints must resolve to a declared container interface or a
    // fixed logical forwarding port, occupied by at most one connection.
    const usedPorts = new Set<string>()
    topology.Connections.forEach((connection, ci) => {
      connection.Endpoints.forEach((ep, side) => {
        if (ep.Kind !== "device") return
        const device = topology.Devices.find((d) => d.ID === ep.DeviceID)
        if (!device) {
          ctx.addIssue({
            code: "custom",
            path: ["Connections", ci, "Endpoints", side, "DeviceID"],
            message: t("admin.ex.val.endpointUnresolved"),
          })
          return
        }
        const forwarding = device.Type === "unmanaged-switch" || device.Type === "hub"
        if (forwarding ? !isForwardingPort(ep.Interface) : !device.Interfaces.some((iface) => iface.Name === ep.Interface)) {
          ctx.addIssue({
            code: "custom",
            path: ["Connections", ci, "Endpoints", side, "Interface"],
            message: t("admin.ex.val.endpointUnresolved"),
          })
          return
        }
        const key = `${ep.DeviceID}\0${ep.Interface}`
        if (usedPorts.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["Connections", ci, "Endpoints", side, "Interface"],
            message: t("admin.ex.val.portInUse"),
          })
        }
        usedPorts.add(key)
      })
    })
    const usedAddresses = new Set<string>()
    const sourceEnabled = (network: "vpn" | "internet") => network === "vpn" ? topology.VPN.Enabled : topology.Internet.Enabled
    topology.Devices.forEach((device, di) => device.Interfaces.forEach((iface, ii) => {
      const ip = iface.IP
      const path = ["Devices", di, "Interfaces", ii, "IP"]
      if (ip.AddressRef) {
        const { Network, Host } = ip.AddressRef
        const key = `${Network}:${Host}`
        if (!sourceEnabled(Network) || usedAddresses.has(key)) {
          ctx.addIssue({ code: "custom", path: [...path, "AddressRef"], message: t("admin.ex.val.addressRefSource") })
        }
        usedAddresses.add(key)
      }
      if (ip.GatewayRef && !sourceEnabled(ip.GatewayRef.Network)) {
        ctx.addIssue({ code: "custom", path: [...path, "GatewayRef"], message: t("admin.ex.val.addressRefSource") })
      }
      ip.Routes.forEach((route, ri) => {
        if (route.DstRef && !sourceEnabled(route.DstRef.Network)) {
          ctx.addIssue({ code: "custom", path: [...path, "Routes", ri, "DstRef"], message: t("admin.ex.val.addressRefSource") })
        }
        if (route.ViaRef && !sourceEnabled(route.ViaRef.Network)) {
          ctx.addIssue({ code: "custom", path: [...path, "Routes", ri, "ViaRef"], message: t("admin.ex.val.addressRefSource") })
        }
      })
    }))
  })

const placeholderSchema = z
  .object({
    Key: z.string().min(1),
    Kind: z.enum(["vpn.subnet", "internet.subnet", "ip", "external.link"]),
    IPReference: z.string(),
    Octets1to3: z.string(),
    LastOctet: z.number().int().min(0, t("admin.ex.val.lastOctet")).max(255, t("admin.ex.val.lastOctet")),
    ShowMask: z.boolean(),
    DeviceName: z.string(),
    AsLink: z.boolean().optional(),
    Scheme: z.string().optional(),
    PortText: z.string().optional(),
    Path: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.Kind === "ip" && p.AsLink) {
      if (!(LINK_SCHEMES as readonly string[]).includes(p.Scheme ?? "")) {
        ctx.addIssue({ code: "custom", path: ["Scheme"], message: t("admin.ex.val.placeholderScheme") })
      }
      if (!isValidLinkPort(p.PortText ?? "")) {
        ctx.addIssue({ code: "custom", path: ["PortText"], message: t("admin.ex.val.placeholderPort") })
      }
      if (!isValidLinkPath(p.Path ?? "")) {
        ctx.addIssue({ code: "custom", path: ["Path"], message: t("admin.ex.val.placeholderPath") })
      }
      if (p.ShowMask) {
        ctx.addIssue({ code: "custom", path: ["ShowMask"], message: t("admin.ex.val.placeholderLinkMask") })
      }
    }
    if (p.Kind === "ip" && !["vpn", "internet", "static"].includes(p.IPReference)) {
      ctx.addIssue({ code: "custom", path: ["IPReference"], message: t("admin.ex.val.placeholderIPRef") })
    }
    if (p.Kind === "external.link" && p.DeviceName === "") {
      ctx.addIssue({ code: "custom", path: ["DeviceName"], message: t("admin.ex.val.placeholderDevice") })
    }
  })

// Text may stay empty while a draft autosaves; publish requires it (the draft
// refinement below, mirrored by the server's 20951).
const hintSchema = z.object({
  ID: z.string(),
  Text: z.string().max(MAX_HINT_TEXT, t("exercises.hints.val.text")),
  Level: z.enum(HINT_LEVELS, { error: t("exercises.hints.val.level") }),
})

const taskSchema = z.object({
  ID: z.string(),
  Name: z.string().trim().min(3, t("admin.ex.val.taskName")).max(50, t("admin.ex.val.taskName")),
  Description: z.custom<Record<string, unknown> | null>(
    (v) => v === null || (typeof v === "object" && v !== null && !Array.isArray(v)),
  ),
  Difficulty: z.enum(["elementary", "trivial", "easy", "medium", "hard", "insane"]),
  Flag: z.array(z.string().superRefine((value, ctx) => {
    try { parseFlagCandidate(value) } catch (error) {
      ctx.addIssue({ code: "custom", message: t(flagCandidateErrorKey(error)) })
    }
  })).superRefine((flags, ctx) => {
    const seen = new Set<string>()
    flags.forEach((flag, index) => {
      if (seen.has(flag)) ctx.addIssue({ code: "custom", path: [index], message: t("admin.ex.val.flagDuplicate") })
      seen.add(flag)
    })
  }),
  LinkedDeviceID: z.string(),
  DeviceFlagVar: z.string(),
  Attachments: z.array(z.object({ FileID: z.string(), Name: z.string() })),
  Placeholders: z.array(placeholderSchema),
  Hints: z.array(hintSchema).max(MAX_HINTS, t("exercises.hints.val.max")),
})

const variantSchema = z.object({
  ID: z.string(),
  Index: z.number().int(),
  Note: z.string(),
  Tasks: z.array(taskSchema).min(1, t("admin.ex.val.taskRequired")),
  Topology: topologySchema,
})

export const draftSchema = z
  .object({
    AdminNote: z.string(),
    Variants: z.array(variantSchema).min(1, t("admin.ex.val.variantRequired")),
  })
  .superRefine((draft, ctx) => {
    // Domain invariant ErrTaskCountMismatch: every variant has the same number of tasks.
    const expected = draft.Variants[0]?.Tasks.length ?? 0
    draft.Variants.forEach((variant, i) => {
      const usedFlagTargets = new Set<string>()
      variant.Tasks.forEach((task, taskIndex) => {
        task.Hints.forEach((hint, hintIndex) => {
          if (!hintTextHasContent(hint.Text)) {
            ctx.addIssue({ code: "custom", path: ["Variants", i, "Tasks", taskIndex, "Hints", hintIndex, "Text"], message: t("exercises.hints.val.textRequired") })
          }
        })
        if (task.LinkedDeviceID) {
          const device = variant.Topology.Devices.find((candidate) => candidate.ID === task.LinkedDeviceID)
          if (!device || device.Type === "unmanaged-switch" || device.Type === "hub") {
            ctx.addIssue({
              code: "custom",
              path: ["Variants", i, "Tasks", taskIndex, "LinkedDeviceID"],
              message: t("admin.ex.val.linkedDeviceUnavailable"),
            })
          }
        }
        if (task.LinkedDeviceID && !task.DeviceFlagVar.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["Variants", i, "Tasks", taskIndex, "DeviceFlagVar"],
            message: t("admin.ex.val.deviceFlagVarRequired"),
          })
        }
        if (task.LinkedDeviceID && task.DeviceFlagVar) {
          const device = variant.Topology.Devices.find((candidate) => candidate.ID === task.LinkedDeviceID)
          const target = `${task.LinkedDeviceID}\0${task.DeviceFlagVar}`
          if (device?.EnvVars.some((variable) => variable.Name === task.DeviceFlagVar) || usedFlagTargets.has(target)) {
            ctx.addIssue({ code: "custom", path: ["Variants", i, "Tasks", taskIndex, "DeviceFlagVar"], message: t("admin.ex.val.deviceFlagVarConflict") })
          }
          usedFlagTargets.add(target)
        }
      })
      if (variant.Tasks.length !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["Variants", i, "Tasks"],
          message: t("admin.ex.val.taskCountMismatch"),
        })
      }
      if (i > 0) variant.Tasks.forEach((task, taskIndex) => {
        const canonical = draft.Variants[0].Tasks[taskIndex]
        if (canonical && !hintsAligned(task.Hints, canonical.Hints)) {
          ctx.addIssue({
            code: "custom",
            path: ["Variants", i, "Tasks", taskIndex, "Hints"],
            message: t("exercises.hints.val.mismatch"),
          })
        }
        if (canonical && task.Difficulty !== canonical.Difficulty) {
          ctx.addIssue({
            code: "custom",
            path: ["Variants", i, "Tasks", taskIndex, "Difficulty"],
            message: t("admin.ex.val.taskDifficultyMismatch"),
          })
        }
      })
    })
  })

// ── Empty-value factories ────────────────────────────────────────────────────────

export function emptyTask(): TaskFormValues {
  return {
    ID: "",
    Name: "",
    Description: null,
    Difficulty: "easy",
    Flag: [],
    LinkedDeviceID: "",
    DeviceFlagVar: "",
    Attachments: [],
    Placeholders: [],
    Hints: [],
  }
}

export function emptyInterface(): NormalizedInterface {
  return { Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }
}

export function emptyDevice(): DeviceFormValues {
  return {
    ID: crypto.randomUUID(), // client-side ID: Connections/LinkedDeviceID can reference it immediately
    Name: "",
    Type: "container",
    SecurityPreset: "",
    Image: "",
    Resources: { CPURequest: "", MemoryRequest: "", CPULimit: "", MemoryLimit: "" },
    Interfaces: [emptyInterface()],
    EnvVars: [],
    External: { Enabled: false, Port: 80, Protocol: "http" },
    Persistence: { Enabled: false, Debounce: "" },
  }
}

export function emptyPlaceholder(): PlaceholderFormValues {
  return { Key: `ph_${crypto.randomUUID().replaceAll("-", "")}`, Kind: "ip", IPReference: "static", Octets1to3: "", LastOctet: 0, ShowMask: false, DeviceName: "", AsLink: false, Scheme: "http", PortText: "", Path: "" }
}

export function emptyVariant(index: number): VariantFormValues {
  return {
    ID: "",
    Index: index,
    Note: "",
    Tasks: [emptyTask()],
    Topology: {
      VPN: { Enabled: false, DHCP: true, DHCPRanges: [{ Start: 2, End: 254 }] },
      Internet: { Enabled: false, DHCP: true, DHCPRanges: [{ Start: 2, End: 254 }] },
      Devices: [],
      Connections: [],
      VisualRender: null,
    },
  }
}

export function emptyDraft(): DraftFormValues {
  return { AdminNote: "", Variants: [emptyVariant(1)] }
}

// ── Serialization: version → form → saveDraftRequest ────────────────────────────

/** Version (or null — no draft yet) → editor form values. */
export function toDraftFormValues(version: Version | null): DraftFormValues {
  if (!version) return emptyDraft()
  return {
    AdminNote: version.AdminNote,
    Variants: version.Variants.map((v, vi) => ({
      ID: v.ID,
      Index: v.Index,
      Note: v.Note ?? "",
      Tasks: v.Tasks.map((task, ti) => ({
        ...task,
        Placeholders: task.Placeholders.map((p, pi) => ({
          Key: p.Key || `ph_legacy_${vi}_${ti}_${pi}`,
          Kind: p.Kind,
          IPReference: p.IPReference ?? "",
          Octets1to3: p.Octets1to3 ?? "",
          LastOctet: p.LastOctet ?? 0,
          ShowMask: p.ShowMask ?? false,
          DeviceName: p.DeviceName ?? "",
          AsLink: p.AsLink ?? false,
          Scheme: p.Scheme ?? "http",
          PortText: p.Port ? String(p.Port) : "",
          Path: p.Path ?? "",
        })),
      })),
      Topology: {
        VPN: v.Topology.VPN,
        Internet: v.Topology.Internet,
        Devices: v.Topology.Devices.map((d) => ({
          ...d,
          Resources: { CPURequest: d.Resources?.CPURequest ?? "", MemoryRequest: d.Resources?.MemoryRequest ?? "", CPULimit: d.Resources?.CPULimit ?? "", MemoryLimit: d.Resources?.MemoryLimit ?? "" },
          Interfaces: d.Interfaces.map((iface) => ({ ...iface, IP: { ...iface.IP, Routes: iface.IP.Routes ?? [] } })),
          External: d.External
            ? { Enabled: true, Port: d.External.Port, Protocol: d.External.Protocol }
            : { Enabled: false, Port: 80, Protocol: "http" as Protocol },
          Persistence: { Enabled: d.Persistence?.Enabled ?? false, Debounce: d.Persistence?.Debounce ?? "" },
        })),
        Connections: v.Topology.Connections,
        VisualRender: v.Topology.VisualRender,
      },
    })),
  }
}

function placeholderToDTO(p: PlaceholderFormValues): PlaceholderDTO {
  switch (p.Kind) {
    case "ip":
      return {
        Key: p.Key,
        Kind: p.Kind,
        IPReference: p.IPReference,
        LastOctet: p.LastOctet,
        ShowMask: p.AsLink ? false : p.ShowMask,
        ...(p.IPReference === "static" ? { Octets1to3: p.Octets1to3 } : {}),
        ...(p.AsLink ? {
          AsLink: true,
          Scheme: p.Scheme || "http",
          ...(p.PortText ? { Port: Number(p.PortText) } : {}),
          ...(p.Path ? { Path: p.Path } : {}),
        } : {}),
      }
    case "external.link":
      return { Key: p.Key, Kind: p.Kind, DeviceName: p.DeviceName }
    default:
      // Both subnet kinds can be rendered as an address or as a CIDR.
      return { Key: p.Key, Kind: p.Kind, ...(p.ShowMask ? { ShowMask: true } : {}) }
  }
}

function taskToDTO(task: TaskFormValues): TaskDTO {
  return {
    ...(task.ID ? { ID: task.ID } : {}),
    Name: task.Name,
    ...(task.Description ? { Description: task.Description } : {}),
    Difficulty: task.Difficulty,
    Flag: task.Flag,
    ...(task.LinkedDeviceID ? { LinkedDeviceID: task.LinkedDeviceID, DeviceFlagVar: task.DeviceFlagVar } : {}),
    Attachments: task.Attachments,
    Placeholders: task.Placeholders.map(placeholderToDTO),
    Hints: task.Hints.map((hint) => ({ ...(hint.ID ? { ID: hint.ID } : {}), Text: hint.Text, Level: hint.Level })),
  }
}

function interfaceToDTO(iface: NormalizedInterface): InterfaceDTO {
  return {
    Name: iface.Name,
    ...(iface.MAC ? { MAC: iface.MAC } : {}),
    IP: {
      Type: iface.IP.Type,
      ...(iface.IP.Type === "static"
        ? {
          ...(iface.IP.AddressRef ? { AddressRef: iface.IP.AddressRef } : { Addresses: iface.IP.Addresses }),
          ...(iface.IP.GatewayRef ? { GatewayRef: iface.IP.GatewayRef } : iface.IP.Gateway ? { Gateway: iface.IP.Gateway } : {}),
          ...(iface.IP.Routes.length ? { Routes: iface.IP.Routes.map((route) => ({
            ...(route.DstRef ? { DstRef: route.DstRef } : { Dst: route.Dst }),
            ...(route.ViaRef ? { ViaRef: route.ViaRef } : { Via: route.Via }),
          })) } : {}),
        }
        : {}),
    },
  }
}

function deviceToDTO(d: DeviceFormValues): DeviceDTO {
  // The device ID ALWAYS goes out (client-side uuid for new devices): Connections
  // and LinkedDeviceID reference it.
  const base: DeviceDTO = { ID: d.ID, Name: d.Name, Type: d.Type }
  if (d.Type === "unmanaged-switch" || d.Type === "hub") return base // switch/hub is "bare"
  return {
    ...base,
    ...(d.SecurityPreset ? { SecurityPreset: d.SecurityPreset } : {}),
    ...(d.Image ? { Image: d.Image } : {}),
    ...(Object.values(d.Resources).some(Boolean) ? { Resources: Object.fromEntries(Object.entries(d.Resources).filter(([, value]) => value)) } : {}),
    Interfaces: d.Interfaces.map(interfaceToDTO),
    EnvVars: d.EnvVars.map((ev) => ({ Name: ev.Name, Value: ev.Value, Secret: ev.Secret })),
    ...(d.External.Enabled ? { External: { Port: d.External.Port, Protocol: d.External.Protocol } } : {}),
    ...(d.Persistence?.Enabled ? { Persistence: { Enabled: true, ...(d.Persistence.Debounce ? { Debounce: d.Persistence.Debounce } : {}) } } : {}),
  }
}

function topologyToDTO(topology: TopologyFormValues): TopologyDTO {
  const connections: ConnectionDTO[] = topology.Connections.map((c) => ({
    Endpoints: c.Endpoints.map((ep) =>
      ep.Kind === "device"
        ? { Kind: ep.Kind, DeviceID: ep.DeviceID, ...(ep.Interface ? { Interface: ep.Interface } : {}) }
        : { Kind: ep.Kind, Interface: GATEWAY_PORT },
    ),
  }))
  return {
    VPN: networkToDTO(topology.VPN),
    Internet: networkToDTO(topology.Internet),
    Devices: topology.Devices.map(deviceToDTO),
    Connections: connections,
    ...(topology.VisualRender ? { VisualRender: topology.VisualRender } : {}),
  }
}

function networkToDTO(network: TopologyFormValues["VPN"]): TopologyDTO["VPN"] {
  return {
    Enabled: network.Enabled,
    DHCP: network.DHCP,
    ...(network.Enabled && network.DHCP ? { DHCPRanges: network.DHCPRanges } : {}),
    ...(network.DNS ? { DNS: network.DNS } : {}),
  }
}

/** Form values → PUT /:id/draft (1:1, Index is renumbered by position). */
export function toSaveDraftInput(values: DraftFormValues): SaveDraftInput {
  const variants: VariantDTO[] = values.Variants.map((v, i) => ({
    ...(v.ID ? { ID: v.ID } : {}),
    Index: i + 1,
    ...(v.Note ? { Note: v.Note } : {}),
    Tasks: v.Tasks.map(taskToDTO),
    Topology: topologyToDTO(v.Topology),
  }))
  return {
    AdminNote: values.AdminNote,
    Variants: variants,
  }
}
