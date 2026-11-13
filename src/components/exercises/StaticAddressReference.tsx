"use client"

import type { ReactNode } from "react"
import type { NetworkIPRefDTO, NetworkSubnetRefDTO } from "@/api/exercises/versions"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"

/** A gateway of the lab as a source of addresses: its name, and the DHCP ranges its hosts are served from. */
export type GatewaySource = { Name: string; DHCP: boolean; DHCPRanges?: { Start: number; End: number }[] }

type Common = { invalid?: boolean; describedBy?: string; gateways: GatewaySource[]; disabled?: boolean; manualInput?: ReactNode }
type HostReferenceProps = Common & {
  kind: "address" | "gateway" | "via"
  reference: NetworkIPRefDTO | null
  onChange: (reference: NetworkIPRefDTO | null) => void
}
type SubnetReferenceProps = Common & {
  kind: "destination"
  reference: NetworkSubnetRefDTO | null
  onChange: (reference: NetworkSubnetRefDTO | null) => void
}
type Props = HostReferenceProps | SubnetReferenceProps

export function addressReferenceOverlapsDHCP(reference: NetworkIPRefDTO | null, gateways: GatewaySource[]): boolean {
  if (!reference) return false
  const gateway = gateways.find((candidate) => candidate.Name === reference.Gateway)
  if (!gateway?.DHCP) return false
  return (gateway.DHCPRanges ?? []).some((range) => reference.Host >= range.Start && reference.Host <= range.End)
}

const MANUAL = "manual"
const prefix = "gateway:"

/**
 * The source of an address, a default gateway, a route destination or a next hop: typed by hand, or taken from the network
 * of one of the lab's gateways (by the gateway's name; the host number follows). A reference to a gateway that is no longer
 * there stays in the list, marked, so it can be seen and replaced.
 */
export function StaticAddressReference(props: Props) {
  const { kind, reference, disabled, gateways } = props
  const hostReference = reference && "Host" in reference ? reference : null
  const selected = reference ? `${prefix}${reference.Gateway}` : MANUAL
  const known = reference ? gateways.some((gateway) => gateway.Name === reference.Gateway) : true
  const options = [
    { value: MANUAL, label: t("admin.exTopo.ref.manual") },
    ...gateways.map((gateway) => ({ value: `${prefix}${gateway.Name}`, label: t("ed.c.ref.fromGateway", { name: gateway.Name }), description: t("admin.exTopo.ref.assignedOnStart") })),
    ...(gateways.length === 0 ? [{ value: `${prefix}`, label: t("ed.c.ref.fromGatewayNone"), description: t("ed.c.ref.noGateways"), disabled: true }] : []),
    ...(reference && !known ? [{ value: selected, label: t("ed.c.ref.fromGateway", { name: reference.Gateway || "—" }), description: t("ed.c.ref.gatewayGone"), disabled: true }] : []),
  ]

  function choose(value: string) {
    if (value === MANUAL) {
      props.onChange(null)
    } else if (value.startsWith(prefix) && value.length > prefix.length) {
      const name = value.slice(prefix.length)
      if (!gateways.some((gateway) => gateway.Name === name)) return
      if (props.kind === "destination") props.onChange({ Gateway: name })
      else props.onChange({ Gateway: name, Host: props.kind === "address" ? 10 : 1 })
    }
  }

  return <div className={hostReference ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" : props.manualInput ? "grid grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)] items-center gap-2" : ""}>
    <SelectMenu value={selected} onChange={choose} options={options} disabled={disabled}
      aria-invalid={props.invalid} aria-describedby={props.describedBy}
      ariaLabel={t(`admin.exTopo.ref.choice.${kind}`)} className="h-9 min-w-0 w-full" menuClassName="w-[22rem] max-w-[90vw]" />
    {hostReference && kind !== "destination" && <div className="flex shrink-0 items-center gap-1">
      <Input type="number" min={kind === "address" ? 2 : 1} max={254} step={1}
        value={hostReference.Host} disabled={disabled} aria-invalid={props.invalid} aria-describedby={props.describedBy} aria-label={t("admin.exTopo.ref.host")}
        onChange={(event) => props.onChange({ Gateway: hostReference.Gateway, Host: Number(event.target.value) })}
        className="h-9 w-20" />
      {kind === "address" && <span className={`text-sm font-normal text-foreground ${disabled ? "opacity-50" : ""}`}>/24</span>}
    </div>}
    {!reference && props.manualInput}
  </div>
}
