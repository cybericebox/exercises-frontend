import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** `{{var.from}}` -> `{{var.to}}` (an escaped `\{{` is left alone). */
export function renameVarInText(text: string, from: string, to: string): string {
  if (!text.includes(from)) return text
  return text.replace(new RegExp(`(\\\\)?\\{\\{var\\.${escapeRe(from)}\\}\\}`, "g"), (whole, escaped?: string) => escaped ? whole : `{{var.${to}}}`)
}

function mapStrings<T>(value: T, change: (text: string) => string): T {
  if (typeof value === "string") return change(value) as T
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, change)) as T
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)])) as T
  return value
}

/**
 * A variable was renamed: every reference in the variant follows it (environment values, file contents, scripts of the
 * devices and the expectations of state conditions), so renaming never breaks a use. Returns how many fields changed.
 */
export function renameVariableRefs(form: UseFormReturn<DraftFormValues>, variantIndex: number, from: string, to: string): number {
  if (from === to || from === "") return 0
  const change = (text: string) => renameVarInText(text, from, to)
  const variant = form.getValues(`Variants.${variantIndex}`)
  let count = 0
  const put = <T,>(path: string, before: T, after: T) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    form.setValue(path as never, after as never, { shouldDirty: true })
    count++
  }
  variant.Topology.Devices.forEach((device, deviceIndex) => {
    const root = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Bootstrap`
    device.Bootstrap.Env.forEach((variable, index) => put(`${root}.Env.${index}.Value`, variable.Value, change(variable.Value)))
    device.Bootstrap.Files.forEach((file, index) => put(`${root}.Files.${index}.Content`, file.Content, change(file.Content)))
    put(`${root}.Script`, device.Bootstrap.Script, change(device.Bootstrap.Script))
  })
  variant.Tasks.forEach((task, taskIndex) => {
    if (task.Check?.Kind !== "state") return
    task.Check.State.Conditions.forEach((condition, conditionIndex) => {
      put(`Variants.${variantIndex}.Tasks.${taskIndex}.Check.State.Conditions.${conditionIndex}`, condition, mapStrings(condition, change))
    })
  })
  variant.Topology.Variables.forEach((variable, index) => put(`Variants.${variantIndex}.Topology.Variables.${index}.Text`, variable.Text, change(variable.Text)))
  return count
}
