"use client"

import { X } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { CheckMenu } from "@/components/ui/check-menu"
import { FieldLabel } from "@/components/ui/field-label"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { FieldError } from "../fieldErrors"
import { eligibleRequires, setSharedTaskValue } from "./taskShared"

/** «Відкривається після» — the tasks that must be solved first; several may be chosen, offered by name. */
export function RequiresSection({ variantIndex, taskIndex, disabled }: { variantIndex: number; taskIndex: number; disabled: boolean }) {
  const form = useFormContext<DraftFormValues>()
  const tasks = useWatch({ control: form.control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Requires`
  const task = tasks[taskIndex]
  const selected = task?.Requires ?? []
  const eligible = eligibleRequires(tasks, taskIndex)
  const nameOf = (position: number) => tasks[position]?.Name.trim() || t("ed.b.rail.numbered", { n: position + 1 })
  const set = (next: string[]) => setSharedTaskValue(form, taskIndex, "Requires", next)
  const toggle = (key: string, on: boolean) => {
    const keys = new Set(selected)
    if (on) keys.add(key); else keys.delete(key)
    set(tasks.filter((candidate) => keys.has(candidate.Key)).map((candidate) => candidate.Key))
  }
  const previous = taskIndex > 0 && selected.length === 0 && eligible.includes(taskIndex - 1) ? tasks[taskIndex - 1] : null
  return <section className="space-y-2" aria-labelledby={`${base}-title`}>
    <FieldLabel as="h4" id={`${base}-title`} text={t("ed.b.requires.title")} help={{ intro: [t("ed.b.requires.help1"), t("ed.b.requires.help2")], default: t("ed.b.requires.default") }} labelClassName="text-sm" />
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((key) => {
        const position = tasks.findIndex((candidate) => candidate.Key === key)
        const name = position >= 0 ? nameOf(position) : t("ed.b.requires.unknown")
        return <span key={key} className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 text-sm">
          <span className="max-w-56 truncate">{position >= 0 ? `${position + 1}. ${name}` : name}</span>
          {!disabled && <button type="button" aria-label={t("ed.b.requires.removeN", { name })} onClick={() => toggle(key, false)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="h-3 w-3" /></button>}
        </span>
      })}
      {selected.length === 0 && disabled && <span className="text-sm text-muted-foreground">{t("ed.b.requires.none")}</span>}
      {!disabled && <>
        <CheckMenu label={t("ed.b.requires.add")} values={selected} disabled={eligible.length === 0 && selected.length === 0} className="h-8 w-auto gap-2" menuClassName="min-w-72 max-h-72 overflow-y-auto" onToggle={toggle}
          options={eligible.map((position) => ({ value: tasks[position].Key, label: `${position + 1}. ${nameOf(position)}` }))} />
        {previous && <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => toggle(previous.Key, true)}>{t("ed.b.requires.afterPrevious")}</Button>}
      </>}
    </div>
    <RequiresErrors variantIndex={variantIndex} taskIndex={taskIndex} count={selected.length} />
  </section>
}

function RequiresErrors({ variantIndex, taskIndex, count }: { variantIndex: number; taskIndex: number; count: number }) {
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Requires`
  return <>
    <FieldError path={base} />
    {Array.from({ length: count }, (_, index) => <FieldError key={index} path={`${base}.${index}`} />)}
  </>
}
