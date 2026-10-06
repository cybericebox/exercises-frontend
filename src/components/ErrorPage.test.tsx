import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import uk from "../../messages/uk.json"
import en from "../../messages/en.json"
import { ErrorPage } from "./ErrorPage"

describe("ErrorPage", () => {
  it("page mode: centred column with the footer (crest, brand, home, feedback)", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="page" status={404} />)
    expect(html).toContain("ib-error--page")
    expect(html).toContain(">404<")
    expect(html).toContain("Сторінку не знайдено")
    expect(html).toContain(uk["error.notFoundDescription"])
    expect(html).toContain("<footer")
    expect(html).toContain("ib-error__brand")
    expect(html).toContain(">Надіслати відгук<")
    expect(html).toContain('href="mailto:')
    expect(html).toContain(">На головну<")
    expect(html).toContain(">Назад<")
  })

  it("block mode: only the column, no footer and no crest", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="block" status={404} title="Шаблон не знайдено" body="Немає такого." />)
    expect(html).toContain("ib-error--block")
    expect(html).toContain("Шаблон не знайдено")
    expect(html).toContain("Немає такого.")
    expect(html).not.toContain("<footer")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("ib-error--page")
  })

  it("shows the code line only for an error that carries a platform code", () => {
    const withCode = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={{ code: 50310 }} onRetry={() => {}} />)
    expect(withCode).toContain("ib-error__ref")
    expect(withCode).toContain("Код помилки: 50310")
    expect(withCode).toContain("Не вдалося завантажити сторінку")
    expect(withCode).toContain(">Спробувати ще раз<")
    const without = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={new Error("secret stack detail")} onRetry={() => {}} />)
    expect(without).not.toContain("ib-error__ref")
    expect(without).not.toContain("secret stack detail")
  })

  it("has the texts in both catalogs", () => {
    for (const key of ["error.notFound", "error.notFoundDescription", "error.goHome", "error.page.back", "error.page.links", "error.load.retry", "error.load.code"] as const) {
      expect(uk[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
