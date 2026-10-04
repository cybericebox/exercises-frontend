import { hosts } from "@/lib/hosts"

/** Shared light/dark/system choice used by the platform, ID and admin apps. */
export type ThemeChoice = "light" | "dark" | "system"

const COOKIE = "cib_theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"
const MAX_AGE = 60 * 60 * 24 * 365
const DOMAIN_ATTR = `; domain=.${hosts().cookieDomain}`

// Resolved before first paint, so navigating between subdomains has no theme flash.
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${COOKIE}=(light|dark|system)/);var c=m?m[1]:"system";var d=c==="dark"||(c==="system"&&window.matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`

function matchChoice(name: string): ThemeChoice | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${name}=(light|dark|system)`))?.[1] as ThemeChoice | undefined
}

function writeCookie(value: string, maxAge: number): void {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${COOKIE}=${value}; path=/${DOMAIN_ATTR}; SameSite=Lax${secure}; max-age=${maxAge}`
}

export function readThemeChoice(): ThemeChoice {
  if (typeof document === "undefined") return "system"
  const choice = matchChoice(COOKIE)
  return choice ?? "system"
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(choice))
}

export function setThemeChoice(choice: ThemeChoice): void {
  writeCookie(choice, MAX_AGE)
  applyTheme(choice)
}

export function watchSystemTheme(getChoice: () => ThemeChoice): () => void {
  if (typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia(DARK_QUERY)
  const onChange = () => { if (getChoice() === "system") applyTheme("system") }
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
