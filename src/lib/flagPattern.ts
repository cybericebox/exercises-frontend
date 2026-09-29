/** The UI mirror of the server's deliberately small flag-template grammar. */
const PREFIX = "template:"
const FLAG_RE = /^ICE\{[^\p{White_Space}\p{Cc}{}]+\}$/u
const DIGITS = "0123456789"
const LOWER = "abcdefghijklmnopqrstuvwxyz"
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

type Part = { literal: string } | { choices: string[] }

export class FlagTemplateNeedsRandomError extends Error {
  constructor() {
    super("Template needs a random slot")
    this.name = "FlagTemplateNeedsRandomError"
  }
}

export function flagCandidateErrorKey(error: unknown): "admin.ex.val.flagTemplateNeedsRandom" | "admin.ex.val.flagFormat" {
  return error instanceof FlagTemplateNeedsRandomError ? "admin.ex.val.flagTemplateNeedsRandom" : "admin.ex.val.flagFormat"
}

export type ParsedFlagCandidate = {
  kind: "fixed" | "template"
  cardinality: bigint
  example: string
  entropyBits: number
  parts: Part[]
}

function shorthand(code: string): string[] | null {
  if (code === "d") return [...DIGITS]
  if (code === "l") return [...LOWER]
  if (code === "u") return [...UPPER]
  return null
}

function group(char: string): number {
  if (DIGITS.includes(char)) return 1
  if (LOWER.includes(char)) return 2
  if (UPPER.includes(char)) return 3
  return 0
}

function parseClass(body: string, start: number): { choices: string[]; next: number } {
  const choices = new Set<string>()
  const excluded = new Set<string>()
  let subtracting = false
  const add = (char: string) => (subtracting ? excluded : choices).add(char)
  let i = start
  while (i < body.length && body[i] !== "]") {
    if (body[i] === "^") {
      if (subtracting || choices.size === 0) throw new Error("Invalid flag exclusion")
      subtracting = true
      i++
      continue
    }
    if (body[i] === "\\") {
      const set = shorthand(body[i + 1] ?? "")
      if (!set) throw new Error("Invalid flag class")
      set.forEach(add)
      i += 2
      continue
    }
    const begin = body[i]
    if (!group(begin)) throw new Error("Invalid flag class")
    if (body[i + 1] === "-") {
      const end = body[i + 2]
      if (!end || group(begin) !== group(end) || begin.charCodeAt(0) > end.charCodeAt(0)) {
        throw new Error("Invalid flag range")
      }
      for (let code = begin.charCodeAt(0); code <= end.charCodeAt(0); code++) add(String.fromCharCode(code))
      i += 3
    } else {
      add(begin)
      i++
    }
  }
  if (body[i] !== "]" || choices.size === 0 || (subtracting && excluded.size === 0)) throw new Error("Invalid flag class")
  if ([...excluded].some((char) => !choices.has(char))) throw new Error("Invalid flag exclusion")
  const remaining = [...choices].filter((char) => !excluded.has(char))
  if (remaining.length === 0) throw new Error("Empty flag class")
  return { choices: remaining, next: i + 1 }
}

function entropyBits(cardinality: bigint): number {
  if (cardinality <= BigInt(Number.MAX_SAFE_INTEGER)) return Math.log2(Number(cardinality))
  const bitLength = cardinality.toString(2).length
  return bitLength - 53 + Math.log2(Number(cardinality >> BigInt(bitLength - 53)))
}

export function parseFlagCandidate(raw: string): ParsedFlagCandidate {
  const isTemplate = raw.startsWith(PREFIX)
  const value = isTemplate ? raw.slice(PREFIX.length) : raw
  if (!FLAG_RE.test(value)) throw new Error("Invalid ICE flag")
  if (!isTemplate) {
    return { kind: "fixed", cardinality: BigInt(1), example: value, entropyBits: 0, parts: [{ literal: value.slice(4, -1) }] }
  }

  const body = value.slice(4, -1)
  const parts: Part[] = []
  let literal = ""
  let randomSlots = 0
  const flush = () => {
    if (literal) parts.push({ literal })
    literal = ""
  }
  for (let i = 0; i < body.length;) {
    const char = body[i]
    if (char === "\\") {
      const next = body[i + 1]
      if (!next) throw new Error("Invalid flag escape")
      if (next === "[" || next === "]" || next === "\\") {
        literal += next
      } else {
        const choices = shorthand(next)
        if (!choices) throw new Error("Invalid flag escape")
        flush()
        parts.push({ choices })
        randomSlots++
      }
      i += 2
    } else if (char === "[") {
      const parsed = parseClass(body, i + 1)
      flush()
      parts.push({ choices: parsed.choices })
      randomSlots++
      i = parsed.next
    } else if (char === "]") {
      throw new Error("Unmatched flag bracket")
    } else {
      literal += char
      i++
    }
  }
  flush()
  if (!randomSlots) throw new FlagTemplateNeedsRandomError()
  const cardinality = parts.reduce((count, part) => count * ("choices" in part ? BigInt(part.choices.length) : BigInt(1)), BigInt(1))
  const example = `ICE{${parts.map((part) => "choices" in part ? part.choices[0] : part.literal).join("")}}`
  return { kind: "template", cardinality, example, entropyBits: entropyBits(cardinality), parts }
}

export function flagTemplateCanProduce(pattern: ParsedFlagCandidate, value: string): boolean {
  if (pattern.kind !== "template" || !FLAG_RE.test(value)) return false
  const body = value.slice(4, -1)
  let offset = 0
  for (const part of pattern.parts) {
    if ("literal" in part) {
      if (!body.startsWith(part.literal, offset)) return false
      offset += part.literal.length
    } else {
      if (!part.choices.includes(body[offset])) return false
      offset++
    }
  }
  return offset === body.length
}
