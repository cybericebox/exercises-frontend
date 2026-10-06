import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({ usePathname: () => "/sign-in" }))

import { FeedbackLink } from "./FeedbackLink"
import { feedbackHref } from "@/lib/feedback"

describe("FeedbackLink", () => {
  it("is a plain mailto anchor present in the server-rendered HTML", () => {
    const html = renderToStaticMarkup(<FeedbackLink />)
    expect(html).toContain('href="mailto:')
    expect(html).toContain("subject=")
    expect(html).toContain("%2Fsign-in")
  })

  it("passes className and children through, and the stylesheet has no fixed position", () => {
    const html = renderToStaticMarkup(<FeedbackLink className="x"><b>y</b></FeedbackLink>)
    expect(html).toContain('class="x"')
    expect(html).toContain("<b>y</b>")
    const css = readFileSync(join(__dirname, "feedback-link.css"), "utf8")
    expect(css).not.toMatch(/position\s*:\s*fixed/)
  })

  it("is an account menu item, not a root layout element", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8")
    expect(read("components/shell/TopBar.tsx")).toContain("<FeedbackMenuItem />")
    expect(read("app/layout.tsx")).not.toContain("FeedbackLink")
  })

  it("names the app in the subject, with no no-break spaces", () => {
    const html = renderToStaticMarkup(<FeedbackLink app={"Cyber\u00A0ICE\u00A0Box Test"} />)
    expect(html).toContain(encodeURIComponent("Cyber ICE Box Test"))
    expect(html).not.toContain("%C2%A0")
  })

  it("fails without the support mailbox env", () => {
    const prev = process.env.NEXT_PUBLIC_SUPPORT_EMAIL
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL
    try {
      expect(() => feedbackHref("x")).toThrow("NEXT_PUBLIC_SUPPORT_EMAIL")
    } finally {
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL = prev
    }
  })
})
