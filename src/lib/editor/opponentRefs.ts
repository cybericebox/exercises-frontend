/**
 * opponentRefs.ts — what the opponents of a variant name, and how that follows the editor. The editor does not edit the
 * opponents yet (they are carried through unchanged), but it renames and removes what they name:
 *   Operates (devices), Seat (a node), Foothold (a switch or hub) name devices of the topology by name;
 *   Goal and StartAfter name tasks of the variant by key (task keys are never renamed by the editor).
 *   rename of a device: every such name follows the new one;
 *   removal: nothing is rewritten (an opponent without its target is invalid either way); the confirmation says so and the
 *            list "Fix before publishing" shows the dangling names.
 */
import type { UseFormReturn } from "react-hook-form"
import type { OpponentDTO } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

type Variant = Pick<DraftFormValues["Variants"][number], "Opponents" | "Tasks"> & { Topology: { Devices: { Name: string }[] } }

/** True when the opponent names the device `name` (Operates, Seat or Foothold). */
export function opponentNamesDevice(opponent: OpponentDTO, name: string): boolean {
  return name !== "" && ((opponent.Operates ?? []).includes(name) || opponent.Seat === name || opponent.Foothold === name)
}

/** True when the opponent names the task `key` (Goal or StartAfter). */
export function opponentNamesTask(opponent: OpponentDTO, key: string): boolean {
  return key !== "" && ((opponent.Goal ?? []).includes(key) || opponent.StartAfter === key)
}

/** The opponents with the device `from` renamed to `to`; the same array when none names it (untouched items stay the same objects). */
export function renameDeviceInOpponents(opponents: OpponentDTO[], from: string, to: string): OpponentDTO[] {
  if (from === "" || from === to || !opponents.some((opponent) => opponentNamesDevice(opponent, from))) return opponents
  return opponents.map((opponent) => {
    if (!opponentNamesDevice(opponent, from)) return opponent
    return {
      ...opponent,
      ...(opponent.Operates ? { Operates: opponent.Operates.map((name) => name === from ? to : name) } : {}),
      ...(opponent.Seat === from ? { Seat: to } : {}),
      ...(opponent.Foothold === from ? { Foothold: to } : {}),
    }
  })
}

/**
 * A device of the variant was renamed from `from` to `to`: the opponents follow it. Nothing changes when another device
 * still carries the old name (the references are then ambiguous and stay as they are).
 */
export function renameDeviceOpponentsInForm(form: Pick<UseFormReturn<DraftFormValues>, "getValues" | "setValue">, variantIndex: number, deviceId: string, from: string, to: string): void {
  const opponents = form.getValues(`Variants.${variantIndex}.Opponents`)
  if (!opponents?.length) return
  const devices = form.getValues(`Variants.${variantIndex}.Topology.Devices`) ?? []
  if (devices.some((device) => device.ID !== deviceId && device.Name === from)) return
  const next = renameDeviceInOpponents(opponents, from, to)
  if (next !== opponents) form.setValue(`Variants.${variantIndex}.Opponents`, next, { shouldDirty: true, shouldValidate: true })
}

/** How many opponents of the variant name the device `name`. */
export function opponentsNamingDevice(variant: Pick<Variant, "Opponents">, name: string): number {
  return (variant.Opponents ?? []).filter((opponent) => opponentNamesDevice(opponent, name)).length
}

/** How many opponents of the variant name the task `key`. */
export function opponentsNamingTask(variant: Pick<Variant, "Opponents">, key: string): number {
  return (variant.Opponents ?? []).filter((opponent) => opponentNamesTask(opponent, key)).length
}

/** The names (devices) and keys (tasks) the opponents of the variant name that the variant does not have, each once. */
export function danglingOpponentRefs(variant: Variant): string[] {
  const devices = new Set(variant.Topology.Devices.map((device) => device.Name))
  const tasks = new Set(variant.Tasks.map((task) => task.Key).filter(Boolean))
  const missing = new Set<string>()
  for (const opponent of variant.Opponents ?? []) {
    for (const name of [...(opponent.Operates ?? []), opponent.Seat ?? "", opponent.Foothold ?? ""]) if (name && !devices.has(name)) missing.add(name)
    for (const key of [...(opponent.Goal ?? []), opponent.StartAfter ?? ""]) if (key && !tasks.has(key)) missing.add(key)
  }
  return [...missing]
}
