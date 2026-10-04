// Build step for the CSP (see deploy/csp.sh). Next injects some inline scripts only at runtime
// (next/script), so they are not in out/*.html. This writes their exact text, with the
// NEXT_PUBLIC_* placeholders the image build uses, to out/_csp/*.txt. The container entrypoint
// substitutes the real values into it (like every other file in out/), hashes it and deletes it.
// Run after `next build`, in the same Docker build step.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dirname, "..")

// Map the tsconfig `@/*` alias to ./src/* so lib/consent.ts can be imported as-is.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(join(ROOT, "src", `${specifier.slice(2)}.ts`)).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const { gtagBootScript } = await import(pathToFileURL(join(ROOT, "src/lib/consent.ts")).href)

const dir = join(ROOT, "out/_csp")
mkdirSync(dir, { recursive: true })
// Must be the exact text of <Script id="ga-init">{gtagBootScript(gaId)}</Script>.
writeFileSync(join(dir, "gtag-boot.txt"), gtagBootScript("__NEXT_PUBLIC_GOOGLE_ANALYTICS_ID__"))
console.log("[csp] wrote out/_csp/gtag-boot.txt")
