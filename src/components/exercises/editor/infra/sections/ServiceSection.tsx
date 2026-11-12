"use client"

import { useEffect, useState } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { Lock } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { useDevicePersistenceAvailable } from "../../../DevicePersistenceContext"
import { FieldError, fieldProps, useFieldError } from "../../fieldErrors"
import { SwitchBlock, SwitchList } from "../../kit"
import { joinArgs, sameList, splitArgs } from "../argsText"
import { Block, InputField, devicePath } from "../fields"
import { useImageService } from "../useImageService"
import { EnvBlock } from "./EnvBlock"
import type { SectionProps } from "./MainSection"

/** A list of command parts edited as one line (`nginx -g 'daemon off;'`); the form keeps the parts. */
function ListTextField({ name, label, required, help, placeholder, disabled, className }: {
  name: string
  label: string
  required?: boolean
  help: Parameters<typeof FieldLabel>[0]["help"]
  placeholder?: string
  disabled: boolean
  className?: string
}) {
  const { control } = useFormContext<DraftFormValues>()
  const error = useFieldError(name)
  const props = fieldProps(name, error)
  return <div className={className}>
    <FieldLabel text={label} required={required} htmlFor={props.id} help={help} />
    <Controller control={control} name={name as never} render={({ field }) => <ListTextInput {...props} list={(field.value ?? []) as string[]} onList={field.onChange} onBlur={field.onBlur} inputRef={field.ref} disabled={disabled} placeholder={placeholder} />} />
    <FieldError path={name} />
  </div>
}

function ListTextInput({ list, onList, onBlur, inputRef, disabled, placeholder, ...props }: {
  list: string[]
  onList: (list: string[]) => void
  onBlur: () => void
  inputRef: React.Ref<HTMLInputElement>
  disabled: boolean
  placeholder?: string
  id: string
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
}) {
  const [text, setText] = useState(() => joinArgs(list))
  // A change from outside (a prefill, another editor): the text follows unless it already means the same parts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the typed text follows a form value changed from outside
    if (!sameList(splitArgs(text), list)) setText(joinArgs(list))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the form value drives the sync
  }, [list.join("\u0000")])
  return <Input {...props} ref={inputRef} value={text} disabled={disabled} placeholder={placeholder} autoComplete="off" spellCheck={false} className="font-mono text-[13px]"
    onBlur={onBlur} onChange={(event) => { setText(event.target.value); onList(splitArgs(event.target.value)) }} />
}

/** «Сервіс»: the command of the service, its environment and when the platform counts the device as ready. */
export function ServiceSection({ variantIndex, deviceIndex, disabled, onOpenVariables, requestVariable }: SectionProps & {
  onOpenVariables: () => void
  requestVariable: (insert: (name: string) => void) => void
}) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const dp = devicePath(variantIndex, deviceIndex)
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const command = useWatch({ control, name: `${base}.Command` }) ?? []
  const image = useWatch({ control, name: `${base}.Image` }) ?? ""
  const persistence = useWatch({ control, name: `${base}.Persistence.Enabled` }) ?? false
  const waitReady = useWatch({ control, name: `${base}.WaitReadyFile` }) ?? false
  const persistenceAvailable = useDevicePersistenceAvailable()
  const service = useImageService(image)
  const [own, setOwn] = useState(command.length > 0)
  const ownOn = own || command.length > 0
  const detected = service?.Known ? joinArgs([...service.Entrypoint, ...service.Cmd]) : ""

  function toggleOwn(on: boolean) {
    setOwn(on)
    if (!on) {
      setValue(`${base}.Command`, [], { shouldDirty: true, shouldValidate: true })
      setValue(`${base}.Args`, [], { shouldDirty: true, shouldValidate: true })
      return
    }
    // The image's own command is the starting point to edit.
    if (service?.Known) {
      const hasEntrypoint = service.Entrypoint.length > 0
      setValue(`${base}.Command`, hasEntrypoint ? service.Entrypoint : service.Cmd, { shouldDirty: true, shouldValidate: true })
      setValue(`${base}.Args`, hasEntrypoint ? service.Cmd : [], { shouldDirty: true, shouldValidate: true })
    }
  }

  return <div className="space-y-5">
    <Block title={t("ed.c.service.commandBlock")} help={{ intro: t("ed.c.h.command"), default: t("ed.c.h.commandDefault") }}>
      {!ownOn && <p data-detected-command className="flex min-h-9 items-center gap-1.5 overflow-hidden rounded-md border border-dashed border-border px-2.5 font-mono text-[13px] text-muted-foreground">
        <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{detected ? `${t("ed.c.service.fromImage")} ${detected}`
          : image.trim() === "" ? t("ed.c.service.noImage") : service?.Known === false ? t("ed.c.service.unknownCommand") : t("ed.c.service.commandUnknownYet")}</span>
      </p>}
      <SwitchList>
        <SwitchBlock label={t("ed.c.service.ownCommand")} checked={ownOn} onCheckedChange={toggleOwn} disabled={disabled}
          help={{ intro: t("ed.c.h.ownCommand") }}>
          <div className="flex flex-wrap items-start gap-3">
            <ListTextField name={`${dp}.Command`} label={t("ed.c.service.command")} disabled={disabled} className="w-80 max-w-full" placeholder={detected.split(" ")[0] || "/entrypoint.sh"}
              help={{ intro: t("ed.c.service.commandHelp"), default: t("ed.c.service.commandQuote") }} />
            <ListTextField name={`${dp}.Args`} label={t("ed.c.service.args")} disabled={disabled} className="w-80 max-w-full" placeholder={t("ed.c.ph.args")}
              help={{ intro: t("ed.c.h.args"), default: t("ed.c.service.commandQuote") }} />
          </div>
        </SwitchBlock>
      </SwitchList>
    </Block>
    <EnvBlock variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={disabled} onOpenVariables={onOpenVariables} requestVariable={requestVariable} />
    <div className="border-t border-border pt-5"><Block title={t("ed.c.service.behavior")} help={{ intro: t("ed.c.h.behaviour"), items: [{ term: t("ed.c.h.behaviourPersist"), text: t("ed.c.h.behaviourPersistText") }, { term: t("ed.c.h.behaviourReady"), text: t("ed.c.h.behaviourReadyText") }] }}>
      <SwitchList>
        <SwitchBlock label={t("ed.c.service.ready")} checked={waitReady} disabled={disabled}
          onCheckedChange={(on) => setValue(`${base}.WaitReadyFile`, on, { shouldDirty: true })}
          help={{ intro: [t("ed.c.h.ready1"), t("ed.c.h.ready2")], items: [{ term: t("ed.c.h.readyAdds"), text: t("ed.c.h.readyAddsText") }, { term: t("ed.c.h.readyWeb"), text: t("ed.c.h.readyWebText") }], default: t("ed.c.h.readyDefault") }} />
        <SwitchBlock label={t("ed.c.service.persist")} checked={persistence} disabled={disabled}
          unavailable={!persistence && !persistenceAvailable ? t("ed.c.service.persistUnavailable") : undefined}
          onCheckedChange={(on) => setValue(`${base}.Persistence.Enabled`, on, { shouldDirty: true, shouldValidate: true })}
          help={{ intro: [t("ed.c.h.persist1"), t("ed.c.h.persist2")], default: t("ed.c.access.off") }}>
          <InputField name={`${dp}.Persistence.Debounce`} label={t("ed.c.service.debounce")} mono disabled={disabled} className="w-40" placeholder={t("ed.c.ph.debounce")}
            help={{ intro: [t("ed.c.h.debounce1"), t("ed.c.h.debounce2")] }} />
        </SwitchBlock>
      </SwitchList>
    </Block></div>
  </div>
}
