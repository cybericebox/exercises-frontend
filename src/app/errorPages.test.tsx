import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import uk from "../../messages/uk.json"
import en from "../../messages/en.json"
import ErrorPage from "./error"
import GlobalError from "./global-error"
import NotFound from "./not-found"

// next/font needs the Next compiler
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "font-sans" } }))
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "font-mono" } }))

const noop = () => {}
const error = Object.assign(new Error("secret stack detail"), { digest: "d1" })

describe("error pages", () => {
  it("error boundary renders the i18n texts and both actions, no error details", () => {
    const html = renderToStaticMarkup(<ErrorPage error={error} retry={noop} />)
    expect(html).toContain("Не вдалося завантажити сторінку")
    expect(html).toContain(uk["error.page.body"])
    expect(html).toContain(">Оновити<")
    expect(html).toContain(">Назад<")
    expect(html).not.toContain("secret stack detail")
  })

  it("global error renders its own document with the same texts", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} retry={noop} />)
    expect(html).toMatch(/^<html lang="uk"/)
    expect(html).toContain("<title>Не вдалося завантажити сторінку</title>")
    expect(html).toContain(">Оновити<")
    expect(html).toContain('href="mailto:')
    expect(html).not.toContain("secret stack detail")
  })

  it("not-found renders the i18n texts and a home link", () => {
    const html = renderToStaticMarkup(<NotFound />)
    expect(html).toContain("Сторінку не знайдено")
    expect(html).toContain(uk["error.notFoundDescription"])
    expect(html).toContain(uk["error.goHome"])
  })

  it("the texts exist in both catalogs", () => {
    for (const key of ["error.page.title", "error.page.body", "error.page.reload", "error.page.back", "error.notFound"] as const) {
      expect(uk[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
