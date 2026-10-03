// Bot-check helper shared by every frontend (same file in each repo, no cross-repo import).
//
// One provider for the whole platform, chosen by config: turnstile | recaptcha | none.
// `executeCaptcha(action)` loads the provider script ONCE and resolves with a token. The token goes to
// the API in the JSON body field `RecaptchaToken` for every provider (the field name is kept).
// Actions: signIn, signUp, forgotPassword (forms) and clientToken (the invisible client token).
//
// NEXT_PUBLIC_* are placeholders baked at build and substituted at container start, so a value is never
// compared with `=== "literal"` (the bundler would fold it); `["x"].includes(value)` is used instead,
// and each variable is read as a plain `process.env.NEXT_PUBLIC_X` expression (Next inlines only that).

export type CaptchaProvider = "turnstile" | "recaptcha" | "none"
export type CaptchaAction = "signIn" | "signUp" | "forgotPassword" | "clientToken"

/** Token sent when the provider is "none" (local development and tests). */
export const NO_CAPTCHA_TOKEN = "none"

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const EXECUTE_TIMEOUT_MS = 60_000

export function captchaProvider(): CaptchaProvider {
  const value = (process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER ?? "").trim()
  if (["turnstile"].includes(value)) return "turnstile"
  if (["recaptcha"].includes(value)) return "recaptcha"
  return "none"
}

function siteKey(): string {
  const key = (process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ?? "").trim()
  if (!key) throw new Error("NEXT_PUBLIC_CAPTCHA_SITE_KEY is required when the bot-check provider is not none")
  return key
}

function recaptchaEnterprise(): boolean {
  return ["true"].includes((process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE ?? "").trim())
}

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  execute: (widgetId: string) => void
  remove: (widgetId: string) => void
}
type RecaptchaApi = {
  ready: (callback: () => void) => void
  execute: (key: string, options: { action: string }) => Promise<string>
}
type CaptchaWindow = Window & {
  turnstile?: TurnstileApi
  grecaptcha?: RecaptchaApi & { enterprise?: RecaptchaApi }
}

// One loading promise per script URL: the script is added to the page once, even for parallel calls.
const scripts = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const known = scripts.get(src)
  if (known) return known
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script")
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      el.remove()
      scripts.delete(src) // a failed load may be retried by the next call
      reject(new Error("bot-check script failed to load"))
    }
    document.head.appendChild(el)
  })
  scripts.set(src, promise)
  return promise
}

async function executeRecaptcha(action: CaptchaAction): Promise<string> {
  const key = siteKey()
  const enterprise = recaptchaEnterprise()
  await loadScript(`https://www.google.com/recaptcha/${enterprise ? "enterprise" : "api"}.js?render=${encodeURIComponent(key)}`)
  const w = window as CaptchaWindow
  const api = enterprise ? w.grecaptcha?.enterprise : w.grecaptcha
  if (!api) throw new Error("reCAPTCHA is unavailable")
  await new Promise<void>((resolve) => api.ready(resolve))
  return api.execute(key, { action })
}

async function executeTurnstile(action: CaptchaAction): Promise<string> {
  const key = siteKey()
  await loadScript(TURNSTILE_SRC)
  const api = (window as CaptchaWindow).turnstile
  if (!api) throw new Error("Turnstile is unavailable")
  // Temporary container: the widget stays invisible unless the provider needs an interaction.
  const container = document.createElement("div")
  container.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647"
  document.body.appendChild(container)
  let widgetId: string | undefined
  const cleanup = () => {
    try {
      if (widgetId !== undefined) api.remove(widgetId)
    } catch {
      // the widget is already gone
    }
    container.remove()
  }
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bot-check timed out")), EXECUTE_TIMEOUT_MS)
      const settle = <T,>(fn: (value: T) => void) => (value: T) => {
        clearTimeout(timer)
        fn(value)
      }
      widgetId = api.render(container, {
        sitekey: key,
        action,
        appearance: "interaction-only",
        execution: "execute",
        callback: settle(resolve),
        "error-callback": settle(() => reject(new Error("bot-check failed"))),
        "timeout-callback": settle(() => reject(new Error("bot-check expired"))),
      })
      api.execute(widgetId)
    })
  } finally {
    cleanup()
  }
}

/** Runs the configured bot check for `action` and resolves with the token for the API (`RecaptchaToken`). */
export async function executeCaptcha(action: CaptchaAction): Promise<string> {
  const provider = captchaProvider()
  if (provider === "turnstile") return executeTurnstile(action)
  if (provider === "recaptcha") return executeRecaptcha(action)
  return NO_CAPTCHA_TOKEN
}

/** Test hook: forget loaded scripts. */
export function resetCaptchaForTests(): void {
  scripts.clear()
}
