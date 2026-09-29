/**
 * noHardcodedText.test.ts — regression guard for the i18n rule: UI text comes
 * from messages/{uk,en}.json through t(). Flags, outside tests and fixtures:
 *  - any string or template literal with Cyrillic letters;
 *  - JSX text with letters;
 *  - literal aria-label / title / placeholder / alt / label attributes;
 *  - literal messages passed to toast.*().
 * Plus uk/en key parity for the whole catalog.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"

const ROOT = path.resolve(import.meta.dirname, "..")

/** file (relative to src) → literal text allowed there, each with its reason. */
const ALLOW: { file: string; text: string; reason: string }[] = [
  // The wordmark splits the brand name into styled parts; the link label is t("app.brand").
  { file: "components/brand/Wordmark.tsx", text: "Cyber", reason: "brand wordmark glyphs" },
  { file: "components/brand/Wordmark.tsx", text: "ICE", reason: "brand wordmark glyphs" },
  { file: "components/brand/Wordmark.tsx", text: "Box", reason: "brand wordmark glyphs" },
]

const CYRILLIC = /[Ѐ-ӿ]/
const LETTER = /[A-Za-zЀ-ӿ]/
const TEXT_ATTRS = new Set(["aria-label", "title", "placeholder", "alt", "label"])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === "test" ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [full] : []
  })
}

function violations(file: string): string[] {
  const rel = path.relative(ROOT, file)
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const report = (node: ts.Node, text: string) => {
    if (ALLOW.some((entry) => entry.file === rel && text.includes(entry.text))) return
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    found.push(`${rel}:${line + 1}: ${text.trim().slice(0, 80)}`)
  }
  const literalText = (node: ts.Node): string | null =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text
      : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : null

  const visit = (node: ts.Node) => {
    const text = literalText(node)
    if (text !== null && CYRILLIC.test(text)) report(node, text)
    if (ts.isJsxText(node) && LETTER.test(node.text)) report(node, node.text)
    if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(source)) && node.initializer) {
      const init = node.initializer
      const value = ts.isStringLiteral(init) ? init.text
        : ts.isJsxExpression(init) && init.expression ? literalText(init.expression) : null
      if (value && LETTER.test(value) && !CYRILLIC.test(value)) report(node, `${node.name.getText(source)}="${value}"`)
    }
    if (ts.isCallExpression(node) && /^toast\.\w+$/.test(node.expression.getText(source))) {
      const [first] = node.arguments
      const value = first ? literalText(first) : null
      if (value && LETTER.test(value) && !CYRILLIC.test(value)) report(first, value)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe("i18n rule", () => {
  it("has no hardcoded UI text outside messages", () => {
    const found = sourceFiles(ROOT).flatMap(violations)
    expect(found, found.join("\n")).toEqual([])
  })

  it("keeps uk and en with the same keys and no blank values", () => {
    const enKeys = Object.keys(en).sort()
    const ukKeys = Object.keys(uk).sort()
    expect(ukKeys.filter((key) => !enKeys.includes(key)), "keys missing in en").toEqual([])
    expect(enKeys.filter((key) => !ukKeys.includes(key)), "keys missing in uk").toEqual([])
    for (const [lang, catalog] of [["en", en], ["uk", uk]] as const) {
      const blank = Object.entries(catalog as Record<string, string>).filter(([, value]) => !value.trim()).map(([key]) => key)
      expect(blank, `blank values in ${lang}`).toEqual([])
    }
  })

  it("keeps catalog help keys to one sentence each (one line per key)", () => {
    for (const [lang, catalog] of [["en", en], ["uk", uk]] as const) {
      const long = Object.entries(catalog as Record<string, string>)
        .filter(([key, value]) => key.startsWith("exercises.help.") && (/[.!?]\s+\S/.test(value) || value.includes("\n")))
        .map(([key]) => key)
      expect(long, `multi-sentence help in ${lang}`).toEqual([])
    }
  })
})
