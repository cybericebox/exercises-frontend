// Sync messages/errors.{en,uk}.json with the backend error catalog (daemon/error-catalog).
// Run by hand after the backend adds error codes:
//   npm run sync:errors                 add the codes the app does not have yet
//   npm run sync:errors -- --check      list what is missing, exit 1 if anything is
//   npm run sync:errors -- --overwrite  also replace the texts of codes the app already has
//   npm run sync:errors -- --daemon <path to the daemon checkout>   (default ../daemon)
// Existing app texts are kept unless --overwrite is given, because the apps curate
// their own wording. Keys: the full code (informCode*10000 + object*100 + detail), or
// only the detail code (the last four digits) when the app's catalog already uses those.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const daemon = resolve(args.includes("--daemon") ? args[args.indexOf("--daemon") + 1] : "../daemon")
const read = (path) => JSON.parse(readFileSync(path, "utf8"))
const apostrophe = (s) => s.replace(/(?<=\p{L})['’](?=\p{L})/gu, "ʼ")

const sorted = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => Number(a) - Number(b)))
let missingTotal = 0

for (const lang of ["en", "uk"]) {
  const source = read(`${daemon}/error-catalog/errors.${lang}.json`)
  const file = `messages/errors.${lang}.json`
  const current = read(file)
  const detailKeys = Object.keys(current).length > 0 && Object.keys(current).every((k) => Number(k) < 10000)
  const next = { ...current }
  let added = 0
  let changed = 0
  for (const [code, text] of Object.entries(source)) {
    const key = detailKeys ? String(Number(code) % 10000) : code
    const value = lang === "uk" ? apostrophe(text) : text
    if (!(key in next)) {
      next[key] = value
      added++
    } else if (flag("--overwrite") && next[key] !== value) {
      next[key] = value
      changed++
    }
  }
  missingTotal += added
  console.log(`${file}: ${added} to add${flag("--overwrite") ? `, ${changed} to replace` : ""}`)
  if (!flag("--check")) writeFileSync(file, JSON.stringify(sorted(next), null, 2) + "\n")
}
if (flag("--check") && missingTotal > 0) process.exit(1)
