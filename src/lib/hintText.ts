/**
 * hintText.ts — a hint's Text is a serialized rich-text (Lexical) document,
 * like a task description. Drafts saved before formatting hold plain text;
 * it opens as paragraphs and is rewritten as a document on the next edit.
 * Hints carry no text alignment: it is stripped on save.
 */
type LexicalState = Record<string, unknown>

function paragraph(line: string): LexicalState {
  return {
    children: line ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }] : [],
    direction: null, format: "", indent: 0, type: "paragraph", version: 1, textFormat: 0, textStyle: "",
  }
}

function isDocument(value: unknown): value is LexicalState {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    typeof (value as { root?: unknown }).root === "object" && (value as { root?: unknown }).root !== null
}

/** Editor state for a stored hint text; null for an empty hint. */
export function hintTextToState(text: string): LexicalState | null {
  if (!text.trim()) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (isDocument(parsed)) return parsed
  } catch {
    // plain text from an older draft
  }
  return { root: { children: text.split("\n").map(paragraph), direction: null, format: "", indent: 0, type: "root", version: 1 } }
}

function hasText(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasText)
  if (typeof node !== "object" || node === null) return false
  const value = node as Record<string, unknown>
  if (value.type === "text") return typeof value.text === "string" && value.text.trim() !== ""
  if (value.type === "variable") return typeof value.varName === "string" && value.varName !== ""
  return Object.values(value).some(hasText)
}

/** True when a stored hint text says something (not blank, not only empty paragraphs). */
export function hintTextHasContent(text: string): boolean {
  const state = hintTextToState(text)
  return state !== null && hasText(state)
}

// Element nodes keep alignment in a string `format` (text nodes use a number).
function withoutAlignment(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutAlignment)
  if (typeof node !== "object" || node === null) return node
  return Object.fromEntries(Object.entries(node).map(([key, value]) =>
    [key, key === "format" && typeof value === "string" ? "" : withoutAlignment(value)]))
}

/** Stored hint text for an editor state; an editor without text stores "". */
export function stateToHintText(state: LexicalState | null): string {
  return state && hasText(state) ? JSON.stringify(withoutAlignment(state)) : ""
}
