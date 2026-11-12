"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { taskRef } from "@/api/exercises/model"
import { deliveriesOfTask, type Delivery } from "@/lib/editor/refs"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

export type TaskRefOption = { key: string; label: string; /** The text inserted into a value: `{{task.<key>}}`. */ ref: string }

/**
 * References offered by task NAME («Відповідь на «Вхід»»), never by key: the key is not shown anywhere in the UI.
 * Package B owns this file's behaviour (seeded by the foundation); the signatures stay.
 */
export function taskRefOptions(tasks: { Key: string; Name: string }[]): TaskRefOption[] {
  return tasks.filter((task) => task.Key !== "").map((task) => ({ key: task.Key, label: t("ed.b.refAnswer", { name: task.Name.trim() || t("ed.b.unnamed") }), ref: taskRef(task.Key) }))
}

/** The places of the variant where the answer of a task reaches a device (empty when it is not delivered). */
export function useTaskDeliveries(variantIndex: number, taskKey: string): Delivery[] {
  const { control } = useFormContext<DraftFormValues>()
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  return topology ? deliveriesOfTask(topology, taskKey) : []
}
