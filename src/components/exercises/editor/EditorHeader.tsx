"use client"

import { ExerciseHeader, type ExerciseHeaderProps } from "../ExerciseHeader"
import { useEditor } from "./context"

/** The page header with the editor's own «…» items (the document); the page passes everything else. */
export function EditorHeader(props: Omit<ExerciseHeaderProps, "onDocument">) {
  const { openDialog } = useEditor()
  return <ExerciseHeader {...props} onDocument={() => openDialog("document")} />
}
