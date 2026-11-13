/**
 * infra.ts — the INFRASTRUCTURE half of the editor form model (owner: package C, seeded by the foundation).
 *
 * Form types, zod schemas, factories and form <-> wire converters for the topology of a variant: networks, devices
 * (profile, image, interfaces, access, command, bootstrap), connections and the variables of the schema.
 * `lib/exerciseSchemas.ts` composes this with the task half (`./task`) and re-exports both.
 *
 * The messages of the validation live in `messages/editor/c.*.json` (prefix `ed.c.val.`) next to the older
 * `admin.ex.val.*` keys that are still used here.
 */
import { z } from "zod"
import ipaddr from "ipaddr.js"
import { t } from "@/i18n/t"
import { GATEWAY_PORT, isForwardingPort } from "@/lib/topologyPorts"
import {
  MAX_ACCESS_ENTRIES, MAX_BOOTSTRAP_CONTENT_BYTES, MAX_BOOTSTRAP_ENV, MAX_BOOTSTRAP_FILES, MAX_BOOTSTRAP_SCRIPT_BYTES, MAX_DEVICE_ARGS, MAX_DEVICE_COMMAND,
  MAX_VARIABLES, MAX_VARIABLE_VALUE_BYTES, TASK_KEY_RE, type AccessKind, type AccessProtocol, type BootstrapDTO, type EnvVarDTO, type VariableDTO,
} from "@/api/exercises/model"
import { isGatewayType, type GatewayDeviceType } from "@/api/exercises/versions"
import type {
  ConnectionDTO, DeviceDTO, InterfaceDTO, NormalizedDevice, NormalizedEnvVar, NormalizedInterface, NormalizedTopology, PersistenceDTO, TopologyDTO,
} from "@/api/exercises/versions"
import { durationSeconds } from "./task"

// ── Regexes and parsers (mirror the domain) ─────────────────────────────────────

/**
 * A node's name becomes part of the lab's web address
 * (<name>-<code>.<domain>, code is 3-4 random chars), which must be one 63-char
 * DNS label; we use 35 for a round limit. Keep in sync with the backend and laboratory.
 */
export const MAX_DEVICE_NAME_LEN = 35
export const DNS_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,33}[a-z0-9])?$/

/** Inline error for a node name, or null when it is valid. */
export function containerNameError(name: string): string | null {
  if (name.length > MAX_DEVICE_NAME_LEN) return t("admin.ex.val.deviceNameTooLong", { max: MAX_DEVICE_NAME_LEN })
  return DNS_LABEL_RE.test(name) ? null : t("admin.ex.val.deviceName")
}
/** Inline error for the name of a gateway (a device of its own kind: the device rule, no reserved names), or null. */
export const gatewayNameError = containerNameError
/** Interface name: filled in, at most 15 characters, letters, digits and . _ -, unique on the device. Empty string = valid. */
export function interfaceNameError(name: string, others: string[]): string {
  if (name === "") return t("ed.c.val.ifaceRequired")
  if (name.length > 15) return t("ed.c.val.ifaceLength")
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return t("ed.c.val.ifaceChars")
  if (others.includes(name)) return t("ed.c.val.ifaceDuplicate")
  return ""
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

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const USER_RE = /^([a-z_][a-z0-9_-]{0,31}|\d+)$/
const MODE_RE = /^[0-7]{3,4}$/
const textBytes = (value: string) => new TextEncoder().encode(value).length

// ── Form types ────────────────────────────────────────────────────────────────

/** Only a container keeps its state across a restart: a microVM or a VM has no such setting. */
export const profileKeepsState = (profile: string): boolean => profile === "container"

/** Persistence in the form: Debounce is not edited here, it only travels back as loaded. */
export type PersistenceFormValues = { Enabled: boolean; Debounce: string }

/** One entry of the access list; Port is typed text ("" = not set). */
export type AccessFormEntry = { Kind: AccessKind; Port: string; Protocol: AccessProtocol; Command: string; User: string }

/** A file placed before the service starts: typed text or an uploaded file. */
export type BootstrapFileForm = {
  Path: string
  /** text: Content is used; file: Source is used (exactly one goes to the wire). */
  From: "text" | "file"
  Content: string
  Source: { FileID: string; Name: string; ContentHash?: string } | null
  Owner: string
  Group: string
  Mode: string
}
export type BootstrapFormValues = { Timeout: string; Env: NormalizedEnvVar[]; Files: BootstrapFileForm[]; Script: string; Interpreter: string }

export type DeviceFormValues = Omit<NormalizedDevice, "Access" | "Bootstrap" | "Persistence"> & {
  Access: AccessFormEntry[]
  Bootstrap: BootstrapFormValues
  Persistence?: PersistenceFormValues
}

/** A variable of the schema: a fixed value or a template; Text is the value or the template. */
export type VariableFormValues = { Name: string; Kind: "value" | "template"; Text: string }

export type TopologyFormValues = Omit<NormalizedTopology, "Devices" | "Variables"> & { Devices: DeviceFormValues[]; Variables: VariableFormValues[] }

/** Daemon limit of environment variables per device. */
export const MAX_ENV_VARS = MAX_BOOTSTRAP_ENV

// ── Schemas ───────────────────────────────────────────────────────────────────

const networkIPRefSchema = z.object({ Gateway: z.string(), Host: z.number().int() })
const networkSubnetRefSchema = z.object({ Gateway: z.string() })

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
  Name: z.string(),
  MAC: z.string().refine((v) => v === "" || MAC_RE.test(v), t("admin.ex.val.mac")),
  IP: ipConfigSchema,
})

const envVarSchema = z.object({
  Name: z.string(),
  Value: z.string(),
  Secret: z.boolean(),
  HasValue: z.boolean(),
  ValueGroup: z.number().int().optional(),
}).superRefine((variable, ctx) => {
  if (variable.Secret && !variable.HasValue && variable.Value === "") {
    ctx.addIssue({ code: "custom", path: ["Value"], message: t("admin.ex.val.secretValue") })
  }
  if (variable.Name === "" ? variable.Value !== "" : !ENV_NAME_RE.test(variable.Name)) {
    ctx.addIssue({ code: "custom", path: ["Name"], message: t("ed.c.val.envName") })
  }
  if (textBytes(variable.Value) > 4096) ctx.addIssue({ code: "custom", path: ["Value"], message: t("ed.c.val.envValueBytes", { max: 4096 }) })
})

const accessSchema = z.object({
  Kind: z.enum(["http", "terminal", "vnc", "rdp"]),
  Port: z.string(),
  Protocol: z.enum(["http", "https"]),
  Command: z.string(),
  User: z.string(),
}).superRefine((entry, ctx) => {
  if (entry.Kind === "terminal") {
    if (entry.Command && !entry.Command.startsWith("/")) ctx.addIssue({ code: "custom", path: ["Command"], message: t("ed.c.val.terminalCommand") })
    if (entry.User && !USER_RE.test(entry.User)) ctx.addIssue({ code: "custom", path: ["User"], message: t("ed.c.val.terminalUser") })
    return
  }
  const port = Number(entry.Port)
  if (entry.Port.trim() === "" || !Number.isInteger(port) || port < 1 || port > 65535) {
    ctx.addIssue({ code: "custom", path: ["Port"], message: t(entry.Kind === "http" ? "ed.c.val.accessPortWeb" : "ed.c.val.accessPort") })
  }
})

const bootstrapFileSchema = z.object({
  Path: z.string(),
  From: z.enum(["text", "file"]),
  Content: z.string(),
  Source: z.object({ FileID: z.string(), Name: z.string(), ContentHash: z.string().optional() }).nullable(),
  Owner: z.string(),
  Group: z.string(),
  Mode: z.string(),
}).superRefine((file, ctx) => {
  if (!file.Path.startsWith("/") || /(^|\/)\.\.?(\/|$)/.test(file.Path)) ctx.addIssue({ code: "custom", path: ["Path"], message: t("ed.c.val.filePath") })
  if (file.From === "file" && !file.Source) ctx.addIssue({ code: "custom", path: ["Source"], message: t("ed.c.val.fileSource") })
  if (file.From === "text" && textBytes(file.Content) > MAX_BOOTSTRAP_CONTENT_BYTES) ctx.addIssue({ code: "custom", path: ["Content"], message: t("ed.c.val.fileContentBytes", { max: "64 KiB" }) })
  if (file.Mode && !MODE_RE.test(file.Mode)) ctx.addIssue({ code: "custom", path: ["Mode"], message: t("ed.c.val.mode") })
  for (const key of ["Owner", "Group"] as const) if (file[key] && !USER_RE.test(file[key])) ctx.addIssue({ code: "custom", path: [key], message: t("ed.c.val.owner") })
})

const bootstrapSchema = z.object({
  Timeout: z.string(),
  Env: z.array(envVarSchema),
  Files: z.array(bootstrapFileSchema),
  Script: z.string(),
  Interpreter: z.string(),
}).superRefine((bootstrap, ctx) => {
  if (bootstrap.Timeout.trim()) {
    const seconds = durationSeconds(bootstrap.Timeout)
    if (seconds === null || seconds < 1 || seconds > 600) ctx.addIssue({ code: "custom", path: ["Timeout"], message: t("ed.c.val.bootstrapTimeout") })
  }
  if (bootstrap.Env.length > MAX_BOOTSTRAP_ENV) ctx.addIssue({ code: "custom", path: ["Env"], message: t("admin.ex.val.envVarsMax", { max: MAX_BOOTSTRAP_ENV }) })
  const names = new Set<string>()
  bootstrap.Env.forEach((variable, index) => {
    if (variable.Name && names.has(variable.Name)) ctx.addIssue({ code: "custom", path: ["Env", index, "Name"], message: t("ed.c.val.envDuplicate") })
    names.add(variable.Name)
  })
  if (bootstrap.Files.length > MAX_BOOTSTRAP_FILES) ctx.addIssue({ code: "custom", path: ["Files"], message: t("ed.c.val.filesMax", { max: MAX_BOOTSTRAP_FILES }) })
  const paths = new Set<string>()
  bootstrap.Files.forEach((file, index) => {
    if (file.Path && paths.has(file.Path)) ctx.addIssue({ code: "custom", path: ["Files", index, "Path"], message: t("ed.c.val.filePathDuplicate") })
    paths.add(file.Path)
  })
  if (textBytes(bootstrap.Script) > MAX_BOOTSTRAP_SCRIPT_BYTES) ctx.addIssue({ code: "custom", path: ["Script"], message: t("ed.c.val.scriptBytes", { max: "64 KiB" }) })
  if (bootstrap.Interpreter && !bootstrap.Script.trim()) ctx.addIssue({ code: "custom", path: ["Interpreter"], message: t("ed.c.val.interpreterNeedsScript") })
  if (bootstrap.Interpreter && !bootstrap.Interpreter.startsWith("/")) ctx.addIssue({ code: "custom", path: ["Interpreter"], message: t("ed.c.val.pathAbsolute") })
})

const deviceSchema = z
  .object({
    ID: z.string(),
    Name: z.string(),
    Type: z.enum(["node", "unmanaged-switch", "hub", "vpn_gateway", "internet_gateway"]),
    Profile: z.enum(["container", "microvm", "vm"]),
    SecurityPreset: z.enum(["", "standard", "extended"]),
    Image: z.string(),
    ResourcePreset: z.string(),
    Interfaces: z.array(interfaceSchema),
    Access: z.array(accessSchema),
    Command: z.array(z.string()),
    Args: z.array(z.string()),
    System: z.enum(["linux", "windows"]),
    Hardware: z.enum(["fast", "compatible"]),
    Bootstrap: bootstrapSchema,
    Persistence: z.object({ Enabled: z.boolean(), Debounce: z.string() }).optional(),
    WaitReadyFile: z.boolean().optional(),
    DHCP: z.boolean(),
    DHCPRanges: z.array(z.object({ Start: z.number().int(), End: z.number().int() })),
    DNS: z.string(),
    ReverseConnections: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const node = d.Type === "node"
    const gateway = isGatewayType(d.Type)
    const nameError = node ? containerNameError(d.Name) : gateway ? gatewayNameError(d.Name) : d.Name.trim() ? null : t("admin.ex.val.deviceDisplayName")
    if (nameError) ctx.addIssue({ code: "custom", path: ["Name"], message: nameError })
    if (gateway) {
      if (d.DHCP && d.DHCPRanges.length === 0) ctx.addIssue({ code: "custom", path: ["DHCPRanges"], message: t("admin.ex.val.dhcpRangesRequired") })
      const used = new Set<number>()
      d.DHCPRanges.forEach((range) => {
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
      if (d.DNS && (d.Type !== "internet_gateway" || ipFamily(d.DNS) !== "ipv4")) ctx.addIssue({ code: "custom", path: ["DNS"], message: t("admin.ex.val.internetDns") })
      if (d.ReverseConnections && d.Type !== "vpn_gateway") ctx.addIssue({ code: "custom", path: ["ReverseConnections"], message: t("ed.c.val.reverseNeedsVpn") })
    } else if (d.DHCP || d.DHCPRanges.length > 0 || d.DNS !== "" || d.ReverseConnections) {
      ctx.addIssue({ code: "custom", path: ["Type"], message: t("ed.c.val.gatewayKeysOnly") })
    }
    if (!node && (d.Image !== "" || d.Interfaces.length > 0 || d.Access.length > 0 || d.Command.length > 0 || d.Args.length > 0 || hasBootstrap(d.Bootstrap) || d.Persistence?.Enabled || d.WaitReadyFile || d.SecurityPreset !== "" || d.ResourcePreset !== "")) {
      ctx.addIssue({ code: "custom", path: ["Type"], message: t("admin.ex.val.forwardingBare") })
    }
    if (node && d.Interfaces.length === 0) {
      ctx.addIssue({ code: "custom", path: ["Interfaces"], message: t("admin.ex.val.interfacesRequired") })
    }
    d.Interfaces.forEach((iface, index) => {
      const message = interfaceNameError(iface.Name, d.Interfaces.filter((_, other) => other !== index).map((other) => other.Name))
      if (message) ctx.addIssue({ code: "custom", path: ["Interfaces", index, "Name"], message })
    })
    if (node && d.Profile !== "vm" && (d.System === "windows" || d.Hardware === "compatible")) {
      ctx.addIssue({ code: "custom", path: [d.System === "windows" ? "System" : "Hardware"], message: t("ed.c.val.vmOnly") })
    }
    if (d.Access.length > MAX_ACCESS_ENTRIES) ctx.addIssue({ code: "custom", path: ["Access"], message: t("ed.c.val.accessMax", { max: MAX_ACCESS_ENTRIES }) })
    const kinds = new Set<AccessKind>()
    d.Access.forEach((entry, index) => {
      if (kinds.has(entry.Kind)) ctx.addIssue({ code: "custom", path: ["Access", index, "Kind"], message: t("ed.c.val.accessKindOnce") })
      kinds.add(entry.Kind)
    })
    if (d.Command.length > MAX_DEVICE_COMMAND) ctx.addIssue({ code: "custom", path: ["Command"], message: t("ed.c.val.commandMax", { max: MAX_DEVICE_COMMAND }) })
    if (d.Args.length > MAX_DEVICE_ARGS) ctx.addIssue({ code: "custom", path: ["Args"], message: t("ed.c.val.argsMax", { max: MAX_DEVICE_ARGS }) })
  })

const endpointSchema = z
  .object({
    Kind: z.literal("device"),
    DeviceID: z.string(),
    Interface: z.string(),
  })
  .superRefine((ep, ctx) => {
    if (ep.DeviceID === "") ctx.addIssue({ code: "custom", path: ["DeviceID"], message: t("admin.ex.val.endpointDevice") })
  })

const connectionSchema = z.object({
  Endpoints: z.array(endpointSchema).length(2, t("admin.ex.val.connectionArity")),
})

const variableSchema = z.object({
  Name: z.string(),
  Kind: z.enum(["value", "template"]),
  Text: z.string(),
}).superRefine((variable, ctx) => {
  if (variable.Name === "") ctx.addIssue({ code: "custom", path: ["Name"], message: t("ed.c.val.variableName") })
  else if (!TASK_KEY_RE.test(variable.Name)) ctx.addIssue({ code: "custom", path: ["Name"], message: t("ed.c.val.variableFormat") })
  if (variable.Kind === "value" && textBytes(variable.Text) > MAX_VARIABLE_VALUE_BYTES) ctx.addIssue({ code: "custom", path: ["Text"], message: t("ed.c.val.variableBytes", { max: MAX_VARIABLE_VALUE_BYTES }) })
  if (variable.Kind === "template" && variable.Text.trim() === "") ctx.addIssue({ code: "custom", path: ["Text"], message: t("ed.c.val.variableTemplate") })
})

export const topologySchema = z
  .object({
    Variables: z.array(variableSchema).max(MAX_VARIABLES, t("ed.c.val.variablesMax", { max: MAX_VARIABLES })),
    Devices: z.array(deviceSchema),
    Connections: z.array(connectionSchema),
    VisualRender: z.custom<Record<string, unknown> | null>((value) => value === null || (typeof value === "object" && !Array.isArray(value))),
  })
  .superRefine((topology, ctx) => {
    const deviceNames = new Set<string>()
    topology.Devices.forEach((device, index) => {
      if (device.Name && deviceNames.has(device.Name)) ctx.addIssue({ code: "custom", path: ["Devices", index, "Name"], message: t("ed.c.val.deviceNameDuplicate") })
      deviceNames.add(device.Name)
    })
    const names = new Set<string>()
    topology.Variables.forEach((variable, index) => {
      if (variable.Name && names.has(variable.Name)) ctx.addIssue({ code: "custom", path: ["Variables", index, "Name"], message: t("ed.c.val.variableDuplicate") })
      names.add(variable.Name)
    })
    // Device endpoints must resolve to a declared node interface or a
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
        // A gateway has one implicit port, eth0; a switch or hub its fixed logical ports; a node its declared interfaces.
        const portKnown = isGatewayType(device.Type) ? ep.Interface === GATEWAY_PORT : forwarding ? isForwardingPort(ep.Interface) : device.Interfaces.some((iface) => iface.Name === ep.Interface)
        if (!portKnown) {
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
    // At most one gateway per network: the second gateway of one broadcast domain is refused on its own connection.
    const taken = gatewayNetworkConflicts(topology)
    taken.forEach(({ connection, side, other }) => ctx.addIssue({
      code: "custom",
      path: ["Connections", connection, "Endpoints", side, "DeviceID"],
      message: t("ed.c.val.gatewayNetworkTaken", { name: other }),
    }))
    const gatewayNames = new Set(topology.Devices.filter((device) => isGatewayType(device.Type)).map((device) => device.Name))
    const unknownGateway = (path: (string | number)[], name: string) => ctx.addIssue({ code: "custom", path, message: t("ed.c.val.gatewayRefUnknown", { name: name || "—" }) })
    const usedAddresses = new Set<string>()
    topology.Devices.forEach((device, di) => device.Interfaces.forEach((iface, ii) => {
      const ip = iface.IP
      const path = ["Devices", di, "Interfaces", ii, "IP"]
      if (ip.AddressRef) {
        const { Gateway, Host } = ip.AddressRef
        const key = `${Gateway}:${Host}`
        if (!gatewayNames.has(Gateway)) unknownGateway([...path, "AddressRef"], Gateway)
        else if (usedAddresses.has(key)) ctx.addIssue({ code: "custom", path: [...path, "AddressRef"], message: t("admin.ex.val.addressRefSource") })
        usedAddresses.add(key)
      }
      if (ip.GatewayRef && !gatewayNames.has(ip.GatewayRef.Gateway)) unknownGateway([...path, "GatewayRef"], ip.GatewayRef.Gateway)
      ip.Routes.forEach((route, ri) => {
        if (route.DstRef && !gatewayNames.has(route.DstRef.Gateway)) unknownGateway([...path, "Routes", ri, "DstRef"], route.DstRef.Gateway)
        if (route.ViaRef && !gatewayNames.has(route.ViaRef.Gateway)) unknownGateway([...path, "Routes", ri, "ViaRef"], route.ViaRef.Gateway)
      })
    }))
  })

function hasBootstrap(b: BootstrapFormValues): boolean {
  return b.Timeout !== "" || b.Env.length > 0 || b.Files.length > 0 || b.Script !== "" || b.Interpreter !== ""
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function emptyInterface(): NormalizedInterface {
  return { Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }
}

export const emptyBootstrap = (): BootstrapFormValues => ({ Timeout: "", Env: [], Files: [], Script: "", Interpreter: "" })

export const emptyAccess = (kind: AccessKind): AccessFormEntry => ({
  Kind: kind,
  Port: kind === "http" ? "80" : kind === "vnc" ? "5900" : kind === "rdp" ? "3389" : "",
  Protocol: "http",
  Command: "",
  User: "",
})

export const emptyBootstrapFile = (): BootstrapFileForm => ({ Path: "", From: "text", Content: "", Source: null, Owner: "", Group: "", Mode: "" })

export const emptyVariable = (): VariableFormValues => ({ Name: "", Kind: "value", Text: "" })

export function emptyDevice(): DeviceFormValues {
  return {
    ID: crypto.randomUUID(), // client-side ID: Connections and state conditions can reference it immediately
    Name: "",
    Type: "node",
    Profile: "container",
    SecurityPreset: "",
    Image: "",
    ResourcePreset: "",
    Interfaces: [emptyInterface()],
    Access: [],
    Command: [],
    Args: [],
    System: "linux",
    Hardware: "fast",
    Bootstrap: emptyBootstrap(),
    Persistence: { Enabled: false, Debounce: "" },
    WaitReadyFile: false,
    DHCP: false,
    DHCPRanges: [],
    DNS: "",
    ReverseConnections: false,
  }
}

/** A new gateway: no interfaces (its one port eth0 is implicit), DHCP on with the whole range, no DNS, no reverse connections. */
export function emptyGateway(type: GatewayDeviceType, name: string): DeviceFormValues {
  return { ...emptyDevice(), Name: name, Type: type, Interfaces: [], Persistence: undefined, DHCP: true, DHCPRanges: [{ Start: 2, End: 254 }] }
}

export const isGateway = (device: { Type: string }): boolean => isGatewayType(device.Type)

export function emptyTopology(): TopologyFormValues {
  return {
    Variables: [],
    Devices: [],
    Connections: [],
    VisualRender: null,
  }
}

// ── Wire -> form ──────────────────────────────────────────────────────────────

export function deviceToForm(d: NormalizedDevice): DeviceFormValues {
  return {
    ...d,
    ResourcePreset: d.ResourcePreset ?? "",
    Interfaces: d.Interfaces.map((iface) => ({ ...iface, IP: { ...iface.IP, Routes: iface.IP.Routes ?? [] } })),
    Access: d.Access.map((entry) => ({ Kind: entry.Kind, Port: entry.Port ? String(entry.Port) : "", Protocol: entry.Protocol === "https" ? "https" : "http", Command: entry.Command ?? "", User: entry.User ?? "" })),
    Bootstrap: {
      ...d.Bootstrap,
      Files: d.Bootstrap.Files.map((file) => ({ Path: file.Path, From: file.Source ? "file" : "text", Content: file.Content, Source: file.Source ?? null, Owner: file.Owner, Group: file.Group, Mode: file.Mode })),
    },
    Persistence: { Enabled: d.Persistence?.Enabled ?? false, Debounce: d.Persistence?.Debounce ?? "" },
    WaitReadyFile: d.WaitReadyFile ?? false,
  }
}

export function topologyToForm(topology: NormalizedTopology): TopologyFormValues {
  return {
    Variables: topology.Variables.map((variable) => variable.Template !== undefined && variable.Template !== ""
      ? { Name: variable.Name, Kind: "template", Text: variable.Template }
      : { Name: variable.Name, Kind: "value", Text: variable.Value ?? "" }),
    Devices: topology.Devices.map(deviceToForm),
    Connections: topology.Connections,
    VisualRender: topology.VisualRender,
  }
}

// ── Form -> wire ──────────────────────────────────────────────────────────────

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

function envToDTO(ev: NormalizedEnvVar): EnvVarDTO {
  return { Name: ev.Name, Value: ev.Value, Secret: ev.Secret }
}

export function bootstrapToDTO(b: BootstrapFormValues): BootstrapDTO | undefined {
  // A variable without a name and without a value is an unfinished row: it is not sent.
  const env = b.Env.filter((variable) => variable.Name !== "" || variable.Value !== "" || variable.HasValue)
  const files = b.Files.filter((file) => file.Path !== "")
  const out: BootstrapDTO = {
    ...(b.Timeout.trim() ? { Timeout: b.Timeout.trim() } : {}),
    ...(env.length ? { Env: env.map(envToDTO) } : {}),
    ...(files.length ? { Files: files.map((file) => ({
      Path: file.Path,
      ...(file.From === "file" && file.Source ? { Source: { FileID: file.Source.FileID, Name: file.Source.Name } } : { Content: file.Content }),
      ...(file.Owner ? { Owner: file.Owner } : {}),
      ...(file.Group ? { Group: file.Group } : {}),
      ...(file.Mode ? { Mode: file.Mode } : {}),
    })) } : {}),
    ...(b.Script ? { Script: b.Script } : {}),
    ...(b.Script && b.Interpreter ? { Interpreter: b.Interpreter } : {}),
  }
  return Object.keys(out).length ? out : undefined
}

function deviceToDTO(d: DeviceFormValues): DeviceDTO {
  // The device ID ALWAYS goes out (client-side uuid for new devices): Connections
  // and the conditions of a state check reference it.
  const base: DeviceDTO = { ID: d.ID, Name: d.Name, Type: d.Type }
  if (isGatewayType(d.Type)) {
    // A gateway has only its own keys: DHCP (always), the ranges with it, DNS on an Internet gateway, reverse connections on a VPN gateway.
    return {
      ...base,
      DHCP: d.DHCP,
      ...(d.DHCP && d.DHCPRanges.length ? { DHCPRanges: d.DHCPRanges.map(({ Start, End }) => ({ Start, End })) } : {}),
      ...(d.Type === "internet_gateway" && d.DNS ? { DNS: d.DNS } : {}),
      ...(d.Type === "vpn_gateway" && d.ReverseConnections ? { ReverseConnections: true } : {}),
    }
  }
  if (d.Type !== "node") return base // switch/hub is "bare"
  const bootstrap = bootstrapToDTO(d.Bootstrap)
  return {
    ...base,
    ...(d.Profile !== "container" ? { Profile: d.Profile } : {}),
    ...(d.SecurityPreset ? { SecurityPreset: d.SecurityPreset } : {}),
    ...(d.Image ? { Image: d.Image } : {}),
    // A device size is a preset (a whole number of blocks); unset is the platform default.
    ...(d.ResourcePreset ? { ResourcePreset: d.ResourcePreset } : {}),
    Interfaces: d.Interfaces.map(interfaceToDTO),
    ...(d.Access.length ? { Access: d.Access.map((entry) => ({
      Kind: entry.Kind,
      ...(entry.Kind === "terminal"
        ? { ...(entry.Command ? { Command: entry.Command } : {}), ...(entry.User ? { User: entry.User } : {}) }
        : { Port: Number(entry.Port), ...(entry.Kind === "http" && entry.Protocol === "https" ? { Protocol: "https" as const } : {}) }),
    })) } : {}),
    ...(d.Command.length ? { Command: d.Command } : {}),
    ...(d.Args.length ? { Args: d.Args } : {}),
    ...(d.Profile === "vm" && d.System !== "linux" ? { System: d.System } : {}),
    ...(d.Profile === "vm" && d.Hardware !== "fast" ? { Hardware: d.Hardware } : {}),
    ...(bootstrap ? { Bootstrap: bootstrap } : {}),
    ...(d.Profile === "container" && d.Persistence?.Enabled ? { Persistence: { Enabled: true, ...(d.Persistence.Debounce ? { Debounce: d.Persistence.Debounce } : {}) } satisfies PersistenceDTO } : {}),
    ...(d.WaitReadyFile ? { WaitReadyFile: true } : {}),
  }
}

function variablesToDTO(variables: VariableFormValues[]): VariableDTO[] {
  return variables.map((variable) => variable.Kind === "template" ? { Name: variable.Name, Template: variable.Text } : { Name: variable.Name, Value: variable.Text })
}

export function topologyToDTO(topology: TopologyFormValues): TopologyDTO {
  const connections: ConnectionDTO[] = topology.Connections.map((c) => ({
    Endpoints: c.Endpoints.map((ep) => ({ Kind: ep.Kind, DeviceID: ep.DeviceID, ...(ep.Interface ? { Interface: ep.Interface } : {}) })),
  }))
  return {
    ...(topology.Variables.length ? { Variables: variablesToDTO(topology.Variables) } : {}),
    Devices: topology.Devices.map(deviceToDTO),
    Connections: connections,
    ...(topology.VisualRender ? { VisualRender: topology.VisualRender } : {}),
  }
}

// ── Gateways and networks ─────────────────────────────────────────────────────

type PortEnd = { DeviceID: string; Interface: string }

/** The vertex of an endpoint in the broadcast-domain graph: a switch or hub joins all its ports, any other port is its own. */
function domainVertex(devices: { ID: string; Type: string }[], end: PortEnd): string {
  const device = devices.find((candidate) => candidate.ID === end.DeviceID)
  return device && (device.Type === "unmanaged-switch" || device.Type === "hub") ? `dev:${end.DeviceID}` : `port:${end.DeviceID}:${end.Interface}`
}

/** Union-find over the connections: the broadcast domains of the topology ("networks"). */
function networkRoots(topology: Pick<TopologyFormValues, "Devices" | "Connections">, extra?: [PortEnd, PortEnd]): (end: PortEnd) => string {
  const parent = new Map<string, string>()
  const find = (v: string): string => {
    let root = v
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string
    parent.set(v, root)
    return root
  }
  const join = (a: PortEnd, b: PortEnd) => {
    const ra = find(domainVertex(topology.Devices, a))
    const rb = find(domainVertex(topology.Devices, b))
    if (ra !== rb) parent.set(ra, rb)
  }
  topology.Connections.forEach((connection) => {
    const [a, b] = connection.Endpoints
    if (a && b) join(a, b)
  })
  if (extra) join(extra[0], extra[1])
  return (end) => find(domainVertex(topology.Devices, end))
}

export type GatewayNetworkConflict = { connection: number; side: number; other: string }

/**
 * Gateways that share a network with another gateway: at most one gateway per network. Each conflict is reported on the
 * connection endpoint of the later gateway, naming the gateway that came first.
 */
export function gatewayNetworkConflicts(topology: Pick<TopologyFormValues, "Devices" | "Connections">): GatewayNetworkConflict[] {
  const rootOf = networkRoots(topology)
  const first = new Map<string, string>()
  const conflicts: GatewayNetworkConflict[] = []
  topology.Connections.forEach((connection, ci) => connection.Endpoints.forEach((ep, side) => {
    const device = topology.Devices.find((candidate) => candidate.ID === ep.DeviceID)
    if (!device || !isGatewayType(device.Type)) return
    const root = rootOf({ DeviceID: ep.DeviceID, Interface: GATEWAY_PORT })
    const owner = first.get(root)
    if (owner === undefined) first.set(root, device.ID)
    else if (owner !== device.ID) conflicts.push({ connection: ci, side, other: topology.Devices.find((candidate) => candidate.ID === owner)?.Name ?? "" })
  }))
  return conflicts
}

/**
 * The name of the gateway that would share a network with another one if `a` and `b` were connected (the connect mode and
 * the connection dropdowns refuse such a link), or null when the link is fine.
 */
export function gatewayClashOfLink(topology: Pick<TopologyFormValues, "Devices" | "Connections">, a: PortEnd, b: PortEnd): string | null {
  const rootOf = networkRoots(topology, [a, b])
  const owners = new Map<string, string>()
  for (const device of topology.Devices) {
    if (!isGatewayType(device.Type)) continue
    const connected = topology.Connections.some((connection) => connection.Endpoints.some((ep) => ep.DeviceID === device.ID)) || a.DeviceID === device.ID || b.DeviceID === device.ID
    if (!connected) continue
    const root = rootOf({ DeviceID: device.ID, Interface: GATEWAY_PORT })
    const other = owners.get(root)
    if (other !== undefined) return other
    owners.set(root, device.Name)
  }
  return null
}

/** Gateways beyond `max` (in device order): the indices to flag when a lab holds more than the platform allows. */
export function gatewaysOverLimit(devices: { Type: string }[], max: number): number[] {
  const over: number[] = []
  let count = 0
  devices.forEach((device, index) => {
    if (!isGatewayType(device.Type)) return
    count += 1
    if (count > max) over.push(index)
  })
  return over
}
