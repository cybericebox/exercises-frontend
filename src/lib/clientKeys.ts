/**
 * clientKeys.ts — the stable identity of the items of the editor form in this browser. Every variant, task, device,
 * variable row and credential of the defender block gets a `ClientKey` (a uuid) when it first appears in the form; it stays through a reorder, a rename, a
 * delete of its neighbours and the server assigning an ID, and is never sent (the DTO mappers name their fields). The
 * browser buffer seals the secret values by these keys (exercisePendingBuffer).
 * A key is unique among its siblings (variants of the draft, tasks and devices of a variant, rows of a device); a copy of
 * an item carries its key, so the later of two equal keys gets a new one.
 */
import { set } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

export type ClientKeyFill = { path: string; value: string }

/** The keys to give: items without one, and the later of two siblings with the same one. */
export function clientKeyFills(draft: DraftFormValues): ClientKeyFill[] {
  const fills: ClientKeyFill[] = []
  const claim = (seen: Set<string>, key: string | undefined, path: string) => {
    if (key && !seen.has(key)) { seen.add(key); return }
    const next = crypto.randomUUID()
    seen.add(next)
    fills.push({ path, value: next })
  }
  const variants = new Set<string>()
  draft.Variants.forEach((variant, vi) => {
    claim(variants, variant.ClientKey, `Variants.${vi}.ClientKey`)
    const tasks = new Set<string>()
    variant.Tasks.forEach((task, ti) => claim(tasks, task.ClientKey, `Variants.${vi}.Tasks.${ti}.ClientKey`))
    const devices = new Set<string>()
    variant.Topology.Devices.forEach((device, di) => {
      claim(devices, device.ClientKey, `Variants.${vi}.Topology.Devices.${di}.ClientKey`)
      const rows = new Set<string>()
      device.Bootstrap.Env.forEach((row, ei) => claim(rows, row.ClientKey, `Variants.${vi}.Topology.Devices.${di}.Bootstrap.Env.${ei}.ClientKey`))
    })
    const credentials = new Set<string>()
    ;(variant.Defender?.Credentials ?? []).forEach((row, ci) => claim(credentials, row.ClientKey, `Variants.${vi}.Defender.Credentials.${ci}.ClientKey`))
  })
  return fills
}

/** The draft with every item keyed (the same object when nothing was missing). */
export function ensureClientKeys(draft: DraftFormValues): DraftFormValues {
  const fills = clientKeyFills(draft)
  if (fills.length === 0) return draft
  const keyed = structuredClone(draft)
  for (const fill of fills) set(keyed, fill.path, fill.value)
  return keyed
}
