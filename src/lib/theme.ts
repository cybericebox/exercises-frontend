/** Shared light/dark/system choice used by the platform, ID and admin apps. */
export type ThemeChoice = "light" | "dark" | "system"

const COOKIE = "ib_theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"
const MAX_AGE = 60 * 60 * 24 * 365

// Resolved before first paint, so navigating between subdomains has no theme flash.
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${COOKIE}=(light|dark|system)/);var c=m?m[1]:"system";var d=c==="dark"||(c==="system"&&window.matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`

export function readThemeChoice(): ThemeChoice {
  if (typeof document === "undefined") return "system"
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(light|dark|system)`))
  return (match?.[1] as ThemeChoice) ?? "system"
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(choice))
}

export function setThemeChoice(choice: ThemeChoice): void {
  const domain = process.env.NEXT_PUBLIC_DOMAIN
  const parts = [`${COOKIE}=${choice}`, "path=/", `max-age=${MAX_AGE}`, "SameSite=Lax"]
  if (domain) parts.push(`domain=.${domain}`)
  if (location.protocol === "https:") parts.push("Secure")
  document.cookie = parts.join("; ")
  applyTheme(choice)
}

export function watchSystemTheme(getChoice: () => ThemeChoice): () => void {
  if (typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia(DARK_QUERY)
  const onChange = () => { if (getChoice() === "system") applyTheme("system") }
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
