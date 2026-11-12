"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { Info } from "lucide-react"
import { t } from "@/i18n/t"
import { FieldLabel } from "@/components/ui/field-label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { useEditor } from "../context"
import { deliveryPlaces, type DeliveryPlace } from "./deliveryPlaces"

const placeText = (place: DeliveryPlace): string => {
  const what = place.kind === "file" ? t("ed.b.deliver.file", { path: place.label || t("ed.b.deliver.noPath") })
    : place.kind === "env" ? t("ed.b.deliver.env", { name: place.label || t("ed.b.deliver.noName") }) : t("ed.b.deliver.script")
  return `${place.deviceName || t("ed.b.deliver.noDevice")} · ${what}`
}

/**
 * «Куди передається відповідь» (D7) — read-only. Lists every place of the variant where `{{task.<key>}}` reaches a device
 * (a variable, a file, the script) as links that open the device's section on the exact row. The link to the infrastructure
 * is NOT edited here: the answer is placed in the device's own settings.
 */
export function DeliveryBlock({ variantIndex, taskKey, randomFlag }: { variantIndex: number; taskKey: string; /** A random flag (no values) not delivered anywhere gets a note. */ randomFlag: boolean }) {
  const { control } = useFormContext<DraftFormValues>()
  const { goTo, goToField } = useEditor()
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  const places = topology ? deliveryPlaces(topology, taskKey) : []
  const nodes = (topology?.Devices ?? []).filter((device) => device.Type === "node")
  function open(place: { deviceId: string; section: DeliveryPlace["section"]; path?: string }) {
    // The path moves the editor to the row (the foundation maps it to the device section) and asks for its focus.
    if (place.path) goToField(["Variants", variantIndex, ...place.path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))])
    else goTo({ tab: "infrastructure", variant: variantIndex, node: place.deviceId, section: place.section })
  }
  const labelId = `deliver-label-${variantIndex}-${taskKey}`
  return <div className="min-w-0 space-y-1.5" data-testid="deliver-block">
    <FieldLabel as="span" id={labelId} text={t("ed.b.deliver.title")} help={{ intro: t("ed.b.deliver.help"), default: t("ed.b.deliver.helpDefault") }} />
    {places.length > 0
      ? <ul aria-labelledby={labelId} className="space-y-0.5 text-sm">
        {places.map((place) => <li key={`${place.kind}-${place.deviceId}-${place.row}`}>
          <button type="button" className="link-btn max-w-full truncate text-left text-primary underline decoration-border underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={t("ed.b.deliver.open", { text: placeText(place) })} onClick={() => open(place)}>{placeText(place)}</button>
        </li>)}
      </ul>
      : <p className="text-sm text-muted-foreground">
        {t("ed.b.deliver.none")}
        {nodes.length > 0 && <>{" "}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary" aria-haspopup="menu">{t("ed.b.deliver.setup")}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 min-w-48 overflow-y-auto">
              {nodes.map((device) => <DropdownMenuItem key={device.ID} onSelect={() => open({ deviceId: device.ID, section: "init" })}>{device.Name || t("ed.b.deliver.noDevice")}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </>}
      </p>}
    {places.length === 0 && randomFlag && <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />{t("ed.b.deliver.randomNote")}</p>}
  </div>
}
