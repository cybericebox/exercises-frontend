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
    const withCode = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={{ status: 500, code: 50310 }} onRetry={() => {}} />)
    expect(withCode).toContain("ib-error__ref")
    expect(withCode).toContain("Код помилки: 50310")
    expect(withCode).toContain("Не вдалося завантажити сторінку")
    expect(withCode).toContain(">Спробувати ще раз<")
    const without = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={new Error("secret stack detail")} onRetry={() => {}} />)
    expect(without).not.toContain("ib-error__ref")
    expect(without).not.toContain("secret stack detail")
  })

  it("an API error with a request id shows «{code}-{rid8}», the reported text and the report link", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={{ status: 500, code: 50310, requestId: "3f9a1c2e-1111-2222-3333-444455556666" }} onRetry={() => {}} />)
    expect(html).toContain("Номер звернення: 50310-3f9a1c2e")
    expect(html).toContain(uk["error.page.reported"])
    expect(html).toContain('aria-label="Скопіювати номер звернення"')
    expect(html).toContain(">Повідомити деталі<")
    expect(html).toContain("subject=" + encodeURIComponent("Помилка 50310-3f9a1c2e"))
    expect(html).toContain(encodeURIComponent("Що ви робили?"))
  })

  it("an API error found on `cause` counts as an API error", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={new Error("x", { cause: { status: 503, requestId: "abcdef0123456789" } })} />)
    expect(html).toContain("Номер звернення: 503-abcdef01")
  })

  it("a frontend crash has no reported line, no number, only the report link with the message", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="block" status={500} error={new Error("boom ".repeat(100))} onRetry={() => {}} />)
    expect(html).toContain(uk["error.page.body"])
    expect(html).not.toContain(uk["error.page.reported"])
    expect(html).not.toContain("Номер звернення")
    expect(html).toContain(">Повідомити деталі<")
    expect(html).toContain(encodeURIComponent("Повідомлення: boom"))
    expect(decodeURIComponent(html.match(/body=([^"&]*)/)![1])).not.toContain("boom ".repeat(50))
  })

  it("404 has neither the number nor the report link", () => {
    const html = renderToStaticMarkup(<ErrorPage mode="block" status={404} error={{ status: 404, requestId: "abcdef0123456789" }} />)
    expect(html).not.toContain("Номер звернення")
    expect(html).not.toContain("Повідомити деталі")
  })

  it("has the texts in both catalogs", () => {
    for (const key of ["error.notFound", "error.notFoundDescription", "error.goHome", "error.page.back", "error.page.links", "error.load.retry", "error.load.code"] as const) {
      expect(uk[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
