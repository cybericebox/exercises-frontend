import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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
})
