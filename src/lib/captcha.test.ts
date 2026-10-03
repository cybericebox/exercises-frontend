import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captchaProvider, executeCaptcha, NO_CAPTCHA_TOKEN, resetCaptchaForTests } from "@/lib/captcha"

type Win = Window & { turnstile?: unknown; grecaptcha?: unknown }

// A script element appended to <head> "loads" right away and runs `onLoad`.
function autoLoadScripts(onLoad: (src: string) => void) {
  const original = document.head.appendChild.bind(document.head)
  return vi.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
    const el = node as HTMLScriptElement
    queueMicrotask(() => {
      onLoad(el.src)
      el.onload?.(new Event("load"))
    })
    return original(node)
  }) as typeof document.head.appendChild)
}

describe("captcha helper", () => {
  beforeEach(() => {
    resetCaptchaForTests()
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    delete (window as Win).turnstile
    delete (window as Win).grecaptcha
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("selects the provider from config, none by default and for unknown values", () => {
    expect(captchaProvider()).toBe("none")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "turnstile")
    expect(captchaProvider()).toBe("turnstile")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "recaptcha")
    expect(captchaProvider()).toBe("recaptcha")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "NEXT_PUBLIC_CAPTCHA_PROVIDER")
    expect(captchaProvider()).toBe("none")
  })

  it("none: resolves with the dummy token and loads nothing", async () => {
    await expect(executeCaptcha("signIn")).resolves.toBe(NO_CAPTCHA_TOKEN)
    expect(document.head.querySelector("script")).toBeNull()
  })

  it("a real provider without a site key fails loudly", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "turnstile")
    await expect(executeCaptcha("signIn")).rejects.toThrow(/SITE_KEY/)
  })

  it("recaptcha v3: loads api.js once and executes with the action", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "recaptcha")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_SITE_KEY", "site")
    const execute = vi.fn().mockResolvedValue("tok")
    const spy = autoLoadScripts(() => {
      ;(window as Win).grecaptcha = { ready: (cb: () => void) => cb(), execute }
    })
    const [a, b] = await Promise.all([executeCaptcha("signIn"), executeCaptcha("clientToken")])
    expect([a, b]).toEqual(["tok", "tok"])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(document.head.querySelector("script")?.src).toBe("https://www.google.com/recaptcha/api.js?render=site")
    expect(execute).toHaveBeenCalledWith("site", { action: "signIn" })
    expect(execute).toHaveBeenCalledWith("site", { action: "clientToken" })
  })

  it("recaptcha Enterprise: enterprise.js and grecaptcha.enterprise", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "recaptcha")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_SITE_KEY", "site")
    vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_ENTERPRISE", "true")
    const execute = vi.fn().mockResolvedValue("ent")
    autoLoadScripts(() => {
      ;(window as Win).grecaptcha = { enterprise: { ready: (cb: () => void) => cb(), execute } }
    })
    await expect(executeCaptcha("signUp")).resolves.toBe("ent")
    expect(document.head.querySelector("script")?.src).toContain("/recaptcha/enterprise.js?render=site")
  })

  it("turnstile: renders an interaction-only widget, resolves with its token and removes it", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "turnstile")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_SITE_KEY", "tsite")
    const remove = vi.fn()
    let options: Record<string, unknown> = {}
    const execute = vi.fn(() => (options.callback as (t: string) => void)("ts-token"))
    autoLoadScripts(() => {
      ;(window as Win).turnstile = {
        render: (_c: HTMLElement, o: Record<string, unknown>) => {
          options = o
          return "w1"
        },
        execute,
        remove,
      }
    })
    await expect(executeCaptcha("forgotPassword")).resolves.toBe("ts-token")
    expect(options).toMatchObject({ sitekey: "tsite", action: "forgotPassword", appearance: "interaction-only", execution: "execute" })
    expect(execute).toHaveBeenCalledWith("w1")
    expect(remove).toHaveBeenCalledWith("w1")
    expect(document.body.children).toHaveLength(0)
    expect(document.head.querySelector("script")?.src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit")
  })

  it("turnstile: an error callback rejects and still cleans up", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_PROVIDER", "turnstile")
    vi.stubEnv("NEXT_PUBLIC_CAPTCHA_SITE_KEY", "tsite")
    const remove = vi.fn()
    autoLoadScripts(() => {
      ;(window as Win).turnstile = {
        render: (_c: HTMLElement, o: Record<string, unknown>) => {
          queueMicrotask(() => (o["error-callback"] as () => void)())
          return "w2"
        },
        execute: vi.fn(),
        remove,
      }
    })
    await expect(executeCaptcha("signIn")).rejects.toThrow()
    expect(remove).toHaveBeenCalledWith("w2")
    expect(document.body.children).toHaveLength(0)
  })
})
