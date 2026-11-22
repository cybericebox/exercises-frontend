// CI check for the optional installation settings (README, Configuration → Installation settings).
//
// It builds the static export the way deploy/Dockerfile does (every NEXT_PUBLIC_* set to its placeholder __NEXT_PUBLIC_X__) and checks:
//   1. every prerendered page has <html ... data-cfg-x="__NEXT_PUBLIC_X__"> for every setting, and every token is in the bundle
//      (a comparison folded by the minifier, or a lost token, fails here: this is how NEXT_PUBLIC_SHOW_PARTNERS=false was found dead in images);
//   2. the entrypoint's substitution (every placeholder replaced by the value, an unset one by "") gives data-cfg-x="<value>" on every page,
//      with all values set and with all empty, and leaves no placeholder behind;
//   3. a build with an EMPTY value (NEXT_PUBLIC_X="") renders data-cfg-x="" (not a missing attribute).
// The substitution is the same rule as deploy/docker-entrypoint.sh (one expression per variable, `__NAME__` -> value) done in node, so it also
// runs on a developer's machine without Docker. `--no-build` reuses an existing placeholder build in out/ (checks 1 and 2 only).
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const OUT = join(ROOT, "out")

function fail(message) {
  console.error(`check-cfg: ${message}`)
  process.exit(1)
}

const settingsSource = readFileSync(join(ROOT, "src/lib/settings.ts"), "utf8")
const settings = [...settingsSource.matchAll(/"(data-cfg-[a-z-]+)":\s*process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)].map((m) => ({ attr: m[1], name: m[2] }))
if (settings.length === 0) fail("no settings found in src/lib/settings.ts")

// The variables of the Dockerfile's ENV, as the image build sets them.
const dockerfile = readFileSync(join(ROOT, "deploy/Dockerfile"), "utf8")
const placeholders = Object.fromEntries([...dockerfile.matchAll(/(NEXT_PUBLIC_[A-Z0-9_]+)="(__NEXT_PUBLIC_[A-Z0-9_]+__)"/g)].map((m) => [m[1], m[2]]))
for (const { name } of settings) if (placeholders[name] !== `__${name}__`) fail(`${name} is not a placeholder in deploy/Dockerfile`)

function build(extra) {
  rmSync(OUT, { recursive: true, force: true })
  const run = spawnSync("npm", ["run", "build"], { cwd: ROOT, env: { ...process.env, ...extra }, stdio: ["ignore", "ignore", "inherit"] })
  if (run.status !== 0) fail("the build failed")
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
}

const TEXT = /\.(html|js|css|txt|json|xml|webmanifest|map)$/
const textFiles = (dir) => walk(dir).filter((file) => TEXT.test(file))
const htmlTag = (file) => /<html\b[^>]*>/.exec(readFileSync(file, "utf8"))?.[0] ?? ""

function substitute(dir, values) {
  for (const file of textFiles(dir)) {
    const before = readFileSync(file, "utf8")
    const after = before.replace(/__(NEXT_PUBLIC_[A-Z0-9_]+)__/g, (_, name) => values[name] ?? "")
    if (after !== before) writeFileSync(file, after)
  }
}

let problems = 0
const report = (message) => {
  problems += 1
  console.error(`check-cfg: ${message}`)
}

const rebuild = !process.argv.includes("--no-build")
if (rebuild) build(placeholders)

// 1. placeholders in the markup and in the bundle
const pages = walk(OUT).filter((file) => file.endsWith(".html"))
if (pages.length === 0) fail("no HTML page in out/")
for (const page of pages) {
  const tag = htmlTag(page)
  for (const { attr, name } of settings) {
    if (!tag.includes(`${attr}="__${name}__"`)) report(`${page.slice(OUT.length + 1)}: <html> has no ${attr}="__${name}__"`)
  }
}
const bundle = textFiles(OUT).map((file) => readFileSync(file, "utf8")).join("\n")
for (const { name } of settings) {
  if (!bundle.includes(`__${name}__`)) report(`the token __${name}__ is not in the built output (folded or lost)`)
}

// 2. the substitution, with all values set and with all empty
const isFlag = (name) => name.endsWith("_SUPPORT")
const valuesSet = Object.fromEntries(settings.map(({ name }) => [name, isFlag(name) ? "true" : `https://example.org/${name.toLowerCase()}`]))
const valuesEmpty = Object.fromEntries(settings.map(({ name }) => [name, isFlag(name) ? "false" : ""]))
const base = { NEXT_PUBLIC_DOMAIN: "example.test", NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.test" }
for (const [label, values] of [["set", valuesSet], ["empty", valuesEmpty]]) {
  const copy = mkdtempSync(join(tmpdir(), "check-cfg-"))
  cpSync(OUT, copy, { recursive: true })
  substitute(copy, { ...base, ...values })
  for (const page of walk(copy).filter((file) => file.endsWith(".html"))) {
    const tag = htmlTag(page)
    for (const { attr, name } of settings) {
      if (!tag.includes(`${attr}="${values[name]}"`)) report(`${label} values: ${page.slice(copy.length + 1)}: <html> has no ${attr}="${values[name]}"`)
    }
  }
  const left = textFiles(copy).filter((file) => /__NEXT_PUBLIC_[A-Z0-9_]+__/.test(readFileSync(file, "utf8")))
  if (left.length > 0) report(`${label} values: a placeholder is left in ${left[0].slice(copy.length + 1)}`)
  rmSync(copy, { recursive: true, force: true })
}

// 3. a build with empty values keeps the attribute, empty
if (rebuild) {
  build({ ...placeholders, ...Object.fromEntries(settings.map(({ name }) => [name, ""])) })
  for (const page of walk(OUT).filter((file) => file.endsWith(".html"))) {
    const tag = htmlTag(page)
    for (const { attr } of settings) if (!tag.includes(`${attr}=""`)) report(`empty build: ${page.slice(OUT.length + 1)}: <html> has no ${attr}=""`)
  }
}

if (problems > 0) fail(`${problems} problem(s)`)
console.log(`check-cfg: ${settings.length} settings, ${pages.length} pages: placeholders survive, substitution gives the values, an empty build keeps empty attributes`)
