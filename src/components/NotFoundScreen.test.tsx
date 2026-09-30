import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import uk from "../../messages/uk.json"
import en from "../../messages/en.json"
import { NotFoundScreen } from "./NotFoundScreen"

describe("NotFoundScreen", () => {
  it("renders the wordmark, the title, one line and both actions", () => {
    const html = renderToStaticMarkup(<NotFoundScreen />)
    expect(html).toContain("Сторінку не знайдено")
    expect(html).toContain("Сторінка, яку ви шукаєте, не існує або її перенесли.")
    expect(html).toContain("ICE")
    expect(html).toContain(">На головну<")
    expect(html).toContain(">Назад<")
    expect(html).toContain("min-h-screen")
    expect(html).toContain(`href="/"`)
  })

  it("takes a context title and body, and the block variant is not full page", () => {
    const html = renderToStaticMarkup(<NotFoundScreen block title="Шаблон не знайдено" body="Немає такого." />)
    expect(html).toContain("Шаблон не знайдено")
    expect(html).toContain("Немає такого.")
    expect(html).toContain(">На головну<")
    expect(html).not.toContain("min-h-screen")
  })

  it("has the texts in both catalogs", () => {
    for (const key of ["error.notFound", "error.notFoundDescription", "error.goHome", "error.page.back"] as const) {
      expect(uk[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
