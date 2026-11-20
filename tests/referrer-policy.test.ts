import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

// The test-lab page posts a grant form cross-site to the lab host. With "no-referrer" the browser sends "Origin: null" and
// the lab proxy (which requires the platform Origin) refuses every grant. The site sends the browser default.
const root = join(__dirname, "..")
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))
}

it("sets no no-referrer policy in the pages, the nginx config or the CSP script", () => {
  const sources = [...files(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)), ...files(join(root, "deploy/nginx")), join(root, "deploy/csp.sh"), join(root, "next.config.ts")]
  const offenders = sources.filter((file) => /Referrer-Policy|referrer\s*:\s*["']no-referrer["']|name=["']referrer["']/i.test(readFileSync(file, "utf8").replace(/^\s*#.*$/gm, "")))
  expect(offenders).toEqual([])
})
