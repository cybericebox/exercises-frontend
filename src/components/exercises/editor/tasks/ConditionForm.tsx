"use client"

import { useState } from "react"
import { Plus, Trash2, TriangleAlert } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import { OBSERVATION_WIRE_KEY } from "@/api/exercises/model"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyCondition, type ConditionFormValues } from "@/lib/editor/schemas/task"
import { fieldId } from "../fieldErrors"
import { useLabSupport } from "../labCapabilities"
import { AreaControl, ChoiceControl, Field, ListControl, RefControl, TextControl } from "./fields"
import { CUSTOM_OPTIONAL, FILE_OPTIONAL, KIND_SPEC, choiceToTri, customRunsWithRights, triToChoice, type CondFieldSpec, type KindSpec } from "./conditionSpec"

type Stem = { kind: KindSpec; field: CondFieldSpec }
const msg = ({ kind, field }: Stem, suffix = "") => `ed.b.cond.${kind.stem}.${field.stem}${suffix}`

/** The «?» of a condition field: what it is, then its default or what an empty value means. */
function helpOf(stem: Stem) {
  return { intro: t(msg(stem, ".help")), default: stem.field.def ? t(msg(stem, ".def")) : undefined }
}

function optionsOf(stem: Stem): SelectMenuOption[] {
  const { field } = stem
  if (field.kind === "yn") return [{ value: "yes", label: t(msg(stem, ".yes")) }, { value: "no", label: t(msg(stem, ".no")) }]
  if (field.kind === "tri") return [{ value: "", label: t(msg(stem, ".none")) }, { value: "yes", label: t(msg(stem, ".yes")) }, { value: "no", label: t(msg(stem, ".no")) }]
  return (field.options ?? []).map((value) => ({ value, label: t(msg(stem, `.opt.${value}`)) }))
}

/** One field of a condition, wired to its form path with its label, «?» and error beside it. */
function CondField({ base, variantIndex, stem, disabled, onSelect }: { base: string; variantIndex: number; stem: Stem; disabled: boolean; onSelect?: (value: string) => void }) {
  const { field } = stem
  const form = useFormContext<DraftFormValues>()
  const path = `${base}.${field.key}`
  const label = t(msg(stem))
  const placeholder = field.ph ? t(msg(stem, ".ph")) : undefined
  const current = useWatch({ control: form.control, name: path as never }) as unknown
  const write = (value: unknown) => form.setValue(path as never, value as never, { shouldDirty: true, shouldValidate: true })
  let control
  if (field.kind === "yn") {
    control = <ChoiceControl path={path} ariaLabel={label} disabled={disabled} options={optionsOf(stem)} value={current === false ? "no" : "yes"} onChoose={(choice) => write(choice === "yes")} />
  } else if (field.kind === "tri") {
    control = <ChoiceControl path={path} ariaLabel={label} disabled={disabled} options={optionsOf(stem)} value={triToChoice((current as boolean | null) ?? null)} onChoose={(choice) => write(choiceToTri(choice))} />
  } else if (field.kind === "select") {
    const fallback = field.options?.[0] ?? ""
    control = <ChoiceControl path={path} ariaLabel={label} disabled={disabled} options={optionsOf(stem)} value={String(current || fallback)} onChoose={(value) => { write(value); onSelect?.(value) }} />
  } else if (field.kind === "list") {
    control = <ListControl path={path} ariaLabel={label} disabled={disabled} placeholder={placeholder} />
  } else if (field.picker) {
    control = <RefControl path={path} variantIndex={variantIndex} ariaLabel={label} disabled={disabled} placeholder={placeholder} />
  } else {
    control = <TextControl path={path} ariaLabel={label} disabled={disabled} placeholder={placeholder} mono={field.mono} inputMode={field.kind === "number" ? "numeric" : "text"} />
  }
  return <Field className="cond-cell" path={path} label={label} required={field.required} help={helpOf(stem)}>{control}</Field>
}

const GRID = "cond-grid"

/** Kinds with plain fields: directory, process, port, kernel parameter, request, permission. */
function PlainFields({ spec, base, variantIndex, condition, disabled }: { spec: KindSpec; base: string; variantIndex: number; condition: ConditionFormValues; disabled: boolean }) {
  const form = useFormContext<DraftFormValues>()
  const kindBase = `${base}.${OBSERVATION_WIRE_KEY[spec.kind]}`
  const tcp = spec.kind === "request" && condition.Request.Protocol === "tcp"
  const clearHttp = (value: string) => {
    if (spec.kind !== "request" || value !== "tcp") return
    for (const name of ["Method", "Path", "Status", "BodyContains", "BodyMatches"] as const) form.setValue(`${kindBase}.${name}` as never, "" as never, { shouldDirty: true })
  }
  return <div className={GRID}>
    {spec.fields.filter((field) => !(field.httpOnly && tcp)).map((field) => <CondField key={field.key} base={kindBase} variantIndex={variantIndex} stem={{ kind: spec, field }}
      disabled={disabled} onSelect={field.key === "Protocol" ? clearHttp : undefined} />)}
  </div>
}

/** The optional expectation of a file or a command: a labelled field with a cross. */
function Optional({ label, onRemove, disabled, children }: { label: string; onRemove: () => void; disabled: boolean; children: React.ReactNode }) {
  return <div className="cond-cell relative">
    {children}
    {!disabled && <HoverTooltip text={t("ed.b.cond.dropExpectation")} className="cond-drop">
      <button type="button" aria-label={`${t("ed.b.cond.dropExpectation")}: ${label}`} onClick={onRemove}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-primary"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
    </HoverTooltip>}
  </div>
}

const lowerFirst = (text: string) => (text ? text.charAt(0).toLocaleLowerCase("uk") + text.slice(1) : text)

type Chip = { name: string; label: string; /** The reason this expectation cannot be added (no laboratory runs it). */ unavailable?: string }

function Chips({ items, onAdd }: { items: Chip[]; onAdd: (name: string) => void }) {
  if (items.length === 0) return null
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("ed.b.cond.addExpectation")}>
    {items.map((item) => {
      const chip = <button type="button" aria-disabled={item.unavailable ? true : undefined} onClick={() => { if (!item.unavailable) onAdd(item.name) }}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-ring hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />{lowerFirst(item.label)}
      </button>
      return item.unavailable ? <HoverTooltip key={item.name} text={item.unavailable} describe="always">{chip}</HoverTooltip> : <span key={item.name}>{chip}</span>
    })}
  </div>
}

const without = (set: ReadonlySet<string>, key: string) => { const next = new Set(set); next.delete(key); return next }

/** A file: the path, then the expectations the author added. «Відсутній» hides and drops every other expectation. */
function FileFields({ base, variantIndex, condition, disabled }: { base: string; variantIndex: number; condition: ConditionFormValues; disabled: boolean }) {
  const form = useFormContext<DraftFormValues>()
  const support = useLabSupport()
  const spec = KIND_SPEC.file
  const o = condition.File
  const filled = (key: (typeof FILE_OPTIONAL)[number]) => (key === "Exists" ? o.Exists !== null : String(o[key]) !== "")
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set(FILE_OPTIONAL.filter(filled)))
  const absent = o.Exists === false
  const active = FILE_OPTIONAL.filter((key) => (filled(key) || added.has(key)) && (!absent || key === "Exists"))
  const free = absent ? [] : FILE_OPTIONAL.filter((key) => !active.includes(key))
  const kindBase = `${base}.File`
  const fieldOf = (key: string) => spec.fields.find((field) => field.key === key) as CondFieldSpec
  const set = (key: string, value: unknown) => form.setValue(`${kindBase}.${key}` as never, value as never, { shouldDirty: true, shouldValidate: true })
  function add(key: string) {
    setAdded((current) => new Set(current).add(key))
    if (key === "Exists") set("Exists", true)
    if (key === "Type") set("Type", "file")
    requestAnimationFrame(() => document.getElementById(fieldId(`${kindBase}.${key}`))?.focus())
  }
  function drop(key: string) {
    setAdded((current) => without(current, key))
    set(key, key === "Exists" ? null : "")
  }
  return <div className="space-y-3">
    <CondField base={kindBase} variantIndex={variantIndex} stem={{ kind: spec, field: fieldOf("Path") }} disabled={disabled} />
    {active.length > 0 && <div className={GRID}>
      {active.map((key) => {
        const stem = { kind: spec, field: fieldOf(key) }
        return <Optional key={key} label={t(msg(stem))} disabled={disabled} onRemove={() => drop(key)}>
          {key === "Exists"
            ? <Field path={`${kindBase}.Exists`} label={t(msg(stem))} help={helpOf(stem)}>
              <ChoiceControl path={`${kindBase}.Exists`} ariaLabel={t(msg(stem))} disabled={disabled} value={o.Exists === false ? "no" : "yes"}
                options={[{ value: "yes", label: t(msg(stem, ".yes")) }, { value: "no", label: t(msg(stem, ".no")), description: t(msg(stem, ".noHint")) }]}
                onChoose={(choice) => {
                  set("Exists", choice === "yes")
                  if (choice === "no") for (const name of ["Type", "Contains", "Matches", "Checksum", "Mode", "Owner", "Group"]) set(name, "")
                }} />
            </Field>
            : <CondField base={kindBase} variantIndex={variantIndex} stem={stem} disabled={disabled} />}
        </Optional>
      })}
    </div>}
    {!disabled && <Chips items={free.map((name) => {
      const lab = name === "Type" ? support({ observation: "file.type" }) : name === "Checksum" ? support({ observation: "file.checksum" }) : null
      return { name, label: t(msg({ kind: spec, field: fieldOf(name) })), unavailable: lab?.state === "disabled" ? lab.reason : undefined }
    })} onAdd={add} />}
  </div>
}

/** A command of the author: what runs, the interpreter and user, optional output rules, and a warning for higher rights. */
function CustomFields({ base, variantIndex, condition, disabled }: { base: string; variantIndex: number; condition: ConditionFormValues; disabled: boolean }) {
  const form = useFormContext<DraftFormValues>()
  const spec = KIND_SPEC.custom
  const o = condition.Custom
  const kindBase = `${base}.Custom`
  const filled = (key: (typeof CUSTOM_OPTIONAL)[number]) => String(o[key]) !== ""
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set(CUSTOM_OPTIONAL.filter(filled)))
  const active = CUSTOM_OPTIONAL.filter((key) => filled(key) || added.has(key))
  const free = CUSTOM_OPTIONAL.filter((key) => !active.includes(key))
  const fieldOf = (key: string) => spec.fields.find((field) => field.key === key) as CondFieldSpec
  const run = { kind: spec, field: fieldOf("Run") }
  const runPath = `${kindBase}.Run`
  return <div className="space-y-3">
    <Field path={runPath} label={t(msg(run))} required help={helpOf(run)}>
      <AreaControl path={runPath} ariaLabel={t(msg(run))} disabled={disabled} placeholder={t(msg(run, ".ph"))} />
    </Field>
    <div className={GRID}>
      {["Interpreter", "User"].map((key) => <CondField key={key} base={kindBase} variantIndex={variantIndex} stem={{ kind: spec, field: fieldOf(key) }} disabled={disabled} />)}
    </div>
    {customRunsWithRights(o.User) && <p role="status" id={`${fieldId(kindBase)}-warn`} className="flex items-start gap-1.5 text-xs text-amber-700">
      <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" /><span>{t("ed.b.cond.custom.rightsWarning")}</span>
    </p>}
    {active.length > 0 && <div className={GRID}>
      {active.map((key) => {
        const stem = { kind: spec, field: fieldOf(key) }
        return <Optional key={key} label={t(msg(stem))} disabled={disabled} onRemove={() => { setAdded((current) => without(current, key)); form.setValue(`${kindBase}.${key}` as never, "" as never, { shouldDirty: true }) }}>
          <CondField base={kindBase} variantIndex={variantIndex} stem={stem} disabled={disabled} />
        </Optional>
      })}
    </div>}
    {!disabled && <Chips items={free.map((name) => ({ name, label: t(msg({ kind: spec, field: fieldOf(name) })) }))} onAdd={(name) => {
      setAdded((current) => new Set(current).add(name))
      requestAnimationFrame(() => document.getElementById(fieldId(`${kindBase}.${name}`))?.focus())
    }} />}
  </div>
}

/** The fields of a condition's kind: exactly the keys of the schema. */
export function ConditionFields({ base, variantIndex, condition, disabled }: { base: string; variantIndex: number; condition: ConditionFormValues; disabled: boolean }) {
  if (condition.Kind === "file") return <FileFields base={base} variantIndex={variantIndex} condition={condition} disabled={disabled} />
  if (condition.Kind === "custom") return <CustomFields base={base} variantIndex={variantIndex} condition={condition} disabled={disabled} />
  return <PlainFields spec={KIND_SPEC[condition.Kind]} base={base} variantIndex={variantIndex} condition={condition} disabled={disabled} />
}

/** Switches the kind of a condition; every kind keeps what was typed in it, only the chosen one is saved. */
export function withKind(condition: ConditionFormValues, kind: ConditionFormValues["Kind"]): ConditionFormValues {
  if (kind === condition.Kind) return condition
  const fresh = emptyCondition(kind, condition.DeviceID)
  const key = OBSERVATION_WIRE_KEY[kind]
  return { ...condition, Kind: kind, [key]: condition[key] ?? fresh[key] }
}
