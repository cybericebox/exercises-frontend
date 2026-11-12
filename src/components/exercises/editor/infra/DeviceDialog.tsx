"use client"

import { X } from "lucide-react"
import { useWatch, useFormContext } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { DeviceSection } from "@/lib/editorPosition"
import { cn } from "@/utils/cn"
import { useNewVariable } from "./NewVariableDialog"
import { AccessSection } from "./sections/AccessSection"
import { InitSection } from "./sections/InitSection"
import { MainSection } from "./sections/MainSection"
import { NetworkSection } from "./sections/NetworkSection"
import { ServiceSection } from "./sections/ServiceSection"

export const DEVICE_SECTIONS: { id: DeviceSection; label: string }[] = [
  { id: "main", label: "ed.c.dev.main" },
  { id: "network", label: "ed.c.dev.network" },
  { id: "init", label: "ed.c.dev.init" },
  { id: "service", label: "ed.c.dev.service" },
  { id: "access", label: "ed.c.dev.access" },
]

/**
 * The device editor (E5): a wide dialog, the section list on the left (wrapping on a phone), one section on the right.
 * Everything saves as it is typed (the form is the draft); «Готово» only closes. In a linked variant only the image is
 * editable and the dialog says so.
 */
export function DeviceDialog({ variantIndex, deviceIndex, section, onSection, onClose, readOnly, linkedBaseIndex, imageEditable, onOpenVariables }: {
  variantIndex: number
  deviceIndex: number
  section: DeviceSection
  onSection: (section: DeviceSection) => void
  onClose: () => void
  /** Viewing, or a linked variant: every field except an editable image is read-only. */
  readOnly: boolean
  linkedBaseIndex?: number
  imageEditable: boolean
  onOpenVariables: () => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const name = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Name` })
  const newVariable = useNewVariable(variantIndex)
  const props = { variantIndex, deviceIndex, disabled: readOnly }
  const current = DEVICE_SECTIONS.find((item) => item.id === section) ?? DEVICE_SECTIONS[0]

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent aria-describedby="device-dialog-description" data-device-dialog
      onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById(`device-section-${current.id}`)?.focus() }}
      className="grid h-[min(48.75rem,calc(100dvh-2rem))] max-w-[70rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-6 [scrollbar-gutter:stable] sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogTitle className="truncate text-lg">{t("ed.c.dev.title", { name: name || t("admin.exTopo.unnamedDevice") })}</DialogTitle>
          <DialogDescription id="device-dialog-description" className={cn("mt-0.5 text-sm", !(linkedBaseIndex !== undefined) && "sr-only")}>
            {linkedBaseIndex !== undefined ? t("ed.c.dev.linkedNote", { n: linkedBaseIndex + 1 }) : t("ed.c.dev.description")}
          </DialogDescription>
        </div>
        <HoverTooltip text={t("ed.ui.close")}>
          <Button type="button" variant="ghost" size="icon" aria-label={t("ed.ui.close")} className="-mr-2 h-8 w-8 shrink-0" onClick={onClose}><X aria-hidden="true" className="h-4 w-4" /></Button>
        </HoverTooltip>
      </header>
      <div className="@container grid min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-5 md:grid-cols-[13.125rem_minmax(0,1fr)] md:grid-rows-1">
        <nav aria-label={t("ed.c.dev.sections")} className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap md:gap-0.5 md:border-r md:border-border md:pr-3">
          {DEVICE_SECTIONS.map((item) => <button key={item.id} type="button" id={`device-section-${item.id}`} aria-current={item.id === current.id ? "true" : undefined} onClick={() => onSection(item.id)}
            className={cn("min-h-10 rounded-md px-2.5 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary", item.id === current.id ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-[var(--ib-hover)]")}>
            {t(item.label)}
          </button>)}
        </nav>
        <div role="region" aria-label={t(current.label)} className="@container min-h-0 min-w-0 overflow-y-auto pb-3 pl-1 pr-2 pt-1 [scrollbar-gutter:stable]">
          {current.id === "main" && <MainSection {...props} linkedBaseIndex={linkedBaseIndex} imageDisabled={imageEditable ? false : undefined} />}
          {current.id === "network" && <NetworkSection {...props} />}
          {current.id === "init" && <InitSection {...props} requestVariable={newVariable.request} />}
          {current.id === "service" && <ServiceSection {...props} onOpenVariables={onOpenVariables} requestVariable={newVariable.request} />}
          {current.id === "access" && <AccessSection {...props} />}
        </div>
      </div>
      <footer className="flex justify-end pr-1.5">
        <Button type="button" onClick={onClose}>{t("ed.c.dev.done")}</Button>
      </footer>
      {newVariable.dialog}
    </DialogContent>
  </Dialog>
}
