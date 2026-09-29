import { describe, expect, it, vi } from "vitest"

vi.mock("@/api/client")
import { apiGet } from "@/api/client"
import { getFlagPolicy } from "./flagPolicy"

describe("getFlagPolicy", () => {
  it("reads policy from the dedicated authorized route", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ RandomHexLength: 24, RandomBits: 96, WarningBits: 18 })
    await expect(getFlagPolicy()).resolves.toEqual({ RandomHexLength: 24, RandomBits: 96, WarningBits: 18 })
    expect(apiGet).toHaveBeenCalledWith("/api/exercises/flag-policy")
  })
})
