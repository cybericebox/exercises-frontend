/** Add a relative post-auth destination to a newly minted proxy handoff, preserving its token. */
export function proxyHandoffURL(handoff: string, destination?: string): string {
  if (destination === undefined || destination === "/") return handoff
  const base = new URL(handoff)
  let decoded = destination
  // Defence in depth; the proxy independently validates next before redirecting.
  for (let pass = 0; pass < 4; pass++) {
    const unsafeCharacter = [...decoded].some((character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    if (!decoded.startsWith("/") || decoded.startsWith("//") || unsafeCharacter) throw new Error("Unsafe proxy destination")
    const target = new URL(decoded, base.origin)
    if (target.origin !== base.origin || target.pathname.includes("//") || target.pathname.replace(/\/+$/, "") === "/_auth") throw new Error("Unsafe proxy destination")
    const next = decodeURIComponent(decoded)
    if (next === decoded) {
      const value = new URL(destination, base.origin)
      base.searchParams.set("next", `${value.pathname}${value.search}${value.hash}`)
      return base.href
    }
    decoded = next
  }
  throw new Error("Unsafe proxy destination")
}
