import { t } from "@/i18n/t"
import { findRefs } from "@/lib/editor/refs"

/**
 * The text the author sees for a substitution: `{{task.web}}` is shown as `{{відповідь: <task name>}}` and `{{var.pw}}` as
 * `{{змінна: pw}}`, so the task key is never shown. The form keeps the raw token; these two functions convert at the edge of
 * the field. A text that matches no task name stays as typed.
 */
export type RefTask = { Key: string; Name: string }

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function toDisplay(raw: string, tasks: RefTask[]): string {
  if (!raw.includes("{{")) return raw
  const answer = t("ed.ui.ref.tagAnswer")
  const variable = t("ed.ui.ref.tagVar")
  let out = raw
  for (const ref of findRefs(raw)) {
    if (ref.kind === "task") {
      const task = tasks.find((candidate) => candidate.Key === ref.name)
      if (task && task.Name.trim()) out = out.replace(ref.text, `{{${answer}: ${task.Name.trim()}}}`)
    } else out = out.replace(ref.text, `{{${variable}: ${ref.name}}}`)
  }
  return out
}

export function fromDisplay(text: string, tasks: RefTask[]): string {
  if (!text.includes("{{")) return text
  const answer = escapeRe(t("ed.ui.ref.tagAnswer"))
  const variable = escapeRe(t("ed.ui.ref.tagVar"))
  return text
    .replace(new RegExp(`\\{\\{\\s*${answer}:\\s*(.+?)\\s*\\}\\}`, "g"), (match, name: string) => {
      const task = tasks.find((candidate) => candidate.Key !== "" && candidate.Name.trim() === name)
      return task ? `{{task.${task.Key}}}` : match
    })
    .replace(new RegExp(`\\{\\{\\s*${variable}:\\s*([A-Za-z0-9_]+)\\s*\\}\\}`, "g"), (_match, name: string) => `{{var.${name}}}`)
}

/** The substitutions of a raw text that name nothing in the variant, as shown to the author. */
export function brokenRefs(raw: string, tasks: RefTask[], variables: string[]): string[] {
  return findRefs(raw)
    .filter((ref) => (ref.kind === "task" ? !tasks.some((task) => task.Key === ref.name) : !variables.includes(ref.name)))
    .map((ref) => ref.text)
}
