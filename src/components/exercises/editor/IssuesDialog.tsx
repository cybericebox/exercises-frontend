"use client"

import { CircleAlert } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEditor } from "./context"

/**
 * «Перед публікацією виправте» / «Тест може не запуститися»: one line per invalid field with «Перейти». The list only
 * navigates; each message also sits beside its own field.
 */
export function IssuesDialog() {
  const { issues, closeDialog, goToField } = useEditor()
  if (!issues) return null
  const test = issues.mode === "test"
  const go = (path: PropertyKey[]) => { closeDialog(); goToField(path) }
  return <Dialog open onOpenChange={(next) => { if (!next) closeDialog() }}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{t(test ? "ed.shell.issues.titleTest" : "ed.shell.issues.titlePublish")}</DialogTitle>
        <DialogDescription>{t(test ? "ed.shell.issues.descTest" : "ed.shell.issues.descPublish", { n: issues.issues.length })}</DialogDescription>
      </DialogHeader>
      <ul className="-m-1 flex max-h-[50dvh] list-none flex-col gap-2 overflow-y-auto p-1">
        {issues.issues.map((issue) => <li key={`${issue.path.join(".")}|${issue.message}`} className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span className="break-words">{issue.text}</span>
          </span>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => go(issue.path)}>{t("ed.shell.issues.go")}</Button>
        </li>)}
      </ul>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={closeDialog}>{t("ed.ui.close")}</Button>
        {test && issues.onRunAnyway && <Button type="button" onClick={() => { const run = issues.onRunAnyway; closeDialog(); run?.() }}>{t("ed.shell.issues.runAnyway")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
