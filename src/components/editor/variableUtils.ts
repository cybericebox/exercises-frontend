/**
 * variableUtils.ts — variable-pill serialization for the notification template editor.
 *
 * Storage formats:
 *   Bare   {{Name}}   — email block-body fields (Go block renderer: vars[varName])
 *   Dotted {{.Name}}  — subject / preheader (Go text/template: {{.Var}})
 *
 * Every serialize/parse function accepts `opts?: { dotted?: boolean }` and
 * emits or parses the matching token form.  The pill span is identical in both
 * modes — the dot only appears inside the raw token string.
 *
 * Security: variable names are constrained to \w+ (alphanumeric + _).
 * Literal text passed through rawToHtml is always HTML-escaped.
 * This editor is admin-only; content is authored by admins.
 */

export type VariableDef = { name: string; description?: string; example?: string }

// ── HTML escaping ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Pill helpers ──────────────────────────────────────────────────────────────

function pillHtml(name: string): string {
  // data-var holds the canonical name (no dot); pill text is just the name.
  return `<span class="var-pill" data-var="${name}">${name}</span>`
}

/**
 * Replace var-pill spans with the appropriate raw token.
 * Uses data-var as the canonical source — not the span's text content.
 */
function stripPills(html: string, opts?: { dotted?: boolean }): string {
  const prefix = opts?.dotted ? '.' : ''
  return html.replace(
    /<span[^>]*data-var="(\w+)"[^>]*>[\s\S]*?<\/span>/g,
    `{{${prefix}$1}}`,
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a raw string with {{Name}} (or {{.Name}} when opts.dotted) tokens
 * to pill-HTML for display in a contentEditable.
 *
 * - Known variables (present in `variables`) become pill spans.
 * - Unknown tokens are left as escaped plain text (no pill).
 * - All non-token literal text is HTML-escaped.
 *
 * Idempotent: existing pill spans are stripped to tokens first.
 */
export function rawToHtml(
  raw: string,
  variables: string[],
  opts?: { dotted?: boolean },
): string {
  const known = new Set(variables)
  // Strip any existing pills so calling rawToHtml twice is safe.
  const plain = stripPills(raw ?? '', opts)

  // Build a regex that matches the correct token form.
  const prefix = opts?.dotted ? '\\.' : ''
  const tokenRe = new RegExp(`\\{\\{${prefix}(\\w+)\\}\\}`, 'g')

  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(plain)) !== null) {
    // Escape everything before this token.
    parts.push(escapeHtml(plain.slice(lastIndex, match.index)))

    const name = match[1]
    if (known.has(name)) {
      parts.push(pillHtml(name))
    } else {
      // Unknown token — leave as escaped plain text.
      parts.push(escapeHtml(match[0]))
    }
    lastIndex = tokenRe.lastIndex
  }

  // Escape any trailing text after the last token.
  parts.push(escapeHtml(plain.slice(lastIndex)))

  return parts.join('')
}

/**
 * Convert var-pill spans back to raw tokens, preserving all other HTML markup.
 * Use for rich-text body fields that may contain bold/italic/links.
 */
export function htmlToRaw(html: string, opts?: { dotted?: boolean }): string {
  return stripPills(html, opts).replace(/\u200B/g, '')
}

/**
 * Convert var-pill spans to raw tokens, strip all other HTML tags, and
 * collapse to a single trimmed line.
 * Use for single-line fields (subject, preheader).
 */
export function htmlToRawSingleLine(
  html: string,
  opts?: { dotted?: boolean },
): string {
  return stripPills(html, opts)
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\u200B/g, '')
    .trim()
}

/**
 * Insert a variable pill at the current caret position in the focused
 * contentEditable element, replacing the `{{` trigger (and any partial word
 * typed after it).
 *
 * Returns true on success, false if the trigger was not found near the cursor
 * or no valid selection exists.
 */
export function insertVariablePill(name: string): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false

  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return false

  const text = node.textContent ?? ''
  const offset = range.startOffset
  const before = text.slice(0, offset)
  const triggerMatch = before.match(/\{\{(\w*)$/)
  if (!triggerMatch) return false
  const triggerIdx = before.length - triggerMatch[0].length

  const pill = document.createElement('span')
  pill.className = 'var-pill'
  pill.setAttribute('data-var', name)
  pill.setAttribute('contenteditable', 'false')
  pill.textContent = name

  const deleteRange = document.createRange()
  deleteRange.setStart(node, triggerIdx)
  deleteRange.setEnd(node, offset)
  deleteRange.deleteContents()
  deleteRange.insertNode(pill)

  // Zero-width space gives the cursor a text node to land in after the pill.
  const spacer = document.createTextNode('​')
  pill.after(spacer)

  const cursor = document.createRange()
  cursor.setStartAfter(spacer)
  cursor.collapse(true)
  sel.removeAllRanges()
  sel.addRange(cursor)

  return true
}
