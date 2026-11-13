/**
 * issues.ts — the list «Перед публікацією виправте»: every invalid field of the draft as one line
 * («Варіант 2, підзавдання 3, умова 1: Вкажіть порт від 1 до 65535»). The list only navigates; the message itself
 * stays beside its field.
 */
import { t } from "@/i18n/t"
import { richTextHasContent } from "@/lib/hintText"
import { draftSchema, type DraftFormValues } from "@/lib/exerciseSchemas"

export type EditorIssue = {
  /** Form path of the invalid field. */
  path: (string | number)[]
  message: string
  /** Index of the variant the field belongs to, or null (the exercise itself). */
  variant: number | null
  /** The whole line, capitalised. */
  text: string
}

const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text)
const upperFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

/** «підзавдання 3, умова 1»: where in the variant the path points. */
function placeOf(values: DraftFormValues, path: (string | number)[]): string[] {
  const variant = typeof path[1] === "number" ? values.Variants[path[1]] : undefined
  if (!variant) return []
  const parts: string[] = []
  if (path[2] === "Weight") parts.push(t("ed.shell.issue.weight"))
  if (path[2] === "Tasks" && typeof path[3] === "number") {
    parts.push(t("ed.shell.issue.task", { n: path[3] + 1 }))
    if (path[4] === "Check" && path[5] === "State" && path[6] === "Conditions" && typeof path[7] === "number") parts.push(t("ed.shell.issue.condition", { n: path[7] + 1 }))
    if (path[4] === "Hints" && typeof path[5] === "number") parts.push(t("ed.shell.issue.hint", { n: path[5] + 1 }))
    if (path[4] === "Placeholders" && typeof path[5] === "number") parts.push(t("ed.shell.issue.placeholder"))
  }
  if (path[2] === "Topology") {
    if (path[3] === "Devices" && typeof path[4] === "number") {
      const device = variant.Topology.Devices[path[4]]
      parts.push(t("ed.shell.issue.device", { name: device?.Name || String(path[4] + 1) }))
    } else if (path[3] === "Variables") parts.push(t("ed.shell.issue.variable"))
    else if (path[3] === "Connections") parts.push(t("ed.shell.issue.connection"))
  }
  return parts
}

/** One line for a field of the draft: where it is («Варіант 2, підзавдання 3») and what is wrong. */
export function describeIssue(values: DraftFormValues, path: (string | number)[], message: string): EditorIssue {
  const variant = path[0] === "Variants" && typeof path[1] === "number" ? path[1] : null
  const where = [...(variant !== null && values.Variants.length > 1 ? [t("ed.shell.issue.variant", { n: variant + 1 })] : []), ...placeOf(values, path)]
  return { path, message, variant, text: upperFirst(where.length ? `${where.join(", ")}: ${lowerFirst(message)}` : message) }
}

/** Every invalid field of the draft, one line per field and message. */
export function draftIssues(values: DraftFormValues): EditorIssue[] {
  const found: { path: (string | number)[]; message: string }[] = []
  const parsed = draftSchema.safeParse(values)
  if (!parsed.success) for (const issue of parsed.error.issues) found.push({ path: issue.path.filter((part): part is string | number => typeof part !== "symbol"), message: issue.message })
  // Publish needs a description; the draft saves without one.
  values.Variants.forEach((variant, vi) => variant.Tasks.forEach((task, ti) => {
    if (!richTextHasContent(task.Description)) found.push({ path: ["Variants", vi, "Tasks", ti, "Description"], message: t("admin.ex.err.taskDescriptionRequired") })
  }))
  const seen = new Set<string>()
  const out: EditorIssue[] = []
  for (const { path, message } of found) {
    const key = `${path.join(".")}\0${message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(describeIssue(values, path, message))
  }
  return out
}
