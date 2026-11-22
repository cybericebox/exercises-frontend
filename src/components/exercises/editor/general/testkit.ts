/** Test fixtures of package A: variants with answers, files and devices. Not shipped (only tests import it). */
import { emptyDevice, emptyTask, emptyVariant, type DeviceFormValues, type TaskFormValues, type VariantFormValues } from "@/lib/exerciseSchemas"

export function task(key: string, name: string, values: string[] = [], type: "flag" | "text" = "flag"): TaskFormValues {
  const base = emptyTask(key)
  base.Name = name
  base.Check.Answer.Type = type
  base.Check.Answer.Values = values
  return base
}

export function device(id: string, name: string, image: string): DeviceFormValues {
  return { ...emptyDevice(), ID: id, Name: name, Image: image }
}

/** A saved base variant with two answer tasks and one device. */
export function baseVariant(over: Partial<VariantFormValues> = {}): VariantFormValues {
  const variant = emptyVariant(1)
  variant.ID = "a"
  variant.Tasks = [task("t1", "Login", ["ICE{aaaa}"]), task("t2", "File", ["secret"], "text")]
  variant.Topology.Devices = [device("d1", "web", "img:1")]
  return { ...variant, ...over }
}

/** A variant linked to `baseId` with its own answer for the first task. */
export function linkedVariant(id: string, baseId: string, base: VariantFormValues, own: { first?: string[]; files?: { FileID: string; Name: string }[]; images?: { DeviceID: string; Image: string }[] } = {}): VariantFormValues {
  const variant = structuredClone(base)
  variant.ID = id
  variant.LinkedTo = baseId
  variant.Tasks.forEach((item) => { item.Check.Answer.Values = []; item.Attachments = [] })
  variant.Tasks[0].Check.Answer.Values = own.first ?? []
  if (own.files) variant.Tasks[0].Attachments = own.files
  variant.ImageOverrides = own.images ?? []
  variant.Weight = 1
  return variant
}
