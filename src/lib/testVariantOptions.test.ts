import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { testVariantOptions } from "./testVariantOptions"

const stat = { Topology: { Devices: [] } }
const lab = { Topology: { Devices: [{ ID: "d" }] } }
const label = (n: number) => `V${n}`

describe("testVariantOptions", () => {
  it("keeps static variants enabled without laboratories", () => {
    const options = testVariantOptions([stat, stat], { laboratories: false, infraAllowed: true }, label)
    expect(options.map((o) => o.disabled)).toEqual([false, false])
  })

  it("disables only lab variants without laboratories, with the reason", () => {
    const options = testVariantOptions([stat, lab], { laboratories: false, infraAllowed: true }, label)
    expect(options[0]).toMatchObject({ index: 0, label: "V1", disabled: false })
    expect(options[0].reason).toBeUndefined()
    expect(options[1]).toMatchObject({ index: 1, disabled: true, reason: "admin.exPage.action.testNoPlatform" })
  })

  it("disables lab variants while laboratories are unknown or infra is blocked", () => {
    expect(testVariantOptions([lab], { laboratories: null, infraAllowed: true }, label)[0].disabled).toBe(true)
    const blocked = testVariantOptions([stat, lab], { laboratories: true, infraAllowed: false }, label)
    expect(blocked.map((o) => o.disabled)).toEqual([false, true])
    expect(blocked[1].reason).toBe("exercises.infra.blocked")
  })

  it("enables lab variants when everything is available", () => {
    expect(testVariantOptions([lab], { laboratories: true, infraAllowed: true }, label)[0].disabled).toBe(false)
  })
})
