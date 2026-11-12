"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { useMediaQuery } from "@/components/shell/useMediaQuery"
import "@/styles/editor-tasks.css"
import { useEditorPosition } from "../../EditorPosition"
import { useEditor } from "../context"
import { TaskFormView } from "./TaskFormView"
import { TaskRail } from "./TaskRail"
import { useTaskList } from "./taskList"


/**
 * «Підзавдання» of the current variant: the rail on the left (number, name, kind of check, «після N»; it does not scroll
 * with the form) and the form of the selected subtask. A linked variant takes the subtasks from its base: no adding,
 * moving or removing here.
 */
export function TasksView() {
  const { variantIndex, disabled, baseIndex } = useEditor()
  const { fields, rows, add, moveTo, removeAt, dependentsOf } = useTaskList(variantIndex)
  const [selected, setSelected] = useEditorPosition("task")
  const [removing, setRemoving] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // A phone shows the subtasks as one select instead of the rail beside the form.
  const phone = useMediaQuery("(max-width: 639px)", false)
  const editable = !disabled && baseIndex < 0
  const active = Math.min(selected, Math.max(fields.length - 1, 0))

  if (fields.length === 0) {
    return <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <EmptyState message={t("ed.b.rail.empty")} />
      {editable && <Button type="button" variant="outline" size="sm" onClick={() => setSelected(add())}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("ed.b.rail.add")}</Button>}
    </div>
  }
  const removingTask = removing === null ? null : rows[removing]
  const dependents = removing === null ? [] : dependentsOf(removing)
  return <section className="subtasks">
    <TaskRail rows={rows} selected={active} onSelect={setSelected} editable={editable} phone={phone}
      onAdd={() => setSelected(add())} onMove={(from, to) => { moveTo(from, to); setSelected(to) }} onRemove={setRemoving} />
    <div key={fields[active].id} className="subtasks-pane">
      <TaskFormView variantIndex={variantIndex} taskIndex={active} />
    </div>
    <ConfirmDialog open={removing !== null} tone="danger" busy={busy} onCancel={() => setRemoving(null)}
      title={t("ed.b.rail.removeTitle", { name: removingTask?.Name.trim() || t("ed.b.unnamed") })}
      description={`${t("ed.b.rail.removeDescription")}${dependents.length ? ` ${t("ed.b.rail.removeDependents", { names: dependents.map((name) => `«${name}»`).join(", ") })}` : ""}`}
      confirmLabel={t("ed.b.rail.remove")} busyLabel={t("ed.b.rail.removing")}
      onConfirm={() => {
        if (removing === null) return
        setBusy(true)
        removeAt(removing)
        setSelected(Math.max(0, Math.min(active, fields.length - 2)))
        setBusy(false)
        setRemoving(null)
      }} />
  </section>
}
