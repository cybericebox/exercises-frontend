// Small builders for the guide pages (uk only). They only assemble trusted static markup; no user data goes through them.

/** The brand name with non-breaking spaces: it never wraps. */
export const BRAND = "Cyber ICE Box"

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" }

/** Escapes text for HTML. */
export const esc = (text: string): string => text.replace(/[&<>]/g, (ch) => ESC[ch])

/** Inline code. */
export const c = (text: string): string => `<code>${esc(text)}</code>`

/** A block of code in the guide's monospace frame. */
export const pre = (text: string): string => `<pre class="g-tree">${esc(text)}</pre>`

/** A bulleted list; items are html. */
export const ul = (items: string[]): string => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`

/** A numbered list; items are html. */
export const ol = (items: string[]): string => `<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`

/** A coloured note. */
export const note = (kind: "note" | "ok" | "warn" | "rec", html: string): string => `<div class="g-callout g-callout--${kind}">${html}</div>`

/** Several short lines in one table cell. */
export const lines = (...items: string[]): string => items.map((item) => `<span class="g-line">${item}</span>`).join("")

/** A cell with a lead line and bulleted items. */
export const items = (head: string, ...list: string[]): string => `<span class="g-line g-line--head">${head}</span>${list.map((item) => `<span class="g-line g-line--item">${item}</span>`).join("")}`

/** The first cell of a field table: the label in the editor and where it sits. */
export const field = (label: string, where?: string): string => `<b class="g-label">${label}</b>${where ? `<small class="g-where">${where}</small>` : ""}`

/** A table. Cells and headers are html. */
export function table(head: string[], rows: string[][]): string {
  const th = head.map((cell) => `<th>${cell}</th>`).join("")
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
  return `<div class="g-tablewrap" role="region" tabindex="0" aria-label="Таблиця"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`
}

/** The usual four-column table: the label in the editor, the key in the file, what it is, values and limits. */
export const fieldTable = (rows: string[][]): string => table(["Поле в редакторі", "Ключ у файлі", "Що це", "Значення і межі"], rows)

/** The text used in cells for a key that exists only in the file. */
export const fileOnly = `<span class="g-muted">немає в редакторі</span>`

const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`

/** A numbered step link of the overview. */
export const step = (n: number, href: string, title: string, text: string): string =>
  `<li><a class="g-step" href="${href}"><span class="g-step__n">${n}</span><span><b>${title}</b><span class="d">${text}</span></span>${ARROW}</a></li>`
