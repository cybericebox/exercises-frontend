"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Gauge, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatCPU, formatMemory } from "@/lib/deviceResources"
import { t } from "@/i18n/t"
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

function range(min: number, max: number, format: (value: number) => string): string {
  return min === max ? format(max) : `${format(min)}–${format(max)}`
}

/**
 * The task's resources folded into one button beside the topology actions: the CPU and memory range over the
 * variants and how many devices still need an approval; the full panel (totals, devices outside the frame,
 * the request) opens in a popover.
 */
export function TopologyResourcesButton({ form, ...panel }: PanelProps & { form: UseFormReturn<DraftFormValues> }) {
  const variants = useWatch({ control: form.control, name: "Variants" })
  const resources = panel.resources
  if (!hasAnyDevice(variants) || !resources) return null
  const pending = resources.Outside.filter((issue) => !issue.Covered).length
  const label = t("exercises.res.button", {
    cpu: range(resources.Min.CPUMillicores, resources.Max.CPUMillicores, formatCPU),
    memory: range(resources.Min.MemoryBytes, resources.Max.MemoryBytes, formatMemory),
  })
  return <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="gap-2" aria-label={pending ? t("exercises.res.buttonPending", { label, count: pending }) : label}>
        <Gauge aria-hidden="true" className="h-4 w-4" /><span className="hidden lg:inline">{label}</span><span className="lg:hidden">{t("exercises.res.title")}</span>
        {pending > 0 && <Badge tone="warn" className="gap-1"><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />{t("exercises.res.pendingCount", { count: pending })}</Badge>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="resources-popover w-[min(32rem,calc(100vw-1.5rem))] p-3">
      <ResourcesPanel {...panel} />
    </PopoverContent>
  </Popover>
}
