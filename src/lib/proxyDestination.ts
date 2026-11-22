/**
 * The grant is posted to the device host's /_auth endpoint together with this validated relative path, and the
 * proxy redirects to it. Returns the path to send as `next` ("/" when there is no destination).
 */
export function proxyDestinationNext(authURL: string, destination?: string): string {
  if (destination === undefined || destination === "/") return "/"
  const base = new URL(authURL)
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
      return `${value.pathname}${value.search}${value.hash}`
    }
    decoded = next
  }
  throw new Error("Unsafe proxy destination")
}
