// Design system copy: src/styles/ds-tokens.css and the crest files in public/assets come from docs/design-system
// (copied, never imported). ds.lock.json records the sha256 of every source and every copy.
//   node scripts/ds-sync.mjs            copy from the design system (DS_DIR, default: docs/design-system in a parent folder) and rewrite the lock
//   node scripts/ds-sync.mjs --check    fail when a copy was edited by hand; when the design system is reachable, also when it moved on
// CI has no design-system checkout, so it checks the copies against the lock; locally the check also diffs the source.
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
// The design system sits next to the repositories (docs/design-system); look in every parent, so a worktree finds it too.
function findDs() {
  for (let dir = root; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const candidate = path.join(dir, "docs", "design-system")
    if (fs.existsSync(path.join(candidate, "tokens.css"))) return candidate
  }
  return path.join(root, "..", "docs", "design-system")
}
const dsDir = path.resolve(process.env.DS_DIR ?? findDs())
const lockFile = path.join(root, "src/styles/ds.lock.json")

// copy path (in the repo) -> source path (in the design system)
const COPIES = {
  "src/styles/ds-tokens.css": "tokens.css",
  "public/assets/crest-64.png": "assets/crest-64.png",
  "public/assets/crest-128.png": "assets/crest-128.png",
}

const sha = (data) => createHash("sha256").update(data).digest("hex")

const HEADER = `/* Copy of docs/design-system/tokens.css (node scripts/ds-sync.mjs; ds.lock.json holds the hashes). Do not edit by hand.
   Differences from the source: no @font-face (Geist comes from next/font), --ib-font / --ib-mono use its variables,
   and --ib-shadow-overlay is none (this app has no shadows, see src/styles/noShadows.test.ts). */
`

export function transform(tokens) {
  const body = tokens
    .replace(/^@font-face\{[^\n]*\}\n/gm, "")
    .replace(/--ib-shadow-overlay:[^;]*;/g, "--ib-shadow-overlay:none;")
    .replace(/--ib-font:[^;]*;/, '--ib-font:var(--font-geist-sans),"Geist",system-ui,sans-serif;')
    .replace(/--ib-mono:[^;]*;/, '--ib-mono:var(--font-geist-mono),"Geist Mono",ui-monospace,monospace;')
  return HEADER + body
}

function readSource(rel) {
  return fs.readFileSync(path.join(dsDir, rel))
}

export function check() {
  const problems = []
  if (!fs.existsSync(lockFile)) return ["src/styles/ds.lock.json is missing: run node scripts/ds-sync.mjs"]
  const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"))
  const haveSource = fs.existsSync(path.join(dsDir, "tokens.css"))
  for (const [copy, source] of Object.entries(COPIES)) {
    const entry = lock[copy]
    if (!entry) { problems.push(`${copy}: not in the lock`); continue }
    const file = path.join(root, copy)
    if (!fs.existsSync(file)) { problems.push(`${copy}: missing`); continue }
    if (sha(fs.readFileSync(file)) !== entry.copy) problems.push(`${copy}: edited by hand, run node scripts/ds-sync.mjs`)
    if (haveSource && sha(readSource(source)) !== entry.source) problems.push(`${copy}: docs/design-system/${source} changed, run node scripts/ds-sync.mjs`)
  }
  return problems
}

function sync() {
  const lock = {}
  for (const [copy, source] of Object.entries(COPIES)) {
    const src = readSource(source)
    const out = copy.endsWith(".css") ? Buffer.from(transform(src.toString("utf8"))) : src
    fs.writeFileSync(path.join(root, copy), out)
    lock[copy] = { source: sha(src), copy: sha(out) }
  }
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n")
  console.log(`design system copied from ${dsDir}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = check()
    if (problems.length) { console.error(problems.join("\n")); process.exit(1) }
    console.log("design system copies are in sync")
  } else {
    sync()
  }
}
