"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { MAX_VARIABLES, TASK_KEY_RE } from "@/api/exercises/model"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { FieldError } from "../fieldErrors"

export function kindHelp() {
  return { intro: t("ed.c.vars.kindHelp"), items: [{ term: t("ed.c.vars.kindValue"), text: t("ed.c.vars.kindValueHelp") }, { term: t("ed.c.vars.kindTemplate"), text: t("ed.c.vars.kindTemplateHelp") }] }
}

export function templateHelp() {
  return { intro: t("ed.c.vars.templateHelp"), default: t("ed.c.vars.templateExample") }
}

export function kindOptions() {
  return [
    { value: "value", label: t("ed.c.vars.kindValue"), description: t("ed.c.vars.kindValueHelp") },
    { value: "template", label: t("ed.c.vars.kindTemplate"), description: t("ed.c.vars.kindTemplateHelp") },
  ]
}

/**
 * «Нова змінна схеми» from the picker of a value: created on the spot and inserted into the field. The name follows the
 * variable name rule and is unique; the value is fixed or a pattern.
 */
export function NewVariableDialog({ variantIndex, open, onCreate, onClose }: {
  variantIndex: number
  open: boolean
  /** Called with the new name after the variable is in the form. */
  onCreate: (name: string) => void
  onClose: () => void
}) {
  const { control, setValue, getValues } = useFormContext<DraftFormValues>()
  const variables = useWatch({ control, name: `Variants.${variantIndex}.Topology.Variables` }) ?? []
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"value" | "template">("value")
  const [text, setText] = useState("")
  const nameError = name === "" ? undefined : !TASK_KEY_RE.test(name) ? t("ed.b.val.keyFormat") : variables.some((variable) => variable.Name === name) ? t("ed.c.val.variableDuplicate") : undefined
  const full = variables.length >= MAX_VARIABLES
  const ready = name !== "" && !nameError && text !== "" && !full

  function create() {
    if (!ready) return
    const current = getValues(`Variants.${variantIndex}.Topology.Variables`) ?? []
    setValue(`Variants.${variantIndex}.Topology.Variables`, [...current, { Name: name, Kind: kind, Text: text }], { shouldDirty: true, shouldValidate: true })
    onCreate(name)
    setName(""); setText(""); setKind("value")
  }

  const idName = "new-variable-name"
  const idValue = "new-variable-value"
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t("ed.c.newVar.title")}</DialogTitle>
        <DialogDescription>{t("ed.c.newVar.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="min-w-0">
          <FieldLabel text={t("ed.c.vars.name")} required htmlFor={idName} help={{ intro: t("ed.c.vars.nameHelp"), default: t("ed.c.vars.nameRule") }} />
          <Input id={idName} value={name} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" placeholder={t("ed.c.ph.varName")}
            aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? `${idName}-error` : undefined} onChange={(event) => setName(event.target.value)} />
          {nameError && <FieldError path={idName} message={nameError} />}
        </div>
        <div className="min-w-0">
          <FieldLabel as="span" text={t("ed.c.vars.kind")} help={kindHelp()} />
          <SelectMenu value={kind} onChange={(next) => setKind(next as "value" | "template")} ariaLabel={t("ed.c.vars.kind")} options={kindOptions()} className="w-full" menuClassName="w-[24rem] max-w-[90vw]" />
        </div>
        <div className="min-w-0">
          <FieldLabel text={kind === "template" ? t("ed.c.vars.template") : t("ed.c.vars.value")} required htmlFor={idValue} help={kind === "template" ? templateHelp() : undefined} />
          <Input id={idValue} value={text} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" placeholder={kind === "template" ? "[a-z0-9]{16}" : t("ed.c.vars.valuePlaceholder")} onChange={(event) => setText(event.target.value)} />
        </div>
        {full && <FieldError path={idName} message={t("ed.c.val.variablesMax", { max: MAX_VARIABLES })} />}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t("confirm.cancel")}</Button>
        <Button type="button" disabled={!ready} onClick={create}>{t("ed.c.newVar.create")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

/** `const { request, dialog } = useNewVariable(v)`: `request(insert)` opens the dialog, `insert(name)` is called after creating. */
export function useNewVariable(variantIndex: number) {
  const [insert, setInsert] = useState<((name: string) => void) | null>(null)
  return {
    request: (callback: (name: string) => void) => setInsert(() => callback),
    dialog: <NewVariableDialog variantIndex={variantIndex} open={insert !== null} onClose={() => setInsert(null)}
      onCreate={(name) => { const callback = insert; setInsert(null); callback?.(name) }} />,
  }
}
