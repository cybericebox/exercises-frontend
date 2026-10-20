// @vitest-environment jsdom
import {StrictMode} from "react"
import {afterEach} from "vitest"
import {cleanup, fireEvent, render, screen} from "@testing-library/react"
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
    expect(html).toContain(">Спробувати ще раз<")
    expect(html).toContain(">Назад<")
    expect(html).toContain("ib-error--block")
    expect(html).not.toContain("<footer")
    expect(html).not.toContain("secret stack detail")
  })

  it("global error renders its own document with the same texts", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} retry={noop} />)
    expect(html).toMatch(/^<html lang="uk"/)
    expect(html).toContain("<title>Не вдалося завантажити сторінку</title>")
    expect(html).toContain(">Спробувати ще раз<")
    expect(html).toContain("ib-error--page")
    expect(html).toContain('href="mailto:')
    expect(html).not.toContain("secret stack detail")
  })

  it("not-found renders the i18n texts and a home link", () => {
    const html = renderToStaticMarkup(<NotFound />)
    expect(html).toContain("Сторінку не знайдено")
    expect(html).toContain(uk["error.notFoundDescription"])
    expect(html).toContain(uk["error.goHome"])
    expect(html).toContain("ib-error--block")
  })

  it("the texts exist in both catalogs", () => {
    for (const key of ["error.page.title", "error.page.body", "error.page.reload", "error.page.back", "error.notFound"] as const) {
      expect(uk[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})


const recovery = vi.hoisted(() => ({recover: vi.fn(() => false), retry: (_error: unknown, fallback: () => void) => fallback()}))
vi.mock("@/lib/chunkRecovery", () => ({installChunkRecovery: () => recovery}))

afterEach(() => { cleanup(); vi.restoreAllMocks(); recovery.recover.mockClear() })

describe("chunk failure boundaries", () => {
  it.each(["segment", "global"] as const)("keeps the shared %s screen and manual retry after automatic recovery is exhausted", kind => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const error = Object.assign(new Error("Loading chunk 42 failed."), {name: "ChunkLoadError"})
    const retry = vi.fn()
    const Screen = kind === "segment" ? ErrorPage : GlobalError
    render(<StrictMode><Screen error={error} retry={retry} /></StrictMode>)
    expect(recovery.recover).toHaveBeenCalledWith(error)
    expect(screen.getByText("Не вдалося завантажити сторінку")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Спробувати ще раз"}))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Loading chunk 42 failed.")).toBeNull()
  })
})
