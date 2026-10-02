import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
const requestElevation = vi.fn()
vi.mock("@/api/exercises/elevation", () => ({ requestElevation: (...args: unknown[]) => requestElevation(...args) }))

import { ResourcesPanel } from "./ResourcesPanel"
import type { ResourceGate } from "./useResourceGate"
import type { Elevation } from "@/api/exercises/elevation"
import { frameIssues, taskTotals, variantsDiffer, publishBlocked } from "@/lib/deviceResources"

const same = (cpu: string, memory: string) => ({ CPURequest: cpu, CPULimit: cpu, MemoryRequest: memory, MemoryLimit: memory })
const dev = (id: string, resources: ReturnType<typeof same>) => ({ ID: id, Name: id, Type: "container", Resources: resources })
const variant = (...devices: ReturnType<typeof dev>[]) => ({ Topology: { Devices: devices } })
const none: Elevation = { Status: "none", Reason: "", Requested: [], Approved: [], ReviewNote: "", RequestedAt: null, ReviewedAt: null }

function gateFor(variants: ReturnType<typeof variant>[], elevation: Elevation | null = none, extra: Partial<ResourceGate> = {}): ResourceGate {
  const issues = frameIssues(variants, elevation?.Approved ?? [])
  const totals = taskTotals(variants)
  return { elevation, loading: false, error: null, reload: vi.fn(), setElevation: vi.fn(), totals, differ: variantsDiffer(totals), issues, blocked: publishBlocked(issues), ...extra }
}

const big = variant(dev("big", same("500m", "2Gi")))
const flush = () => Promise.resolve(true)
const view = (gate: ResourceGate, props: Partial<Parameters<typeof ResourcesPanel>[0]> = {}) =>
  render(<ResourcesPanel exerciseId="ex1" gate={gate} canRequest canPublish flush={flush} {...props} />)

describe("ResourcesPanel", () => {
  it("shows the totals of the task", () => {
    const { container } = view(gateFor([variant(dev("a", same("125m", "512Mi")), dev("b", same("250m", "1Gi")))]))
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("375m")
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("1.5Gi")
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("2")
    expect(container.querySelector("[data-frame-issues]")).toBeNull()
  })

  it("shows the range over variants and warns when they differ a lot", () => {
    const { container } = view(gateFor([variant(dev("a", same("250m", "1Gi"))), variant(dev("a", same("50m", "128Mi")))]))
    expect(container.querySelector("[data-resource-totals]")).toHaveTextContent("50m – 250m")
    expect(container.querySelector("[data-variants-differ]")).toBeInTheDocument()
  })

  it("does not warn for similar variants", () => {
    const { container } = view(gateFor([variant(dev("a", same("250m", "1Gi"))), variant(dev("a", same("240m", "1Gi")))]))
    expect(container.querySelector("[data-variants-differ]")).toBeNull()
  })

  it("blocks publishing with a message and offers a request while a device is unapproved", () => {
    const { container } = view(gateFor([big]))
    expect(container.querySelector("[data-issue-state='needed']")).toBeInTheDocument()
    expect(container.querySelector("[data-publish-blocked]")).toHaveTextContent("exercises.res.publishBlocked")
    expect(screen.getByRole("button", { name: "exercises.res.request" })).toBeInTheDocument()
  })

  it("shows a pending request without offering another one", () => {
    const pending: Elevation = { ...none, Status: "pending", Reason: "why", RequestedAt: "2026-10-02T10:00:00Z", Requested: [{ DeviceID: "big", CPU: "500m", Memory: "2048Mi" }] }
    const { container } = view(gateFor([big], pending))
    expect(container.querySelector("[data-issue-state='pending']")).toBeInTheDocument()
    expect(container.querySelector("[data-elevation-status='pending']")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("shows a rejection with the note and allows asking again", () => {
    const rejected: Elevation = { ...none, Status: "rejected", ReviewNote: "Too much", ReviewedAt: "2026-10-02T10:00:00Z", Requested: [{ DeviceID: "big", CPU: "500m", Memory: "2048Mi" }] }
    const { container } = view(gateFor([big], rejected))
    expect(container.querySelector("[data-issue-state='rejected']")).toBeInTheDocument()
    expect(container.querySelector("[data-elevation-status='rejected']")).toHaveTextContent("Too much")
    expect(screen.getByRole("button", { name: "exercises.res.request" })).toBeInTheDocument()
  })

  it("shows approved values, the raise note and no block", () => {
    const approved: Elevation = { ...none, Status: "approved", Approved: [{ DeviceID: "big", DeviceName: "big", CPU: "500m", Memory: "2Gi" }] }
    const { container } = view(gateFor([big], approved))
    expect(container.querySelector("[data-issue-state='approved']")).toBeInTheDocument()
    expect(container.querySelector("[data-approved]")).toHaveTextContent("500m · 2Gi")
    expect(container.querySelector("[data-approved]")).toHaveTextContent("exercises.res.raiseNote")
    expect(container.querySelector("[data-publish-blocked]")).toBeNull()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("needs a new approval after a raise above the approved values", () => {
    const approved: Elevation = { ...none, Status: "approved", Approved: [{ DeviceID: "big", CPU: "400m", Memory: "2Gi" }] }
    const { container } = view(gateFor([big], approved))
    expect(container.querySelector("[data-issue-state='needed']")).toBeInTheDocument()
    expect(container.querySelector("[data-publish-blocked]")).toBeInTheDocument()
  })

  it("does not offer a request above the platform ceiling", () => {
    const { container } = view(gateFor([variant(dev("huge", same("2", "8Gi")))]))
    expect(container.querySelector("[data-ceiling]")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("hides the request while not editing", () => {
    view(gateFor([big]), { canRequest: false })
    expect(screen.queryByRole("button", { name: "exercises.res.request" })).toBeNull()
  })

  it("sends the request with the reason and the requested values", async () => {
    const gate = gateFor([big])
    requestElevation.mockResolvedValue({ ...none, Status: "pending" })
    view(gate)
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.request" }))
    const send = screen.getByRole("button", { name: "exercises.res.dialog.send" })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText("exercises.res.dialog.reason"), { target: { value: " Needs a database " } })
    fireEvent.click(send)
    await waitFor(() => expect(gate.setElevation).toHaveBeenCalled())
    expect(requestElevation).toHaveBeenCalledWith("ex1", { Reason: "Needs a database", Devices: [{ DeviceID: "big", CPU: "500m", Memory: "2048Mi" }] })
  })

  it("shows a failed request inside the dialog", async () => {
    requestElevation.mockRejectedValue(new Error("boom"))
    view(gateFor([big]))
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.request" }))
    fireEvent.change(screen.getByLabelText("exercises.res.dialog.reason"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "exercises.res.dialog.send" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })

  it("centers a loader and a load error in the block", () => {
    const loading = view(gateFor([big], null, { loading: true }))
    expect(loading.container.querySelector(".loading-area")).toBeInTheDocument()
    loading.unmount()
    const retry = vi.fn()
    view(gateFor([big], null, { error: new Error("x"), reload: retry }))
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(retry).toHaveBeenCalled()
  })
})
