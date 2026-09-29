import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { openConsentSettings } from "@/lib/consent"
import { ConsentBanner } from "./ConsentBanner"

const clear = () => { document.cookie = "cib_consent=; path=/; max-age=0" }
const banner = () => screen.getByRole("region", { name: "Згода на використання файлів cookie" })
const panel = () => screen.getByRole("dialog", { name: "Налаштування файлів cookie" })
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }))

describe("ConsentBanner", () => {
  afterEach(clear)

  it("asks with a general line, the policy link, «Налаштувати» and «Прийняти всі»", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="https://cybericebox.com/cookies" />)
    expect(banner()).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Політика файлів cookie (відкриється в новій вкладці)" })).toHaveAttribute("href", "https://cybericebox.com/cookies")
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Налаштувати", "Прийняти всі"])
  })

  it("is hidden once a choice exists", () => {
    document.cookie = "cib_consent=analytics:denied; path=/"
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("is hidden when GA is not configured", () => {
    render(<ConsentBanner gaId="" policyHref="/cookies" />)
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("accept all grants analytics and hides", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    fireEvent.keyDown(banner(), { key: "Escape" })
    expect(banner()).toBeInTheDocument()
    click("Прийняти всі")
    expect(document.cookie).toContain("cib_consent=analytics:granted")
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("customize: necessary is locked on, analytics starts off; accept selected keeps it off", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    click("Налаштувати")
    expect(panel()).toHaveFocus()
    const [necessary, analytics] = screen.getAllByRole("switch")
    expect(necessary).toBeChecked()
    expect(necessary).toBeDisabled()
    expect(analytics).not.toBeChecked()
    click("Прийняти вибрані")
    expect(document.cookie).toContain("cib_consent=analytics:denied")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("customize: accept selected with analytics on grants it", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    click("Налаштувати")
    fireEvent.click(screen.getByRole("switch", { name: "Аналітика" }))
    click("Прийняти вибрані")
    expect(document.cookie).toContain("cib_consent=analytics:granted")
  })

  it("reject all from the panel stores denied; Esc in the panel steps back without consent", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    click("Налаштувати")
    fireEvent.keyDown(panel(), { key: "Escape" })
    expect(banner()).toBeInTheDocument()
    expect(document.cookie).not.toContain("cib_consent")
    click("Налаштувати")
    click("Відхилити всі")
    expect(document.cookie).toContain("cib_consent=analytics:denied")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("«Налаштування файлів cookie» opens the panel with focus inside; Esc closes it unchanged", () => {
    document.cookie = "cib_consent=analytics:granted; path=/"
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    act(() => openConsentSettings())
    expect(panel()).toHaveFocus()
    expect(screen.getByRole("switch", { name: "Аналітика" })).toBeChecked()
    fireEvent.keyDown(panel(), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.cookie).toContain("cib_consent=analytics:granted")
  })

  it("the policy link opens a new tab and keeps the panel and its unsaved toggles", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    click("Налаштувати")
    fireEvent.click(screen.getByRole("switch", { name: "Аналітика" }))
    const link = screen.getByRole("link", { name: "Політика файлів cookie (відкриється в новій вкладці)" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    fireEvent.click(link)
    expect(panel()).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Аналітика" })).toBeChecked()
    expect(document.cookie).not.toContain("cib_consent")
  })
})

describe("ConsentBanner without GA", () => {
  afterEach(clear)

  it("never asks on its own but opens the panel on request", () => {
    render(<ConsentBanner policyHref="/cookies" />)
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
    act(() => openConsentSettings())
    expect(panel()).toBeInTheDocument()
  })
})
