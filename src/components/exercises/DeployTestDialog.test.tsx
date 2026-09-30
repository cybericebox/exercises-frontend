import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { DeployTestDialog } from "./DeployTestDialog"
import * as deployApi from "@/api/exercises/deploy"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
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

  it("shows the links only after the web session is open, with a loader before", async () => {
    let resolveSession: (v: { ExpiresAt: string }) => void = () => {}
    mocked.deployVariant.mockResolvedValue({ DeployID: "d1", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true, Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1x.example.com" }] })
    mocked.openDeploySession.mockReturnValue(new Promise((r) => { resolveSession = r }))

    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

    expect(await screen.findByText("admin.exDeploy.sessionOpening", { selector: ".loading-area-label" })).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    await act(async () => resolveSession({ ExpiresAt: "2026-10-01T00:00:00Z" }))
    expect(await screen.findByRole("link")).toHaveAttribute("href", "https://web-1x.example.com")
  })

  it("shows a centered load error with a retry when the session cannot be opened", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d1", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true, VPNConfig: "cfg", Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1x.example.com" }] })
    mocked.openDeploySession.mockRejectedValueOnce(new Error("409")).mockResolvedValueOnce({ ExpiresAt: "2026-10-01T00:00:00Z" })

    render(<DeployTestDialog open onClose={vi.fn()} exerciseId="exercise" versionId="version" variantId="variant" tasks={[]} />)

    expect(await screen.findByText("admin.exDeploy.sessionFailed")).toBeInTheDocument()
    expect(screen.getByDisplayValue("cfg")).toBeInTheDocument() // the VPN config stays available
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(await screen.findByRole("link")).toBeInTheDocument()
  })
})
