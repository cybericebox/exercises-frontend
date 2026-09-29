import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/consent/Analytics", () => ({ Analytics: () => null }))
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "" } }))
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "" } }))

import en from "../../messages/en.json"
import uk from "../../messages/uk.json"
import { metadata } from "./layout"

describe("app metadata", () => {
  it("renders the Ukrainian title and description from i18n", () => {
    expect(metadata.title).toBe("Каталог завдань · Cyber ICE Box")
    expect(metadata.description).toBe("Каталог завдань Cyber ICE Box: створення, версії та доступ до завдань для подій")
  })

  it("keeps English counterparts", () => {
    expect(en["exercises.meta.title"]).toBeTruthy()
    expect(en["exercises.meta.description"]).toBeTruthy()
    expect(uk["exercises.meta.title"]).toBe(metadata.title)
  })
})
