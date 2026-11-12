/**
 * wizardModel.ts — the pure rules of the add-variant wizard (presets, what a preset lets the author change, the typed
 * values of the new variants, their errors, and the variants the wizard builds). Nothing here touches the form.
 */
import { answerValueError, emptyVariant, MAX_VARIANT_WEIGHT, MIN_VARIANT_WEIGHT, type VariantFormValues } from "@/lib/exerciseSchemas"
import { deliveriesOfTask } from "@/lib/editor/refs"
import { baseCandidates, newLinkedVariant, withOwnImage } from "@/lib/linkedVariants"

export type PresetId = "files" | "answers" | "image" | "copy" | "empty"
export type Preset = { id: PresetId; linked: boolean; copy: boolean }
export const PRESETS: Preset[] = [
  { id: "files", linked: true, copy: false },
  { id: "answers", linked: true, copy: false },
  { id: "image", linked: true, copy: false },
  { id: "copy", linked: false, copy: true },
  { id: "empty", linked: false, copy: false },
]
export const isLinkedPreset = (id: PresetId) => PRESETS.find((preset) => preset.id === id)?.linked ?? false

/** Most variants one wizard run creates. */
export const WIZARD_MAX_COUNT = 50

export type FileRef = { FileID: string; Name: string }
/** What the author typed for ONE new variant, keyed by task position / device id. */
export type Fill = { weight?: string; ans: Record<number, string>; files: Record<number, FileRef[]>; img: Record<string, string> }
/** Which rows are the new variant's own. */
export type Own = { ans: Record<number, boolean>; files: Record<number, boolean>; img: Record<string, boolean> }

export type BaseInfo = {
  /** Answer tasks whose answer does not reach the lab (these can differ between variants). */
  free: number[]
  /** Answer tasks whose answer reaches the lab (several values or a template do the job). */
  delivered: number[]
  /** Tasks with files for the participant. */
  files: number[]
}

export function baseInfo(base: VariantFormValues): BaseInfo {
  const info: BaseInfo = { free: [], delivered: [], files: [] }
  base.Tasks.forEach((task, position) => {
    if (task.Check.Kind === "answer") (deliveriesOfTask(base.Topology, task.Key).length > 0 ? info.delivered : info.free).push(position)
    if (task.Attachments.length > 0) info.files.push(position)
  })
  return info
}

export function defaultPreset(base: VariantFormValues): PresetId {
  const info = baseInfo(base)
  return info.files.length > 0 ? "files" : info.free.length > 0 ? "answers" : "image"
}

/** «Інші відповіді» with every answer delivered into the lab: variants are not needed. */
export function presetBlocked(preset: PresetId, base: VariantFormValues): boolean {
  return preset === "answers" && baseInfo(base).free.length === 0
}

export const nodeDevices = (variant: VariantFormValues) => variant.Topology.Devices.filter((device) => device.Type === "node")

/** The rows a preset starts with ticked. */
export function presetOwn(preset: PresetId, base: VariantFormValues): Own {
  const own: Own = { ans: {}, files: {}, img: {} }
  const info = baseInfo(base)
  base.Tasks.forEach((task, position) => {
    if (preset === "answers") {
      const flags = info.free.filter((free) => base.Tasks[free].Check.Answer.Type === "flag")
      if ((flags.length > 0 ? flags : info.free).includes(position)) own.ans[position] = true
    }
    if (preset === "files") {
      const set = info.files.length > 0 ? info.files : info.free
      if (set.includes(position) && task.Check.Kind === "answer" && !info.delivered.includes(position)) own.ans[position] = true
      if (info.files.length > 0 ? task.Attachments.length > 0 : set.includes(position)) own.files[position] = true
    }
  })
  if (preset === "image") { const first = nodeDevices(base)[0]; if (first) own.img[first.ID] = true }
  return own
}

export const ownAnswers = (own: Own) => Object.keys(own.ans).filter((key) => own.ans[Number(key)]).map(Number).sort((a, b) => a - b)
export const ownFiles = (own: Own) => Object.keys(own.files).filter((key) => own.files[Number(key)]).map(Number).sort((a, b) => a - b)
export const ownImagesOf = (own: Own) => Object.keys(own.img).filter((key) => own.img[key])

export function generatedFlag(taken: Set<string>): string {
  let value: string
  do {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    value = `ICE{${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}}`
  } while (taken.has(value))
  taken.add(value)
  return value
}

export function parseCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const count = Number(text)
  return count >= 1 && count <= WIZARD_MAX_COUNT ? count : null
}

export function parseWeight(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const weight = Number(text)
  return weight >= MIN_VARIANT_WEIGHT && weight <= MAX_VARIANT_WEIGHT ? weight : null
}

/** The typed values follow the ticked rows: a ticked row gets its fields, an unticked one loses its values. */
export function syncFill(base: VariantFormValues, own: Own, count: number, previous: Fill[]): Fill[] {
  const taken = new Set<string>()
  previous.forEach((fill) => Object.values(fill.ans).forEach((value) => taken.add(value)))
  return Array.from({ length: count }, (_, k) => {
    const old = previous[k] ?? { ans: {}, files: {}, img: {} }
    const fill: Fill = { ans: {}, files: {}, img: {} }
    if (old.weight !== undefined) fill.weight = old.weight
    ownAnswers(own).forEach((position) => {
      fill.ans[position] = old.ans[position] ?? (base.Tasks[position].Check.Answer.Type === "flag" ? generatedFlag(taken) : "")
    })
    ownFiles(own).forEach((position) => { fill.files[position] = old.files[position] ?? [] })
    ownImagesOf(own).forEach((id) => { fill.img[id] = old.img[id] ?? "" })
    return fill
  })
}

/** The error of one typed answer: "" when fine; "required" for empty (shown after the first try), "taken" / "twice" for repeats, else a message. */
export function answerError(variants: VariantFormValues[], baseIdx: number, fills: Fill[], k: number, position: number, tried: boolean): string {
  const base = variants[baseIdx]
  const raw = fills[k]?.ans[position] ?? ""
  if (!raw.trim()) return tried ? "required" : ""
  const message = answerValueError(base.Tasks[position].Check.Answer.Type, raw)
  if (message) return message
  const group = variants.filter((variant, index) => index === baseIdx || (variant.LinkedTo !== "" && variant.LinkedTo === base.ID))
  if (group.some((variant) => variant.Tasks[position]?.Check.Answer.Values.includes(raw))) return "taken"
  if (fills.some((fill, other) => other !== k && fill.ans[position] === raw)) return "twice"
  return ""
}

export const fileError = (fills: Fill[], k: number, position: number, tried: boolean) => (tried && (fills[k]?.files[position] ?? []).length === 0 ? "required" : "")

export function imageError(base: VariantFormValues, fills: Fill[], k: number, deviceId: string, tried: boolean): string {
  const value = (fills[k]?.img[deviceId] ?? "").trim()
  if (!value) return tried ? "required" : ""
  return value === base.Topology.Devices.find((device) => device.ID === deviceId)?.Image ? "same" : ""
}

/** The id of the first field with an error (the wizard focuses it), or null. */
export function firstError(variants: VariantFormValues[], baseIdx: number, own: Own, fills: Fill[], tried: boolean): string | null {
  const base = variants[baseIdx]
  for (let k = 0; k < fills.length; k += 1) {
    for (const position of ownAnswers(own)) if (answerError(variants, baseIdx, fills, k, position, tried)) return `wz-a-${k}-${position}`
    for (const position of ownFiles(own)) if (fileError(fills, k, position, tried)) return `wz-f-${k}-${position}`
    for (const id of ownImagesOf(own)) if (imageError(base, fills, k, id, tried)) return `wz-i-${k}-${id}`
  }
  return null
}

export function nothingOwn(own: Own): boolean {
  return ownAnswers(own).length === 0 && ownFiles(own).length === 0 && ownImagesOf(own).length === 0
}

/** The bases a new linked variant may point to (saved, not linked themselves). */
export const linkBases = baseCandidates

/** New variants linked to `base`, one per fill; the images are the variant's own (ImageOverrides). */
export function buildLinked(variants: VariantFormValues[], baseIdx: number, own: Own, fills: Fill[], weight: number): VariantFormValues[] {
  const base = variants[baseIdx]
  return fills.map((fill, k) => {
    const created = newLinkedVariant(base, variants.length + k + 1, {
      Note: "",
      Tasks: base.Tasks.map((_, position) => ({
        Check: { Answer: { Values: own.ans[position] ? [fill.ans[position]] : [] } },
        Attachments: own.files[position] ? (fill.files[position] ?? []) : [],
      })),
    })
    created.Weight = parseWeight(fill.weight ?? "") ?? weight
    let overrides = created.ImageOverrides ?? []
    for (const id of ownImagesOf(own)) overrides = withOwnImage(overrides, id, (fill.img[id] ?? "").trim(), base.Topology.Devices.find((device) => device.ID === id)?.Image ?? "")
    created.ImageOverrides = overrides
    return created
  })
}

/** An empty separate variant: one empty subtask, no infrastructure. */
export function buildEmpty(count: number): VariantFormValues {
  return emptyVariant(count + 1)
}

/** Where new variants go: after the base and the variants already based on it. */
export function insertionPoint(variants: VariantFormValues[], baseIdx: number): number {
  const base = variants[baseIdx]
  let at = baseIdx + 1
  while (base.ID !== "" && at < variants.length && variants[at].LinkedTo === base.ID) at += 1
  return at
}
