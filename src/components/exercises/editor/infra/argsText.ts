/**
 * argsText.ts — a command as one line of text and back. Parts are separated by spaces; a part with spaces or quotes is
 * wrapped in single or double quotes (`nginx -g 'daemon off;'` is three parts).
 */
export function splitArgs(text: string): string[] {
  const parts: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let started = false
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started || current !== "") parts.push(current)
      current = ""
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started || current !== "") parts.push(current)
  return parts
}

export function joinArgs(parts: string[]): string {
  return parts.map((part) => {
    if (part === "") return "''"
    if (!/[\s'"]/.test(part)) return part
    return part.includes("'") ? `"${part}"` : `'${part}'`
  }).join(" ")
}

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index])
