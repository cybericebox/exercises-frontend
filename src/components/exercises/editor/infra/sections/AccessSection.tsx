"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { ACCESS_KINDS, type AccessKind } from "@/api/exercises/model"
import { Switch } from "@/components/ui/switch"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import type { HelpContent } from "@/components/ui/help-content"
import { emptyAccess } from "@/lib/editor/schemas/infra"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { FieldHelp, SwitchBlock, SwitchList } from "../../kit"
import { useLabSupport } from "../../labCapabilities"
import { InputField, SelectField, devicePath } from "../fields"
import type { SectionProps } from "./MainSection"

const PROTOCOLS: SelectMenuOption[] = [{ value: "http", label: "http" }, { value: "https", label: "https" }]

/** A quiet warning line: not every laboratory can run the option. */
export function LabWarn({ text }: { text: string }) {
  return <p role="note" data-lab-warning className="mt-2 text-xs leading-5 text-[var(--ib-warn)]">{text}</p>
}

/**
 * A switch that cannot be turned on at all (VNC, RDP). The row stays visible and focusable: the label «Недоступно» is
 * on the row, the full reason is in the tooltip and in the «?».
 */
function UnavailableRow({ label, reason, help }: { label: string; reason: string; help: HelpContent }) {
  return <div data-switch-block data-unavailable className="flex min-w-0 items-center">
    <HoverTooltip text={reason} describe="always">
      <div tabIndex={0} role="group" aria-label={`${label}. ${t("ed.c.access.unavailable")}. ${reason}`} className="flex min-h-6 w-fit max-w-full items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-primary">
        <Switch checked={false} onCheckedChange={() => {}} disabled aria-label={label} />
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{t("ed.c.access.unavailable")}</span>
      </div>
    </HoverTooltip>
    <span className="ml-1 inline-flex align-middle"><FieldHelp help={help} /></span>
  </div>
}

/** «Доступ»: one switch row per kind, at most one entry per kind in `Access`; a present entry is "on". */
export function AccessSection({ variantIndex, deviceIndex, disabled }: SectionProps) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const dp = devicePath(variantIndex, deviceIndex)
  const access = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Access` }) ?? []
  const support = useLabSupport()
  const indexOf = (kind: AccessKind) => access.findIndex((entry) => entry.Kind === kind)

  function toggle(kind: AccessKind, on: boolean) {
    const rest = access.filter((entry) => entry.Kind !== kind)
    const next = (on ? [...rest, emptyAccess(kind)] : rest).sort((a, b) => ACCESS_KINDS.indexOf(a.Kind) - ACCESS_KINDS.indexOf(b.Kind))
    setValue(`Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Access`, next, { shouldDirty: true, shouldValidate: true })
  }

  const web = indexOf("http")
  const terminal = indexOf("terminal")
  const webLab = support({ access: "http" })
  const terminalLab = support({ access: "terminal" })

  return <SwitchList>
    <SwitchBlock label={t("ed.c.access.web")} checked={web >= 0} onCheckedChange={(on) => toggle("http", on)} disabled={disabled}
      unavailable={web < 0 && webLab.state === "disabled" ? webLab.reason : undefined}
      help={{ intro: t("ed.c.h.web"), default: t("ed.c.access.off") }}>
      {web >= 0 && <>
        <div className="flex flex-wrap items-start gap-3">
          <InputField name={`${dp}.Access.${web}.Port`} label={t("ed.c.access.port")} required type="number" inputMode="numeric" mono disabled={disabled} className="w-40"
            help={{ intro: [t("ed.c.h.port1"), t("ed.c.h.port2")] }} />
          <SelectField name={`${dp}.Access.${web}.Protocol`} label={t("ed.c.access.protocol")} required options={PROTOCOLS} disabled={disabled} className="w-40"
            help={{ intro: t("ed.c.h.protocol"), items: [{ term: "http", text: t("ed.c.h.protocolHttp") }, { term: "https", text: t("ed.c.h.protocolHttps") }] }} />
        </div>
        {webLab.state !== "ok" && <LabWarn text={webLab.reason} />}
      </>}
    </SwitchBlock>
    <SwitchBlock label={t("ed.c.access.terminal")} checked={terminal >= 0} onCheckedChange={(on) => toggle("terminal", on)} disabled={disabled}
      unavailable={terminal < 0 && terminalLab.state === "disabled" ? terminalLab.reason : undefined}
      help={{ intro: [t("ed.c.access.terminalHelp1"), t("ed.c.access.terminalHelp2")], default: `${t("ed.c.access.off")} ${t("ed.c.help.consoleEvents")}` }}>
      {terminal >= 0 && <>
        <div className="flex flex-wrap items-start gap-3">
          <InputField name={`${dp}.Access.${terminal}.Command`} label={t("ed.c.access.command")} mono disabled={disabled} className="w-64 max-w-full" placeholder={t("ed.c.ph.shell")}
            help={{ intro: t("ed.c.h.terminalCmd"), default: t("ed.c.h.terminalCmdDefault") }} />
          <InputField name={`${dp}.Access.${terminal}.User`} label={t("ed.c.access.user")} disabled={disabled} className="w-64 max-w-full" placeholder={t("ed.c.access.userPlaceholder")}
            help={{ intro: t("ed.c.h.terminalUser"), default: t("ed.c.h.terminalUserDefault") }} />
        </div>
        {terminalLab.state !== "ok" && <LabWarn text={terminalLab.reason} />}
      </>}
    </SwitchBlock>
    <UnavailableRow label={t("ed.c.access.vnc")} reason={t("ed.c.access.vncReason")} help={{ intro: [t("ed.c.access.vncHelp"), t("ed.c.access.vncReason")], default: t("ed.c.access.off") }} />
    <UnavailableRow label={t("ed.c.access.rdp")} reason={t("ed.c.access.rdpReason")} help={{ intro: [t("ed.c.access.rdpHelp"), t("ed.c.access.rdpReason")], default: t("ed.c.access.off") }} />
  </SwitchList>
}
