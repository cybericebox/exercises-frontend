import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
const requestElevation = vi.fn()
vi.mock("@/api/exercises/elevation", () => ({ requestElevation: (...args: unknown[]) => requestElevation(...args) }))

import { ResourcesPanel } from "./ResourcesPanel"
import type { Elevation } from "@/api/exercises/elevation"
import type { DeviceOutside, ResourceTotals, VersionResources } from "@/api/exercises/versions"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"

const MIB = 1024 ** 2
const totals = (cpu: number, mib: number, devices: number, blocks = mib / 32): ResourceTotals => ({ CPUMillicores: cpu, MemoryBytes: mib * MIB, Devices: devices, Blocks: blocks })
const outside = (over: Partial<DeviceOutside> = {}): DeviceOutside => ({ VariantID: "v1", DeviceID: "big", Name: "big", Blocks: 64, CPUMillicores: 500, MemoryBytes: 2048 * MIB, Covered: false, AboveCeiling: false, ...over })
const resources = (over: Partial<VersionResources> = {}): VersionResources => ({
  Min: totals(500, 2048, 2), Max: totals(500, 2048, 2), Variants: [{ VariantID: "v1", ...totals(500, 2048, 2) }],
  SpreadPercent: 0, VariantsDiffer: false, Outside: [], ResourceHeavy: false, ...over,
})
const elevation = (over: Partial<Elevation> = {}): Elevation => ({
  ID: "r1", ExerciseID: "ex1", ExerciseName: "Web", VersionID: "v", Status: "pending", Reason: "why", Requested: [{ DeviceID: "big", Name: "big", Blocks: 64, CPUMillicores: 500, MemoryBytes: 2048 * MIB }],
  Approved: [], DecisionNote: "", RequestedByName: "", RequestedAt: "2026-10-02T10:00:00Z", DecidedByName: "", DecidedAt: null, ...over,
})

const flush = () => Promise.resolve(true)
const view = (res: VersionResources | null, el: Elevation | null = null, props: Partial<Parameters<typeof ResourcesPanel>[0]> = {}) => {
  const onRequested = vi.fn()
  return { onRequested, ...render(<ResourcesPanel exerciseId="ex1" resources={res} elevation={el} config={RESOURCES_CONFIG} canRequest canPublish flush={flush} onRequested={onRequested} {...props} />) }
}

describe("ResourcesPanel", () => {
  it("renders nothing until the server has counted the resources", () => {
    expect(view(null).container.firstChild).toBeNull()
  })

  it("shows the totals of the task", () => {
    const { container } = view(resources({ Min: totals(375, 1536, 2, 48), Max: totals(375, 1536, 2, 48) }))
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("375m")
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("1.5Gi")
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("48")
    expect(container.querySelector("[data-frame-issues]")).toBeNull()
  })

  it("shows the range over variants and the server's spread warning", () => {
    const { container } = view(resources({ Min: totals(50, 128, 1), Max: totals(250, 1024, 3), Variants: [{ VariantID: "a", ...totals(50, 128, 1) }, { VariantID: "b", ...totals(250, 1024, 3) }], VariantsDiffer: true, SpreadPercent: 80 }))
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("50m – 250m")
    expect(container.querySelector("[data-variants-differ]")).toBeInTheDocument()
  })

  it("does not warn when the server says the variants are close", () => {
    const { container } = view(resources({ Variants: [{ VariantID: "a", ...totals(250, 1024, 1) }, { VariantID: "b", ...totals(240, 1024, 1) }] }))
    expect(container.querySelector("[data-variants-differ]")).toBeNull()
  })

  it("blocks publishing with a message and offers a request while a device is unapproved", () => {
    const { container } = view(resources({ Outside: [outside()] }))
    expect(container.querySelector("[data-issue-state='needed']")).toBeInTheDocument()
    expect(container.querySelector("[data-publish-blocked]")).toHaveTextContent("exercises.res.publishBlocked")
    expect(screen.getByRole("button", { name: "exercises.res.request" })).toBeInTheDocument()
  })

  it("shows a pending request without offering another one", () => {
    const { container } = view(resources({ Outside: [outside()] }), elevation())
    expect(container.querySelector("[data-issue-state='pending']")).toBeInTheDocument()
    expect(container.querySelector("[data-elevation-status='pending']")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("shows a rejection with the note and allows asking again", () => {
    const rejected = elevation({ Status: "rejected", DecisionNote: "Too much", DecidedAt: "2026-10-02T10:00:00Z" })
    const { container } = view(resources({ Outside: [outside()] }), rejected)
    expect(container.querySelector("[data-issue-state='rejected']")).toBeInTheDocument()
    expect(container.querySelector("[data-elevation-status='rejected']")).toHaveTextContent("Too much")
    expect(screen.getByRole("button", { name: "exercises.res.request" })).toBeInTheDocument()
  })

  it("shows approved values, the raise note and no block", () => {
    const approved = elevation({ Status: "approved", Approved: [{ DeviceID: "big", Name: "big", Blocks: 64, CPUMillicores: 500, MemoryBytes: 2048 * MIB }] })
    const { container } = view(resources({ Outside: [outside({ Covered: true })] }), approved)
    expect(container.querySelector("[data-issue-state='approved']")).toBeInTheDocument()
    expect(container.querySelector("[data-approved]")).toHaveTextContent('exercises.res.approvedLine')
    expect(container.querySelector("[data-approved]")).toHaveTextContent("exercises.res.raiseNote")
    expect(container.querySelector("[data-publish-blocked]")).toBeNull()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("needs a new approval for a raise the server no longer covers", () => {
    const approved = elevation({ Status: "approved", Approved: [{ DeviceID: "big", Name: "big", Blocks: 32, CPUMillicores: 250, MemoryBytes: 2048 * MIB }] })
    const { container } = view(resources({ Outside: [outside({ Covered: false })] }), approved)
    expect(container.querySelector("[data-issue-state='needed']")).toBeInTheDocument()
    expect(container.querySelector("[data-publish-blocked]")).toBeInTheDocument()
  })

  it("does not offer a request above the platform ceiling", () => {
    const { container } = view(resources({ Outside: [outside({ AboveCeiling: true, CPUMillicores: 2000 })] }))
    expect(container.querySelector("[data-ceiling]")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("hides the request while not editing", () => {
    view(resources({ Outside: [outside()] }), null, { canRequest: false })
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("sends the request with the reason only; the server picks the devices", async () => {
    const sent = elevation()
    requestElevation.mockResolvedValue(sent)
    const { onRequested } = view(resources({ Outside: [outside()] }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.request" }))
    const send = screen.getByRole("button", { name: "exercises.res.dialog.send" })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText("exercises.res.dialog.reason"), { target: { value: " Needs a database " } })
    fireEvent.click(send)
    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(sent))
    expect(requestElevation).toHaveBeenCalledWith("ex1", "Needs a database")
  })

  it("lets the author pick a larger block per device in the dialog and writes it to the working copy", async () => {
    requestElevation.mockResolvedValue(elevation())
    const onPickBlock = vi.fn()
    view(resources({ Outside: [outside()] }), null, { onPickBlock })
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.request" }))
    const select = screen.getByRole("button", { name: /exercises.res.dialog.block/ })
    fireEvent.keyDown(select, { key: "ArrowDown" })
    expect(screen.queryByRole("menuitemradio", { name: /exercises.res.preset.large/ })).toBeNull()
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /exercises.res.preset.max/ }))
    expect(onPickBlock).toHaveBeenCalledWith(expect.objectContaining({ DeviceID: "big" }), "max")
  })

  it("shows a failed request inside the dialog", async () => {
    requestElevation.mockRejectedValue(new Error("boom"))
    view(resources({ Outside: [outside()] }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.request" }))
    fireEvent.change(screen.getByLabelText("exercises.res.dialog.reason"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.dialog.send" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
