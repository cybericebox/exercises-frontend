import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/api/exercises/archive", () => ({ getImportExampleDocument: vi.fn(() => Promise.resolve({ Yaml: "schema: y", Json: "{}" })) }))

import { llmDigest } from "@/content/guide/llm"
import { GUIDE_LOADERS, GUIDE_ORDER, guideHref, type GuidePageSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"
import { GuidePage } from "./GuidePage"

async function renderPage(slug: GuidePageSlug) {
  const { html, lead } = await GUIDE_LOADERS[slug]()
  render(<GuidePage slug={slug} html={html} lead={lead} llmText={slug === "index" ? llmDigest : undefined} />)
  return { html, lead }
}

describe("guide pages", () => {
  beforeEach(() => { push.mockClear(); vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it.each(GUIDE_ORDER)("renders %s with title, lead, content, nav and pager", async (slug) => {
    const { html, lead } = await renderPage(slug)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t(`exercises.guide.title.${slug}`))
    if (lead) expect(screen.getByText(lead.replace(/<[^>]+>/g, ""))).toBeInTheDocument()
    // a prose marker: the first heading or paragraph of the content is on the page
    const marker = />([^<>]{20,})</.exec(html)![1].slice(0, 30)
    expect(document.body.textContent).toContain(marker)
    if (/<table/.test(html)) expect(document.querySelector(".g-tablewrap table")).not.toBeNull()

    const nav = screen.getByRole("navigation", { name: t("exercises.guide.navLabel") })
    const links = within(nav).getAllByRole("link")
    expect(links).toHaveLength(12)
    const current = links.filter((link) => link.getAttribute("aria-current") === "page")
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute("href")?.replace(/(.)\/$/, "$1")).toBe(guideHref(slug).replace(/(.)\/$/, "$1"))

    const pager = screen.queryByRole("navigation", { name: t("exercises.guide.pagerLabel") })
    if (slug === "index") expect(pager).toBeNull()
    else expect(pager).not.toBeNull()
    expect(screen.queryByRole("button", { name: t("exercises.guide.copyLlm") }) !== null).toBe(slug === "index")
  })

  it("links the pager to the neighbours (overview before the first page, none after the last)", async () => {
    await renderPage("zavdannia")
    const pager = screen.getByRole("navigation", { name: t("exercises.guide.pagerLabel") })
    const hrefs = within(pager).getAllByRole("link").map((link) => link.getAttribute("href")?.replace(/(.)\/$/, "$1"))
    expect(hrefs).toEqual(["/guide", "/guide/variant"])
    cleanup()
    await renderPage("rekomendatsii")
    expect(within(screen.getByRole("navigation", { name: t("exercises.guide.pagerLabel") })).getAllByRole("link")).toHaveLength(1)
  })

  it("copies the LLM digest from the overview", async () => {
    await renderPage("index")
    fireEvent.click(screen.getByRole("button", { name: t("exercises.guide.copyLlm") }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(llmDigest))
    expect(await screen.findByText(t("exercises.guide.copied", {}), { selector: ".g-copy__now" })).toBeInTheDocument()
  })

  it("renders the examples component in place of the marker on the archive page", async () => {
    await renderPage("arkhiv")
    expect(await screen.findByText("schema: y")).toBeInTheDocument()
    expect(document.querySelector("[data-guide-examples]")).toBeNull()
  })

  it("sends clicks on internal guide links through the router", async () => {
    await renderPage("index")
    const link = document.querySelector<HTMLAnchorElement>('.g-prose a[href^="/guide/"]')!
    fireEvent.click(link)
    expect(push).toHaveBeenCalledWith(link.getAttribute("href"))
    push.mockClear()
    fireEvent.click(link, { ctrlKey: true })
    expect(push).not.toHaveBeenCalled()
  })
})
