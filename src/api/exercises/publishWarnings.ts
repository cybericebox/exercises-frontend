/**
 * publishWarnings.ts — the warnings of a successful publish or import (POST :id/publish, the import answers and jobs).
 *
 * A warning never blocks anything: the version is published. The field is `Warnings` on the answer; an older backend
 * sends none, which reads as no warnings.
 *
 *   attachments_in_some_variants: a subtask carries files in some independent variants and none in others.
 *     Task is the subtask's name; WithFiles / WithoutFiles are the 1-based numbers of the variants.
 */
export type PublishWarningCode = "attachments_in_some_variants"
export type PublishWarning = { Code: PublishWarningCode | string; Task: string; WithFiles: number[]; WithoutFiles: number[] }

const numbers = (value: unknown): number[] => Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : []

/** The warnings of an answer: absent or malformed reads as none; an entry without a code is dropped. */
export function readPublishWarnings(raw: unknown): PublishWarning[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const entry = item as Record<string, unknown>
    if (typeof entry.Code !== "string" || entry.Code === "") return []
    return [{ Code: entry.Code, Task: typeof entry.Task === "string" ? entry.Task : "", WithFiles: numbers(entry.WithFiles), WithoutFiles: numbers(entry.WithoutFiles) }]
  })
}
