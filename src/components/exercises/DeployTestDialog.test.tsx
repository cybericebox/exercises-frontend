import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { DeployTestDialog } from "./DeployTestDialog"
import * as deployApi from "@/api/exercises/deploy"
import { ApiError } from "@/api/client"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key) }))
vi.mock("@/api/exercises/deploy")

const mocked = vi.mocked(deployApi)

describe("DeployTestDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.destroyDeploy.mockResolvedValue(undefined)
  })

  it("shows a failed deployment as an error instead of a provisioning spinner", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "failed-deploy", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Failed", Ready: false })

    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

    expect(await screen.findByText("admin.exDeploy.failed")).toBeInTheDocument()
    expect(screen.queryByText("admin.exDeploy.provisioning")).not.toBeInTheDocument()
  })

  it("shows the mapped reason when the deploy request fails", async () => {
    mocked.deployVariant.mockRejectedValue(new ApiError(409, { Status: { Code: 70958, Message: "The variant has no laboratory to test" } }, "x", undefined, 70958))

    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent('admin.exDeploy.failedReason {"reason":"admin.ex.err.testDeployNoLab"}')
    expect(alert).toHaveTextContent("70958")
  })

  it("reopens a running deploy: polls it, lists its tasks and starts nothing", async () => {
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]}
      attach={{ deployId: "running", tasks: [{ TaskID: "t1", Name: "Login" }] }} />)

    expect(await screen.findByText("Login")).toBeInTheDocument()
    expect(mocked.deployVariant).not.toHaveBeenCalled()
    expect(mocked.deployStatus).toHaveBeenCalledWith("running")
  })

  it("checks a found flag per task and shows correct or wrong without ever showing a value", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d3", Lab: "lab", Tasks: [
      { TaskID: "t1", Name: "Login" },
      { TaskID: "t2", Name: "Root" },
    ] })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    mocked.checkDeployFlag.mockImplementation(async (_group, _task, flag) => ({ Correct: flag === "ICE{right}" }))

    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

    const input = await screen.findByLabelText('admin.exDeploy.flagInput {"name":"Login"}')
    expect(screen.getByText("Root")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: 'admin.exDeploy.checkFlag {"name":"Login"}' })).toBeDisabled()

    fireEvent.change(input, { target: { value: "ICE{nope}" } })
    fireEvent.click(screen.getByRole("button", { name: 'admin.exDeploy.checkFlag {"name":"Login"}' }))
    expect(await screen.findByText(/admin.exDeploy.wrong/)).toBeInTheDocument()
    expect(mocked.checkDeployFlag).toHaveBeenCalledWith("d3", "t1", "ICE{nope}")

    fireEvent.change(input, { target: { value: "ICE{right}" } })
    expect(screen.queryByText(/admin.exDeploy.wrong/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: 'admin.exDeploy.checkFlag {"name":"Login"}' }))
    expect(await screen.findByText(/admin.exDeploy.correct/)).toBeInTheDocument()
    expect(screen.queryByText("admin.exDeploy.copy")).not.toBeInTheDocument()
  })

  it("says so when the check request fails", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d4", Lab: "lab", Tasks: [{ TaskID: "t1", Name: "Login" }] })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    mocked.checkDeployFlag.mockRejectedValue(new Error("down"))
    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)
    fireEvent.change(await screen.findByLabelText('admin.exDeploy.flagInput {"name":"Login"}'), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: 'admin.exDeploy.checkFlag {"name":"Login"}' }))
    expect(await screen.findByText("admin.exDeploy.checkFailed")).toBeInTheDocument()
  })

  it("renders a link-form IP placeholder as a real link", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d2", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true, VPNCIDR: "10.128.1.0/24" })
    const tasks = [{ Name: "T", Placeholders: [
      { Kind: "ip", IPReference: "vpn", LastOctet: 5, AsLink: true, Scheme: "https", Port: 8443, Path: "/x" },
      { Kind: "ip", IPReference: "vpn", LastOctet: 6 },
    ] }] as never
    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={tasks} />)

    const link = await screen.findByRole("link", { name: "https://10.128.1.5:8443/x" })
    expect(link).toHaveAttribute("href", "https://10.128.1.5:8443/x")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText("10.128.1.6")).not.toHaveAttribute("href")
  })

  describe("web devices", () => {
    const ready = { Phase: "Ready", Ready: true, VPNConfig: "cfg", Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1x.example.com" }] }
    let tab: { location: { href: string }; close: ReturnType<typeof vi.fn>; opener: unknown }

    beforeEach(() => {
      tab = { location: { href: "about:blank" }, close: vi.fn(), opener: "self" }
      vi.stubGlobal("open", vi.fn(() => tab))
      mocked.deployVariant.mockResolvedValue({ DeployID: "d1", Lab: "lab" })
      mocked.deployStatus.mockResolvedValue(ready)
    })
    afterEach(() => vi.unstubAllGlobals())

    it("requests nothing until a device is opened, then opens its fresh link in a new tab", async () => {
      let resolveLink: (v: deployApi.DeployLink) => void = () => {}
      mocked.openDeployLink.mockReturnValue(new Promise((r) => { resolveLink = r }))
      render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

      const open = await screen.findByRole("button", { name: "admin.exDeploy.open" })
      expect(mocked.openDeployLink).not.toHaveBeenCalled()
      fireEvent.click(open)
      const busy = screen.getByRole("button", { name: /admin\.exDeploy\.open/ })
      expect(busy).toBeDisabled() // busy while the link is fetched
      expect(busy).toHaveAttribute("aria-busy", "true")
      expect(mocked.openDeployLink).toHaveBeenCalledWith("d1", "web", 443)
      await act(async () => resolveLink({ URL: "https://web-1x.example.com/_auth?t=x", ExpiresAt: "2026-10-01T00:00:00Z" }))
      expect(tab.location.href).toBe("https://web-1x.example.com/_auth?t=x")
      expect(screen.getByRole("button", { name: "admin.exDeploy.open" })).toBeEnabled()
    })

    it("shows a centered load error with a retry when the link cannot be fetched", async () => {
      mocked.openDeployLink.mockRejectedValueOnce(new Error("409")).mockResolvedValueOnce({ URL: "https://web-1x.example.com/_auth?t=y", ExpiresAt: "x" })
      render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

      fireEvent.click(await screen.findByRole("button", { name: "admin.exDeploy.open" }))
      expect(await screen.findByText("admin.exDeploy.linkFailed")).toBeInTheDocument()
      expect(screen.getByDisplayValue("cfg")).toBeInTheDocument() // the VPN config stays available
      fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
      await waitFor(() => expect(tab.location.href).toBe("https://web-1x.example.com/_auth?t=y"))
    })
  })
})
