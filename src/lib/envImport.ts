export type ImportedEnvVar = { Name: string; Value: string; Secret: true; HasValue: false }
export type EnvImportResult = { imported: ImportedEnvVar[]; duplicates: number; invalid: number }

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function parseValue(raw: string): string | null {
  const value = raw.trimStart()
  if (value[0] !== '"' && value[0] !== "'") return value.replace(/\s+#.*$/, '').trimEnd()
  const quote = value[0]
  let end = 1
  while (end < value.length) {
    if (value[end] === quote && (quote === "'" || value[end - 1] !== '\\')) break
    end++
  }
  if (end >= value.length || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) return null
  const quoted = value.slice(1, end)
  return quote === '"' ? quoted.replace(/\\([nrt"\\])/g, (_, escaped: string) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[escaped] ?? escaped) : quoted
}

/** Parse a small local dotenv file. Results contain counts, never rejected values. */
export function parseEnvImport(text: string, occupied = new Set<string>()): EnvImportResult {
  const used = new Set(occupied)
  const result: EnvImportResult = { imported: [], duplicates: 0, invalid: 0 }
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const assignment = /^(?:export\s+)?([^\s=]+)\s*=\s*(.*)$/.exec(trimmed)
    if (!assignment || !ENV_NAME.test(assignment[1])) { result.invalid++; continue }
    const value = parseValue(assignment[2])
    if (value === null) { result.invalid++; continue }
    const name = assignment[1]
    if (used.has(name)) { result.duplicates++; continue }
    used.add(name)
    result.imported.push({ Name: name, Value: value, Secret: true, HasValue: false })
  }
  return result
}

export type EnvFileEntry = { Name: string; Value: string }
export type EnvPlan = {
  /** New variables (secret by default: an imported file usually holds secrets). */
  added: ImportedEnvVar[]
  /** Existing variables whose value the file replaces, by their position. */
  updated: { index: number; name: string; value: string }[]
  /** Saved secrets the file holds an empty value for: they keep the stored value. */
  kept: string[]
  invalid: number
}

/** Reads a dotenv file into entries; the first occurrence of a name wins. Never reports rejected values. */
export function parseEnvFile(text: string): { entries: EnvFileEntry[]; invalid: number } {
  const seen = new Set<string>()
  const entries: EnvFileEntry[] = []
  let invalid = 0
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const assignment = /^(?:export\s+)?([^\s=]+)\s*=\s*(.*)$/.exec(trimmed)
    const value = assignment && ENV_NAME.test(assignment[1]) ? parseValue(assignment[2]) : null
    if (!assignment || value === null) { invalid++; continue }
    if (seen.has(assignment[1])) continue
    seen.add(assignment[1])
    entries.push({ Name: assignment[1], Value: value })
  }
  return { entries, invalid }
}

/**
 * What importing a file does to the variables of a device. A name that exists is updated; a saved secret (the server never
 * returns its value) is replaced only by a non-empty value from the file, an empty one means "keep" and the secret stays.
 */
export function planEnvImport(rows: { Name: string; Secret: boolean; HasValue: boolean; Value: string }[], entries: EnvFileEntry[], invalid = 0): EnvPlan {
  const plan: EnvPlan = { added: [], updated: [], kept: [], invalid }
  for (const entry of entries) {
    const index = rows.findIndex((row) => row.Name === entry.Name)
    if (index < 0) { plan.added.push({ Name: entry.Name, Value: entry.Value, Secret: true, HasValue: false }); continue }
    const row = rows[index]
    if (row.Secret && row.HasValue && entry.Value === '') { plan.kept.push(entry.Name); continue }
    plan.updated.push({ index, name: entry.Name, value: entry.Value })
  }
  return plan
}

export type NameFix = "lowercase" | "characters" | "start"
export type VariableImportPlan = {
  added: { Name: string; Value: string }[]
  updated: { index: number; name: string; value: string }[]
  /** Names that were corrected to follow the rule of schema variables. */
  fixed: { from: string; to: string; because: NameFix[] }[]
  /** Names that could not be used: `long` (over 32 characters), `unusable`, or `same` (equal to another after the correction). */
  skipped: { name: string; because: "long" | "unusable" | "same" }[]
  invalid: number
}

const VARIABLE_NAME = /^[a-z][a-z0-9_]{0,31}$/

/** An environment name as a name of a schema variable (small letters, digits, «_», from a letter), with what was changed. */
export function toVariableName(original: string): { name: string; because: NameFix[] } | { skip: "long" | "unusable" } {
  const because: NameFix[] = []
  let name = original.toLowerCase()
  if (name !== original) because.push('lowercase')
  const cleaned = name.replace(/[^a-z0-9_]/g, '_')
  if (cleaned !== name) because.push('characters')
  name = cleaned
  if (!/^[a-z]/.test(name)) {
    name = `var_${name.replace(/^_+/, '')}`
    because.push('start')
  }
  if (name === 'var_' || !/^[a-z][a-z0-9_]*$/.test(name)) return { skip: 'unusable' }
  if (!VARIABLE_NAME.test(name)) return { skip: 'long' }
  return { name, because }
}

/** What importing a file does to the variables of the schema: names are corrected, a name that exists is updated. */
export function planVariableImport(rows: { Name: string }[], entries: EnvFileEntry[], invalid = 0): VariableImportPlan {
  const plan: VariableImportPlan = { added: [], updated: [], fixed: [], skipped: [], invalid }
  const seen = new Map<string, string>()
  for (const entry of entries) {
    const converted = toVariableName(entry.Name)
    if ('skip' in converted) { plan.skipped.push({ name: entry.Name, because: converted.skip }); continue }
    if (seen.has(converted.name)) { plan.skipped.push({ name: entry.Name, because: 'same' }); continue }
    seen.set(converted.name, entry.Name)
    if (converted.name !== entry.Name) plan.fixed.push({ from: entry.Name, to: converted.name, because: converted.because })
    const index = rows.findIndex((row) => row.Name === converted.name)
    if (index >= 0) plan.updated.push({ index, name: converted.name, value: entry.Value })
    else plan.added.push({ Name: converted.name, Value: entry.Value })
  }
  return plan
}
