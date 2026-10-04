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
    expect(html).toContain('class="feedback-link"')
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
