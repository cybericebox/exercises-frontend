/**
 * Test harness of the infrastructure views: a draft form holding one variant with the given devices, optionally the
 * lab capabilities, and a probe that prints the form values the test asserts on.
 */
import type { ReactNode } from "react"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { LabCapabilities } from "@/api/exercises/capabilities"
import { draftSchema, emptyDevice, emptyDraft, type DeviceFormValues, type DraftFormValues, type TopologyFormValues } from "@/lib/exerciseSchemas"
import { LabCapabilitiesProvider } from "../../labCapabilities"

export function device(overrides: Partial<DeviceFormValues> = {}): DeviceFormValues {
  return { ...emptyDevice(), ID: overrides.ID ?? "d1", Name: "web", ...overrides }
}

export function draftWith(devices: DeviceFormValues[], topology: Partial<TopologyFormValues> = {}): DraftFormValues {
  const draft = emptyDraft()
  draft.Variants[0].Topology = { ...draft.Variants[0].Topology, Devices: devices, ...topology }
  return draft
}

export function Values({ path }: { path: string }) {
  const { control } = useFormContext<DraftFormValues>()
  const value = useWatch({ control, name: path as never })
  return <output data-testid="values">{JSON.stringify(value)}</output>
}

export function readValues(): unknown {
  const node = document.querySelector('[data-testid="values"]')
  return JSON.parse(node?.textContent || "null")
}

/** Renders `children` inside a form with `draft`; `validate` wires the real zod resolver. */
export function FormHarness({ draft, children, caps = null, validate = false }: { draft: DraftFormValues; children: ReactNode; caps?: LabCapabilities | null; validate?: boolean }) {
  const form = useForm<DraftFormValues>({ defaultValues: draft, ...(validate ? { resolver: zodResolver(draftSchema) } : {}) })
  return <FormProvider {...form}>
    <LabCapabilitiesProvider value={caps}>
      {children}
      <button type="button" onClick={() => void form.trigger()}>validate-all</button>
    </LabCapabilitiesProvider>
  </FormProvider>
}

export function capabilities(overrides: Partial<LabCapabilities> = {}): LabCapabilities {
  return {
    Known: true,
    Observations: { file: "all", directory: "all", process: "all", port: "all", kernel_param: "all", request: "all", permission: "all", custom: "all", "file.type": "all", "file.checksum": "all" },
    Access: { http: "all", terminal: "all", vnc: "none", rdp: "none" },
    Profiles: { container: "all", microvm: "all", vm: "none" },
    Bootstrap: "all", Checks: "all", VPNReverse: "all",
    ...overrides,
  }
}
