"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { ResourcesPanel } from "@/components/exercises/ResourcesPanel"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

type PanelProps = Parameters<typeof ResourcesPanel>[0]

/** True when any variant of the working copy has at least one device. */
export function hasAnyDevice(variants: DraftFormValues["Variants"] | undefined): boolean {
  return Boolean(variants?.some((variant) => (variant.Topology?.Devices?.length ?? 0) > 0))
}

/** The resources card exists only for a task with a topology; it follows the working copy live. */
export function TopologyResourcesPanel({ form, ...panel }: PanelProps & { form: UseFormReturn<DraftFormValues> }) {
  const variants = useWatch({ control: form.control, name: "Variants" })
  if (!hasAnyDevice(variants)) return null
  return <ResourcesPanel {...panel} />
}
