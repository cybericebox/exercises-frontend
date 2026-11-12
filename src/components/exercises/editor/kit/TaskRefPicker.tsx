"use client"

import { Braces, Plus } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { taskRefOptions } from "./taskRefs"

/**
 * TaskRefPicker — the «Вставити значення» menu of a field that takes expected values: the answers of the variant's tasks
 * (by task NAME, never by key) and the variables of the schema. `onPick` gets the raw token (`{{task.<key>}}`,
 * `{{var.<name>}}`) to put into the text. Only tasks with an answer are offered: a state check has no answer to insert.
 * The menu keeps the focus of the field it belongs to, so the caret is not lost.
 */
export function TaskRefPicker({ variantIndex, onPick, disabled = false, className, excludeTaskKey, onNewVariable }: {
  variantIndex: number
  onPick: (token: string) => void
  disabled?: boolean
  className?: string
  /** A task that must not be offered (the task being edited, where it has no sense). */
  excludeTaskKey?: string
  /** Adds «Нова змінна схеми» to the menu: the owner opens its dialog and inserts the token of the new variable. */
  onNewVariable?: () => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const tasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const variables = useWatch({ control, name: `Variants.${variantIndex}.Topology.Variables` }) ?? []
  const answers = taskRefOptions(tasks.filter((task) => task.Check.Kind === "answer" && task.Key !== excludeTaskKey))
  const vars = variables.filter((variable) => variable.Name.trim() !== "")
  const label = t("ed.b.ref.insert")
  return <DropdownMenu>
    <HoverTooltip text={label}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={label} aria-haspopup="menu"
          onMouseDown={(event) => event.preventDefault()} className={cn("h-8 w-8 shrink-0", className)}>
          <Braces aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
    </HoverTooltip>
    <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto" onCloseAutoFocus={(event) => event.preventDefault()}>
      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t("ed.b.ref.answers")}</DropdownMenuLabel>
      {answers.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("ed.b.ref.noAnswers")}</p>}
      {answers.map((option) => <DropdownMenuItem key={option.key} onSelect={() => onPick(option.ref)}>
        <span className="min-w-0 truncate">{option.label}</span>
      </DropdownMenuItem>)}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t("ed.b.ref.variables")}</DropdownMenuLabel>
      {vars.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("ed.b.ref.noVariables")}</p>}
      {vars.map((variable) => <DropdownMenuItem key={variable.Name} onSelect={() => onPick(`{{var.${variable.Name}}}`)}>
        <span className="min-w-0 truncate">{t("ed.b.ref.variable", { name: variable.Name })}</span>
      </DropdownMenuItem>)}
      {onNewVariable && <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewVariable}><Plus aria-hidden="true" className="mr-2 h-4 w-4" />{t("ed.c.ref.newVariable")}</DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>
}
