import { describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { useEffect } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/elevation", () => ({ requestElevation: vi.fn() }))

import { TopologyResourcesPanel, hasAnyDevice } from "./TopologyResourcesPanel"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { VersionResources } from "@/api/exercises/versions"

const zero = { CPUMillicores: 0, MemoryBytes: 0, Devices: 0, Blocks: 0 }
const resources: VersionResources = { Min: zero, Max: zero, Variants: [], SpreadPercent: 0, VariantsDiffer: false, Outside: [], ResourceHeavy: false }
const variant = (devices: number) => ({ ID: "v1", Topology: { Devices: Array.from({ length: devices }, (_, i) => ({ ID: `d${i}` })) } })
const values = (devices: number) => ({ Variants: [variant(devices)] }) as unknown as DraftFormValues

function Host({ initial, onForm }: { initial: number; onForm?: (form: UseFormReturn<DraftFormValues>) => void }) {
  const form = useForm<DraftFormValues>({ defaultValues: values(initial) })
  useEffect(() => onForm?.(form), [form, onForm])
  return <TopologyResourcesPanel form={form} exerciseId="ex1" resources={resources} elevation={null} config={null} canRequest canPublish
    flush={() => Promise.resolve(true)} onRequested={() => {}} />
}

describe("TopologyResourcesPanel", () => {
  it("counts devices over all variants", () => {
    expect(hasAnyDevice(undefined)).toBe(false)
    expect(hasAnyDevice(values(0).Variants)).toBe(false)
    expect(hasAnyDevice(values(1).Variants)).toBe(true)
  })

  it("shows no card without devices", () => {
    const { container } = render(<Host initial={0} />)
    expect(container.querySelector("[data-resources-panel]")).toBeNull()
  })

  it("shows the card with a device", () => {
    const { container } = render(<Host initial={1} />)
    expect(container.querySelector("[data-resources-panel]")).toBeInTheDocument()
  })

  it("follows the first device added and the last removed", () => {
    let form: UseFormReturn<DraftFormValues> | undefined
    const { container } = render(<Host initial={0} onForm={(next) => { form = next }} />)
    act(() => form?.setValue("Variants", values(1).Variants))
    expect(container.querySelector("[data-resources-panel]")).toBeInTheDocument()
    act(() => form?.setValue("Variants", values(0).Variants))
    expect(container.querySelector("[data-resources-panel]")).toBeNull()
  })
})
