import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BannerStack } from "./BannerStack"

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock("@/api/client", () => ({ apiGet: api.get, apiPatch: api.patch }))

describe("admin banner stack", () => {
  beforeEach(() => {
    api.get.mockReset()
    api.patch.mockReset()
    api.get.mockResolvedValue([
      { ID: "new", Title: "Новий банер", Body: "Повідомлення", Dismissible: true, Link: "" },
      { ID: "old", Title: "Старий банер", Body: "Деталі", Dismissible: false, Link: "" },
    ])
    api.patch.mockResolvedValue(undefined)
  })

  it("shows the newest banner and reveals the previous one after dismissal", async () => {
    render(<BannerStack />)
    expect(await screen.findByText("Новий банер")).toBeInTheDocument()
    expect(screen.queryByText("Старий банер")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Закрити банер" }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/banners/new/dismiss", {}))
    expect(await screen.findByText("Старий банер")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Закрити банер" })).not.toBeInTheDocument()
  })
})
