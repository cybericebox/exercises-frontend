"use client"

import { useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Copy, Plus, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import {
  CONSOLE_MODES, DEFAULT_CONSOLE_COMMAND, DEFAULT_CONSOLE_USER, cablesOnPort, canHavePorts, emptyConsolePort, emptySerialPort, isConsoleConnection,
  nextPortName, renamePortInConnections, serialDevicePath,
} from "@/lib/editor/consolePorts"
import { renamePortInDefender } from "@/lib/editor/defender"
import { FieldError } from "../../fieldErrors"
import { ConsoleLinesNotice, useConsoleLimits } from "../../consoleLines"
import { Block, InputField, SelectField, devicePath } from "../fields"
import { ListTextField } from "./ServiceSection"
import type { SectionProps } from "./MainSection"

type PortList = "ConsolePorts" | "SerialPorts"

/**
 * “Ports”: the console ports of the device (its management lines: the program that runs on each, or the device's own native
 * console) and its serial ports (terminal lines inside the device, /dev/ttyCON<n>), the two ends of a console cable. Nodes only,
 * never a Windows device (VNC or RDP only); at most the laboratory's limits. A renamed port takes its cables and credentials
 * with it; a removed one takes its cable.
 */
export function PortsSection({ variantIndex, deviceIndex, disabled }: SectionProps) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const dp = devicePath(variantIndex, deviceIndex)
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const device = useWatch({ control, name: base })
  const connections = useWatch({ control, name: `Variants.${variantIndex}.Topology.Connections` }) ?? []
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const limits = useConsoleLimits()
  const [removing, setRemoving] = useState<{ list: PortList; index: number } | null>(null)
  const renameStart = useRef<{ list: PortList; index: number; name: string } | null>(null)
  if (!device) return null
  const consolePorts = device.ConsolePorts ?? []
  const serialPorts = device.SerialPorts ?? []
  const allowed = canHavePorts(device)
  const taken = [...device.Interfaces.map((iface) => iface.Name), ...consolePorts.map((port) => port.Name), ...serialPorts.map((port) => port.Name)]
  const consoleFull = consolePorts.length >= limits.consolePorts
  const serialFull = serialPorts.length >= limits.serialPorts

  /** Who is at the other end of the cable on this port: "pc · serial0", or "" when it is not cabled. */
  function cableOf(port: string): string {
    const cable = connections.find((connection) => isConsoleConnection(connection) && connection.Endpoints.some((endpoint) => endpoint.DeviceID === device!.ID && endpoint.Interface === port))
    const other = cable?.Endpoints.find((endpoint) => !(endpoint.DeviceID === device!.ID && endpoint.Interface === port))
    if (!other) return ""
    return `${devices.find((candidate) => candidate.ID === other.DeviceID)?.Name || t("admin.exTopo.unnamedDevice")} · ${other.Interface || "—"}`
  }

  function add(list: PortList) {
    const current = getValues(`${base}.${list}`) ?? []
    const port = list === "ConsolePorts" ? emptyConsolePort(nextPortName("console", taken)) : emptySerialPort(nextPortName("serial", taken))
    setValue(`${base}.${list}`, [...current, port] as never, { shouldDirty: true, shouldValidate: true })
  }

  function remove(list: PortList, index: number) {
    const ports = getValues(`${base}.${list}`) ?? []
    const name = ports[index]?.Name ?? ""
    setValue(`${base}.${list}`, ports.filter((_, candidate) => candidate !== index) as never, { shouldDirty: true, shouldValidate: true })
    // Its cable goes with it; a credential that named the console port now names no port.
    const cables = new Set(cablesOnPort(getValues(`Variants.${variantIndex}.Topology.Connections`), device!.ID, name))
    if (cables.size) setValue(`Variants.${variantIndex}.Topology.Connections`, getValues(`Variants.${variantIndex}.Topology.Connections`).filter((_, ci) => !cables.has(ci)), { shouldDirty: true, shouldValidate: true })
    const defender = getValues(`Variants.${variantIndex}.Defender`)
    if (list === "ConsolePorts" && defender?.Credentials.some((c) => c.Device === device!.Name && c.Port === name)) {
      setValue(`Variants.${variantIndex}.Defender`, renamePortInDefender(defender, device!.Name, name, "") ?? null, { shouldDirty: true, shouldValidate: true })
    }
    setRemoving(null)
  }

  /** A rename is committed when the name field is left: its cables and credentials follow, once, from the name it started with. */
  function startRename(list: PortList, index: number) {
    if (!renameStart.current) renameStart.current = { list, index, name: getValues(`${base}.${list}.${index}.Name`) ?? "" }
  }
  function commitRename() {
    const start = renameStart.current
    renameStart.current = null
    if (!start) return
    const next = getValues(`${base}.${start.list}.${start.index}.Name`) ?? ""
    const names = [...(getValues(`${base}.Interfaces`) ?? []).map((iface) => iface.Name), ...(getValues(`${base}.ConsolePorts`) ?? []).map((port) => port.Name), ...(getValues(`${base}.SerialPorts`) ?? []).map((port) => port.Name)]
    // An empty name, or one another port or interface has, moves nothing: the field shows its error.
    if (next === "" || next === start.name || names.filter((name) => name === next).length > 1) return
    const path = `Variants.${variantIndex}.Topology.Connections` as const
    const current = getValues(path)
    const renamed = renamePortInConnections(current, device!.ID, start.name, next)
    if (renamed !== current) setValue(path, renamed, { shouldDirty: true, shouldValidate: true })
    if (start.list === "ConsolePorts") {
      const defender = getValues(`Variants.${variantIndex}.Defender`)
      const moved = renamePortInDefender(defender, device!.Name, start.name, next)
      if (moved !== defender) setValue(`Variants.${variantIndex}.Defender`, moved ?? null, { shouldDirty: true, shouldValidate: true })
    }
  }

  const modeOptions: SelectMenuOption[] = CONSOLE_MODES.map((mode) => ({ value: mode, label: t(`ed.c.port.mode.${mode}`), description: t(`ed.c.port.mode.${mode}Help`) }))
  const removingPort = removing ? (removing.list === "ConsolePorts" ? consolePorts : serialPorts)[removing.index] : undefined
  const removingCable = removingPort ? cableOf(removingPort.Name) : ""

  const addButton = (list: PortList, full: boolean, max: number) => !disabled && allowed && <AddPortButton
    label={t(list === "ConsolePorts" ? "ed.c.port.addConsole" : "ed.c.port.addSerial")}
    blockedReason={full ? t(list === "ConsolePorts" ? "ed.c.port.val.consoleMax" : "ed.c.port.val.serialMax", { max }) : null} onClick={() => add(list)} />

  return <div className="space-y-5" data-ports-section>
    <ConsoleLinesNotice />
    {!allowed && <p role="note" className="text-sm text-muted-foreground">{t("ed.c.port.windowsNote")}</p>}
    <Block id="console-ports" title={t("ed.c.port.consoleTitle")} count={consolePorts.length}
      help={{ intro: [t("ed.c.h.consolePorts1"), t("ed.c.h.consolePorts2")], default: t("ed.c.h.consoleDefault", { command: DEFAULT_CONSOLE_COMMAND, user: DEFAULT_CONSOLE_USER }) }}
      actions={addButton("ConsolePorts", consoleFull, limits.consolePorts)}>
      <FieldError path={`${dp}.ConsolePorts`} />
      {consolePorts.length === 0
        ? <EmptyState compact message={t("ed.c.port.consoleEmpty")} />
        : <div className="min-w-0 space-y-3">{consolePorts.map((port, index) => {
          const row = `${dp}.ConsolePorts.${index}`
          const cable = cableOf(port.Name)
          return <div key={index} role="group" aria-label={t("ed.c.port.consoleN", { name: port.Name || String(index + 1) })} data-console-port={port.Name}
            className="group grid min-w-0 grid-cols-1 gap-3 rounded-md border border-border p-3 @md:grid-cols-[10rem_minmax(0,14rem)_minmax(0,1fr)_36px]">
            <div className="contents" onFocus={() => startRename("ConsolePorts", index)} onBlur={commitRename}>
              <InputField name={`${row}.Name`} label={t("ed.c.port.name")} required mono disabled={disabled} placeholder={t("ed.c.ph.consolePort")} help={{ intro: t("ed.c.h.consoleName") }} />
            </div>
            <SelectField name={`${row}.Mode`} label={t("ed.c.port.mode")} options={modeOptions} disabled={disabled} menuClassName="w-[24rem] max-w-[90vw]"
              help={{ intro: t("ed.c.h.consoleMode"), items: CONSOLE_MODES.map((mode) => ({ term: t(`ed.c.port.mode.${mode}`), text: t(`ed.c.port.mode.${mode}Help`) })) }} />
            <div className="flex min-w-0 flex-wrap items-start gap-3">
              {port.Mode === "program" && <>
                <ListTextField name={`${row}.Command`} label={t("ed.c.port.command")} disabled={disabled} className="min-w-48 flex-1" placeholder={DEFAULT_CONSOLE_COMMAND}
                  help={{ intro: t("ed.c.h.consoleCommand"), default: t("ed.c.h.consoleCommandDefault", { command: DEFAULT_CONSOLE_COMMAND }) }} />
                <InputField name={`${row}.User`} label={t("ed.c.port.user")} disabled={disabled} className="w-40" placeholder={DEFAULT_CONSOLE_USER}
                  help={{ intro: t("ed.c.h.consoleUser"), default: t("ed.c.h.consoleUserDefault", { user: DEFAULT_CONSOLE_USER }) }} />
              </>}
              {port.Mode === "tcp" && <InputField name={`${row}.Port`} label={t("ed.c.port.tcpPort")} required type="number" inputMode="numeric" mono disabled={disabled} className="w-40"
                help={{ intro: t("ed.c.h.consoleTcp") }} />}
              {port.Mode === "stdio" && <p className="flex min-h-9 items-center pt-6 text-sm text-muted-foreground">{t("ed.c.port.stdioNote")}</p>}
            </div>
            <RemovePortButton disabled={disabled} label={t("ed.c.port.removeN", { name: port.Name || String(index + 1) })} onClick={() => setRemoving({ list: "ConsolePorts", index })} />
            <p data-port-cable className="text-xs text-muted-foreground @md:col-span-4">{cable ? t("ed.c.port.cabledTo", { end: cable }) : t("ed.c.port.notCabled")}</p>
          </div>
        })}</div>}
    </Block>
    <Block id="serial-ports" title={t("ed.c.port.serialTitle")} count={serialPorts.length}
      help={{ intro: [t("ed.c.h.serialPorts1"), t("ed.c.h.serialPorts2")] }}
      actions={addButton("SerialPorts", serialFull, limits.serialPorts)}>
      <FieldError path={`${dp}.SerialPorts`} />
      {serialPorts.length === 0
        ? <EmptyState compact message={t("ed.c.port.serialEmpty")} />
        : <div className="min-w-0 space-y-3">{serialPorts.map((port, index) => {
          const row = `${dp}.SerialPorts.${index}`
          const cable = cableOf(port.Name)
          const path = serialDevicePath(port)
          return <div key={index} role="group" aria-label={t("ed.c.port.serialN", { name: port.Name || String(index + 1) })} data-serial-port={port.Name}
            className="group grid min-w-0 grid-cols-1 gap-3 rounded-md border border-border p-3 @md:grid-cols-[10rem_minmax(0,1fr)_36px]">
            <div className="contents" onFocus={() => startRename("SerialPorts", index)} onBlur={commitRename}>
              <InputField name={`${row}.Name`} label={t("ed.c.port.name")} required mono disabled={disabled} placeholder={t("ed.c.ph.serialPort")} help={{ intro: t("ed.c.h.serialName") }} />
            </div>
            <div className="flex min-w-0 items-end gap-2">
              <InputField name={`${row}.Path`} label={t("ed.c.port.path")} mono disabled={disabled} className="min-w-0 flex-1" placeholder={serialDevicePath({ Name: port.Name })}
                help={{ intro: t("ed.c.h.serialPath"), default: t("ed.c.h.serialPathDefault", { path: serialDevicePath({ Name: port.Name || "serial0" }) }) }} />
              <CopyPathButton path={path} />
            </div>
            <RemovePortButton disabled={disabled} label={t("ed.c.port.removeN", { name: port.Name || String(index + 1) })} onClick={() => setRemoving({ list: "SerialPorts", index })} />
            <p data-port-cable className="text-xs text-muted-foreground @md:col-span-3">{cable ? t("ed.c.port.cabledTo", { end: cable }) : t("ed.c.port.notCabled")}</p>
          </div>
        })}</div>}
    </Block>
    <ConfirmDialog open={removing !== null} onCancel={() => setRemoving(null)} tone="danger"
      title={t("ed.c.port.removeTitle", { name: removingPort?.Name || "—" })}
      description={removingCable ? t("ed.c.port.removeWithCable", { end: removingCable }) : t("ed.c.port.removeNoCable")}
      cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={t("ed.c.port.remove")} onConfirm={() => { if (removing) remove(removing.list, removing.index) }} />
  </div>
}

function AddPortButton({ label, blockedReason, onClick }: { label: string; blockedReason: string | null; onClick: () => void }) {
  const button = <Button type="button" variant="outline" aria-disabled={blockedReason ? true : undefined} className="h-9 gap-1.5 px-3 text-[13px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:h-11"
    onClick={() => { if (!blockedReason) onClick() }}><Plus aria-hidden="true" className="h-4 w-4" />{label}</Button>
  return blockedReason ? <HoverTooltip text={blockedReason} describe="always">{button}</HoverTooltip> : button
}

function RemovePortButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  if (disabled) return <span />
  return <HoverTooltip text={label} className="self-start @md:mt-6">
    <Button type="button" variant="outline" size="icon" aria-label={label} onClick={onClick}
      className="h-9 w-9 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive pointer-coarse:h-11 pointer-coarse:w-11"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
  </HoverTooltip>
}

/** Copies the character device of a serial port (what the task text names: picocom /dev/ttyCON0). */
function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const label = copied ? t("ed.c.port.pathCopied") : t("ed.c.port.copyPath", { path })
  return <HoverTooltip text={label}>
    <Button type="button" variant="outline" size="icon" aria-label={label} className="h-9 w-9 shrink-0 text-muted-foreground pointer-coarse:h-11 pointer-coarse:w-11"
      onClick={() => { void navigator.clipboard?.writeText(path).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }, () => {}) }}>
      <Copy aria-hidden="true" className="h-4 w-4" />
    </Button>
  </HoverTooltip>
}
