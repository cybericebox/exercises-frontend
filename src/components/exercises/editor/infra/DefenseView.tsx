"use client"

import { useState } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { LockKeyhole, LockKeyholeOpen, Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Input } from "@/components/ui/input"
import { MaskedInput } from "@/components/ui/masked-value"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import type { OpponentDTO } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { consoleLinksOf } from "@/lib/editor/consolePorts"
import {
  DEFENDER_TOPOLOGIES, MAX_DEFENDER_CREDENTIALS, SEAT_ROLES, emptyCredential, emptyDefender, opponentSeatOptions, seatCandidates, type DefenderForm,
} from "@/lib/editor/defender"
import { CheckMenu, ConfirmRemoveAction, SelectMenu, SwitchBlock, SwitchList } from "../kit"
import { FieldError, fieldProps, useFieldError } from "../fieldErrors"
import { SecretInput } from "../../SecretInput"
import { Block } from "./fields"

/** The value of "no choice" in a single-choice menu (a radio item needs a value of its own). */
const NONE = "-"

/**
 * “Defense”: what the defender of the lab is told (the defender block of the variant: its seat, the topology its dossier shows,
 * the devices it must not console into and the operator credentials) and the seat of each opponent that operates devices (the
 * device a bot run takes the place of). In a linked variant both are its base's and only read here.
 */
export function DefenseView({ variantIndex, readOnly }: { variantIndex: number; readOnly: boolean }) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}` as const
  const defender = useWatch({ control, name: `${base}.Defender` }) ?? null
  const topology = useWatch({ control, name: `${base}.Topology` })
  const opponents = useWatch({ control, name: `${base}.Opponents` }) ?? []
  const [confirmOff, setConfirmOff] = useState(false)
  if (!topology) return null

  const setDefender = (next: DefenderForm | null) => setValue(`${base}.Defender`, next, { shouldDirty: true, shouldValidate: true })
  function toggle(on: boolean) {
    if (on) { setDefender(emptyDefender()); return }
    const current = getValues(`${base}.Defender`)
    // A block with something in it is removed only after a confirmation.
    if (current && (current.Seat || current.Topology || current.OffLimits.length || current.Credentials.length)) setConfirmOff(true)
    else setDefender(null)
  }

  return <div data-testid="defense-view" className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
    <section aria-labelledby="defense-defender" className="min-w-0 space-y-3 rounded-md border border-border p-4">
      <h3 id="defense-defender" className="text-base font-semibold">{t("ed.c.def.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("ed.c.def.intro")}</p>
      <FieldError path={`${base}.Defender`} />
      <SwitchList>
        <SwitchBlock label={t("ed.c.def.enable")} checked={defender !== null} onCheckedChange={toggle} disabled={readOnly}
          help={{ intro: [t("ed.c.h.defender1"), t("ed.c.h.defender2")], default: t("ed.c.h.defenderDefault") }}>
          {defender && <DefenderFields variantIndex={variantIndex} readOnly={readOnly} />}
        </SwitchBlock>
      </SwitchList>
    </section>
    <section aria-labelledby="defense-opponents" className="min-w-0 space-y-3 rounded-md border border-border p-4">
      <h3 id="defense-opponents" className="text-base font-semibold">{t("ed.c.def.opponentsTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("ed.c.def.opponentsIntro")}</p>
      <FieldError path={`${base}.Opponents`} />
      {opponents.length === 0
        ? <div className="flex min-h-32 items-center justify-center"><EmptyState message={t("ed.c.def.noOpponents")} /></div>
        : <ul className="min-w-0 space-y-3">{opponents.map((opponent, index) => <OpponentRow key={index} variantIndex={variantIndex} index={index} opponent={opponent}
          opponents={opponents} topology={topology} readOnly={readOnly} />)}</ul>}
    </section>
    <ConfirmDialog open={confirmOff} onCancel={() => setConfirmOff(false)} tone="danger" title={t("ed.c.def.removeTitle")} description={t("ed.c.def.removeDescription")}
      cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={t("ed.c.def.remove")} onConfirm={() => { setConfirmOff(false); setDefender(null) }} />
  </div>
}

function DefenderFields({ variantIndex, readOnly }: { variantIndex: number; readOnly: boolean }) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const path = `Variants.${variantIndex}.Defender` as const
  const defender = useWatch({ control, name: path })
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  const seatError = useFieldError(`${path}.Seat`)
  const topologyError = useFieldError(`${path}.Topology`)
  const offLimitsError = useFieldError(`${path}.OffLimits`)
  if (!defender || !topology) return null
  const seat = topology.Devices.find((device) => device.Name === defender.Seat)
  const cabled = seat ? consoleLinksOf(topology, seat.ID) : []
  const seats: SelectMenuOption[] = [{ value: NONE, label: t("ed.c.def.noSeat"), description: t("ed.c.def.noSeatHelp") },
    ...seatCandidates(topology).map((device) => ({ value: device.Name, label: device.Name, description: t("ed.c.def.seatPorts", { n: device.SerialPorts?.length ?? 0 }) })),
    // A seat the topology no longer offers stays shown, so its error is beside a visible choice.
    ...(defender.Seat && !seatCandidates(topology).some((device) => device.Name === defender.Seat) ? [{ value: defender.Seat, label: defender.Seat }] : [])]
  const modes: SelectMenuOption[] = DEFENDER_TOPOLOGIES.map((mode) => ({ value: mode, label: t(`ed.c.def.topology.${mode}`), description: t(`ed.c.def.topology.${mode}Help`) }))
  const offLimitOptions = topology.Devices.filter((device) => device.Type === "node" && device.Name !== defender.Seat && device.Name !== "").map((device) => ({
    value: device.Name, label: device.Name,
    ...(cabled.includes(device.Name) ? { disabled: !defender.OffLimits.includes(device.Name), description: t("ed.c.def.cabledToSeat") } : {}),
  }))
  const set = (next: Partial<DefenderForm>) => setValue(path, { ...getValues(path)!, ...next }, { shouldDirty: true, shouldValidate: true })
  const seatProps = fieldProps(`${path}.Seat`, seatError)
  const topologyProps = fieldProps(`${path}.Topology`, topologyError)
  const offLimitsProps = fieldProps(`${path}.OffLimits`, offLimitsError, "defense-offlimits-hint")

  return <div className="min-w-0 space-y-5" data-defender-fields>
    <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
      <div className="min-w-0">
        <FieldLabel text={t("ed.c.def.seat")} htmlFor={seatProps.id} help={{ intro: [t("ed.c.h.seat1"), t("ed.c.h.seat2")] }} className="mb-1" />
        <SelectMenu {...seatProps} ariaLabel={t("ed.c.def.seat")} value={defender.Seat || NONE} options={seats} disabled={readOnly} className="w-full" menuClassName="w-[22rem] max-w-[90vw]"
          onChange={(value) => set({ Seat: value === NONE ? "" : value, OffLimits: defender.OffLimits })} />
        <FieldError path={`${path}.Seat`} />
      </div>
      <div className="min-w-0">
        <FieldLabel text={t("ed.c.def.topologyLabel")} htmlFor={topologyProps.id} help={{ intro: t("ed.c.h.defTopology"), items: DEFENDER_TOPOLOGIES.map((mode) => ({ term: t(`ed.c.def.topology.${mode}`), text: t(`ed.c.def.topology.${mode}Help`) })) }} className="mb-1" />
        <SelectMenu {...topologyProps} ariaLabel={t("ed.c.def.topologyLabel")} value={defender.Topology || "full"} options={modes} disabled={readOnly} className="w-full" menuClassName="w-[24rem] max-w-[90vw]"
          onChange={(value) => set({ Topology: value === "full" ? "" : value as DefenderForm["Topology"] })} />
        <FieldError path={`${path}.Topology`} />
      </div>
      <div className="min-w-0 md:col-span-2" data-field-name={`${path}.OffLimits`} tabIndex={-1}>
        <FieldLabel as="span" text={t("ed.c.def.offLimits")} help={{ intro: t("ed.c.h.offLimits"), default: t("ed.c.def.offLimitsHint") }} className="mb-1" />
        <div {...offLimitsProps} className="max-w-xl">
          <CheckMenu label={t("ed.c.def.offLimits")} values={defender.OffLimits} options={offLimitOptions} disabled={readOnly || offLimitOptions.length === 0} className="w-full"
            menuClassName="max-h-72 overflow-y-auto"
            triggerContent={defender.OffLimits.length ? defender.OffLimits.join(", ") : t("ed.c.def.offLimitsDefault")}
            onToggle={(value, checked) => set({ OffLimits: checked ? [...defender.OffLimits.filter((name) => name !== value), value] : defender.OffLimits.filter((name) => name !== value) })} />
        </div>
        <p id="defense-offlimits-hint" className="mt-1 text-xs text-muted-foreground">{t("ed.c.def.offLimitsHint")}</p>
        <FieldError path={`${path}.OffLimits`} className="mt-1" />
      </div>
    </div>
    <CredentialsBlock variantIndex={variantIndex} readOnly={readOnly} />
  </div>
}

function CredentialsBlock({ variantIndex, readOnly }: { variantIndex: number; readOnly: boolean }) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const path = `Variants.${variantIndex}.Defender.Credentials` as const
  const credentials = useWatch({ control, name: path }) ?? []
  const full = credentials.length >= MAX_DEFENDER_CREDENTIALS
  const add = () => setValue(path, [...(getValues(path) ?? []), emptyCredential()], { shouldDirty: true, shouldValidate: false })
  const remove = (index: number) => setValue(path, (getValues(path) ?? []).filter((_, candidate) => candidate !== index), { shouldDirty: true, shouldValidate: true })
  const button = <Button type="button" variant="outline" aria-disabled={full || undefined} className="h-9 gap-1.5 px-3 text-[13px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:h-11"
    onClick={() => { if (!full) add() }}><Plus aria-hidden="true" className="h-4 w-4" />{t("ed.c.def.addCredential")}</Button>
  return <Block id="defense-credentials" title={t("ed.c.def.credentials")} count={credentials.length}
    help={{ intro: [t("ed.c.h.credentials1"), t("ed.c.h.credentials2")], items: [{ term: t("ed.c.h.envSecret"), text: t("ed.c.h.credentialSecret") }, { term: t("ed.c.h.envStored"), text: t("ed.c.h.envStoredText") }] }}
    actions={!readOnly && (full ? <HoverTooltip text={t("ed.c.def.val.credentialsMax", { max: MAX_DEFENDER_CREDENTIALS })} describe="always">{button}</HoverTooltip> : button)}>
    <FieldError path={path} />
    {credentials.length === 0
      ? <EmptyState compact message={t("ed.c.def.noCredentials")} />
      : <div className="min-w-0 space-y-2.5">
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,10rem)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,1fr)_36px_36px] gap-2 px-3 text-[13px] text-muted-foreground max-sm:hidden">
          <span>{t("ed.c.def.device")}</span><span>{t("ed.c.def.port")}</span><span>{t("ed.c.def.user")}</span><span>{t("ed.c.def.value")}</span><span /><span />
        </div>
        {credentials.map((_, index) => <CredentialRow key={credentials[index]?.ClientKey ?? index} variantIndex={variantIndex} index={index} readOnly={readOnly} onRemove={() => remove(index)} />)}
      </div>}
  </Block>
}

function CredentialRow({ variantIndex, index, readOnly, onRemove }: { variantIndex: number; index: number; readOnly: boolean; onRemove: () => void }) {
  const { control } = useFormContext<DraftFormValues>()
  const row = `Variants.${variantIndex}.Defender.Credentials.${index}` as const
  const credential = useWatch({ control, name: row })
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const deviceError = useFieldError(`${row}.Device`)
  const portError = useFieldError(`${row}.Port`)
  const userError = useFieldError(`${row}.User`)
  const valueError = useFieldError(`${row}.Value`)
  if (!credential) return null
  const n = index + 1
  const device = devices.find((candidate) => candidate.Name === credential.Device)
  const deviceOptions: SelectMenuOption[] = [
    ...devices.filter((candidate) => candidate.Type === "node" && candidate.Name !== "").map((candidate) => ({ value: candidate.Name, label: candidate.Name })),
    ...(credential.Device && !device ? [{ value: credential.Device, label: credential.Device }] : []),
  ]
  const portOptions: SelectMenuOption[] = [{ value: NONE, label: t("ed.c.def.anyPort") },
    ...(device?.ConsolePorts ?? []).map((port) => ({ value: port.Name, label: port.Name })),
    ...(credential.Port && !(device?.ConsolePorts ?? []).some((port) => port.Name === credential.Port) ? [{ value: credential.Port, label: credential.Port }] : [])]
  const stored = credential.Secret && credential.HasValue && credential.Value === ""
  const lockTip = readOnly ? t("ed.c.env.secretReadOnly") : stored ? t("ed.c.env.secretLocked") : credential.Secret ? t("ed.c.def.secretOn") : t("ed.c.def.secretOff")
  const valueProps = fieldProps(`${row}.Value`, valueError)
  return <div role="group" aria-label={t("ed.c.def.credentialN", { n })} data-credential-row className="group grid min-w-0 grid-cols-1 items-start gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,1fr)_36px_36px]">
    <div className="min-w-0">
      <Controller control={control} name={`${row}.Device`} render={({ field }) => <SelectMenu {...fieldProps(`${row}.Device`, deviceError)} ariaLabel={t("ed.c.def.deviceN", { n })}
        value={field.value ?? ""} options={deviceOptions} disabled={readOnly} placeholder={t("ed.c.def.device")} className="w-full"
        onChange={(value) => { field.onChange(value) }} />} />
      <FieldError path={`${row}.Device`} />
    </div>
    <div className="min-w-0">
      <Controller control={control} name={`${row}.Port`} render={({ field }) => <SelectMenu {...fieldProps(`${row}.Port`, portError)} ariaLabel={t("ed.c.def.portN", { n })}
        value={field.value || NONE} options={portOptions} disabled={readOnly || !device} className="w-full" onChange={(value) => field.onChange(value === NONE ? "" : value)} />} />
      <FieldError path={`${row}.Port`} />
    </div>
    <div className="min-w-0">
      <Controller control={control} name={`${row}.User`} render={({ field }) => <Input {...fieldProps(`${row}.User`, userError)} ref={field.ref} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur}
        disabled={readOnly} aria-label={t("ed.c.def.userN", { n })} placeholder={t("ed.c.def.user")} autoComplete="off" spellCheck={false} />} />
      <FieldError path={`${row}.User`} />
    </div>
    <div className="min-w-0">
      <Controller control={control} name={`${row}.Value`} render={({ field }) => credential.Secret
        ? <SecretInput {...valueProps} aria-label={t("ed.c.def.valueN", { n })} value={field.value ?? ""} hasValue={credential.HasValue} onChange={field.onChange} disabled={readOnly} />
        : <MaskedInput {...valueProps} aria-label={t("ed.c.def.valueN", { n })} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value)} disabled={readOnly} placeholder={t("ed.c.env.valuePlaceholder")} />} />
      <FieldError path={`${row}.Value`} />
    </div>
    <Controller control={control} name={`${row}.Secret`} render={({ field }) => <HoverTooltip text={lockTip}>
      <button type="button" aria-label={t("ed.c.def.secretN", { n })} aria-pressed={Boolean(field.value)} aria-disabled={readOnly || stored || undefined}
        onClick={() => { if (!readOnly && !stored) field.onChange(!field.value) }}
        className="inline-flex h-9 w-9 items-center justify-center justify-self-center rounded-md text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-pressed:text-primary pointer-coarse:h-11 pointer-coarse:w-11">
        {field.value ? <LockKeyhole aria-hidden="true" className="h-4 w-4" /> : <LockKeyholeOpen aria-hidden="true" className="h-4 w-4" />}
      </button>
    </HoverTooltip>} />
    {!readOnly
      ? <ConfirmRemoveAction ariaLabel={t("ed.c.def.removeCredentialN", { n })} onClick={onRemove} className="h-9 w-9" wrapperClassName="justify-self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />
      : <span />}
  </div>
}

function OpponentRow({ variantIndex, index, opponent, opponents, topology, readOnly }: {
  variantIndex: number
  index: number
  opponent: OpponentDTO
  opponents: OpponentDTO[]
  topology: DraftFormValues["Variants"][number]["Topology"]
  readOnly: boolean
}) {
  const { setValue } = useFormContext<DraftFormValues>()
  const path = `Variants.${variantIndex}.Opponents.${index}.Seat`
  const error = useFieldError(path)
  const operates = (SEAT_ROLES as readonly string[]).includes(opponent.Role)
  const options: SelectMenuOption[] = [{ value: NONE, label: t("ed.c.def.noSeat"), description: t("ed.c.def.opponentNoSeat") },
    ...opponentSeatOptions(topology, opponents, index).map((option) => ({
      value: option.name, label: option.name,
      ...(option.reason && option.name !== opponent.Seat ? { disabled: true, description: t(`ed.c.def.seat.${option.reason}`) } : {}),
    })),
    ...(opponent.Seat && !seatCandidates(topology).some((device) => device.Name === opponent.Seat) ? [{ value: opponent.Seat, label: opponent.Seat }] : [])]
  const props = fieldProps(path, error)
  const label = t("ed.c.def.opponentN", { n: index + 1, role: t(`ed.c.def.opponentRole.${opponent.Role}`) })
  return <li data-opponent-row={index} className="grid min-w-0 grid-cols-1 gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
    <div className="min-w-0 space-y-1">
      <p className="font-medium">{label}</p>
      <p className="text-sm text-muted-foreground">{[
        t("ed.c.def.band", { n: opponent.Band }),
        opponent.Goal.length ? t("ed.c.def.goal", { tasks: opponent.Goal.join(", ") }) : "",
        opponent.Operates?.length ? t("ed.c.def.operates", { devices: opponent.Operates.join(", ") }) : "",
        opponent.Foothold ? t("ed.c.def.foothold", { device: opponent.Foothold }) : "",
      ].filter(Boolean).join(" · ")}</p>
    </div>
    <div className="min-w-0">
      {operates
        ? <>
          <FieldLabel text={t("ed.c.def.opponentSeat")} htmlFor={props.id} help={{ intro: [t("ed.c.h.opponentSeat1"), t("ed.c.h.opponentSeat2")] }} className="mb-1" />
          <SelectMenu {...props} ariaLabel={`${t("ed.c.def.opponentSeat")}: ${label}`} value={opponent.Seat || NONE} options={options} disabled={readOnly} className="w-full" menuClassName="w-[22rem] max-w-[90vw]"
            onChange={(value) => setValue(`Variants.${variantIndex}.Opponents`, opponents.map((candidate, oi) => oi !== index ? candidate : (() => {
              const { Seat, ...rest } = candidate
              void Seat
              return value === NONE ? rest : { ...rest, Seat: value }
            })()), { shouldDirty: true, shouldValidate: true })} />
          <FieldError path={path} />
        </>
        : <p className="text-sm text-muted-foreground md:pt-7">{t("ed.c.def.noSeatForRole")}</p>}
    </div>
  </li>
}
