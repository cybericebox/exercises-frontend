"use client"

import { TaskAccordion } from "../../TaskAccordion"
import { useEditor } from "../context"

/** «Підзавдання» of the current variant (package B replaces the body: rail + form, checks, hints, files). */
export function TasksView() {
  const { variantIndex, disabled, baseIndex } = useEditor()
  return <TaskAccordion variantIndex={variantIndex} disabled={disabled} linked={baseIndex >= 0} />
}
