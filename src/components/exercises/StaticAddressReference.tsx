"use client"

import type { ReactNode } from "react"
import type { NetworkIPRefDTO, NetworkSubnetRefDTO } from "@/api/exercises/versions"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"

type NetworkState = { Enabled: boolean; DHCP: boolean; DHCPRanges?: { Start: number; End: number }[] }
type Common = { vpn: NetworkState; internet: NetworkState; disabled?: boolean; manualInput?: ReactNode }
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

export function addressReferenceOverlapsDHCP(reference: NetworkIPRefDTO | null, network: NetworkState): boolean {
  if (!reference || !network.DHCP) return false
  const ranges = network.DHCPRanges ?? []
  return ranges.some((range) => reference.Host >= range.Start && reference.Host <= range.End)
}

export function StaticAddressReference(props: Props) {
  const { kind, reference, disabled, vpn, internet } = props
  const selected = reference?.Network ?? "manual"
  const hostReference = reference && "Host" in reference ? reference : null
  const source = (network: "vpn" | "internet") => network === "vpn" ? vpn : internet
  const sourceDisabled = (network: "vpn" | "internet") => !source(network).Enabled
  const options = (["manual", "vpn", "internet"] as const).map((choice) => {
    if (choice === "manual") return { value: choice, label: t("admin.exTopo.ref.manual") }
    const label = t(`admin.exTopo.ref.${choice}`)
    return {
      value: choice,
      label,
      description: !source(choice).Enabled ? t("admin.exTopo.ref.networkDisabled") : t("admin.exTopo.ref.assignedOnStart"),
      disabled: sourceDisabled(choice),
    }
  })

  function choose(value: string) {
    if (value === "manual") {
      props.onChange(null)
    } else if (value === "vpn" || value === "internet") {
      if (sourceDisabled(value)) return
      if (props.kind === "destination") props.onChange({ Network: value })
      else props.onChange({ Network: value, Host: props.kind === "address" ? 10 : 1 })
    }
  }

  return <div className={hostReference ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" : props.manualInput ? "grid grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)] items-center gap-2" : ""}>
    <SelectMenu value={selected} onChange={choose} options={options} disabled={disabled}
      ariaLabel={t(`admin.exTopo.ref.choice.${kind}`)} className="h-9 min-w-0 w-full" menuClassName="w-[22rem] max-w-[90vw]" />
    {hostReference && kind !== "destination" && <div className="flex shrink-0 items-center gap-1">
      <Input type="number" min={kind === "address" ? 2 : 1} max={254} step={1}
        value={hostReference.Host} disabled={disabled} aria-label={t("admin.exTopo.ref.host")}
        onChange={(event) => props.onChange({ Network: hostReference.Network, Host: Number(event.target.value) })}
        className="h-9 w-20" />
      {kind === "address" && <span className={`text-sm font-normal text-foreground ${disabled ? "opacity-50" : ""}`}>/24</span>}
    </div>}
    {!reference && props.manualInput}
  </div>
}
