"use client"
import "@/styles/editor-a.css"

import { ExerciseGeneralFields } from "../../ExerciseGeneralFields"
import { ExerciseGeneralMetadata } from "../../ExerciseGeneralMetadata"
import { useEditor } from "../kit"

/** «Загальне» (C1): the fields in one column, the compact facts panel beside them on the same line. */
export function GeneralView() {
  const { form, page, disabled, showNotes } = useEditor()
  return <div className="editor-general">
    <ExerciseGeneralFields identityForm={page.identityForm} draftForm={form} disabled={disabled} readOnly={page.viewing} autoFocusName={page.autoFocusName} showNotes={showNotes} />
    {page.exercise && <ExerciseGeneralMetadata exercise={page.exercise} publishedVersion={page.publishedVersion} publishedAt={page.publishedAt}
      eventName={page.eventName} draftForm={form} status={page.status} resources={page.resources} usageEvents={page.usageEvents} />}
  </div>
}
