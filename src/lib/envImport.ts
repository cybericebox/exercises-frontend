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
