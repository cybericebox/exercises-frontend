/**
 * exerciseSchemas.ts — zod mirror of the domain validation for exercise versions
 * (inside the backend's internal/model/exercise) + editor form types and factories.
 *
 * Validation here catches errors BEFORE the request; the server is still authoritative.
 * The schemas describe DraftFormValues (form is close to SaveDraftInput; the differences are typed text for numbers,
 * kept halves of a switched kind and file/text modes, see lib/editor/schemas).
 *
 * The model is composed of two halves with their own owners:
 *  - lib/editor/schemas/task.ts   tasks: check (answer / state), requires, placeholders, hints  (package B)
 *  - lib/editor/schemas/infra.ts  topology: networks, devices, access, bootstrap, variables     (package C)
 * This file keeps what is shared (identity, variant, draft, serialization of the whole) and re-exports both halves,
 * so `@/lib/exerciseSchemas` stays the one import path for the form model.
 */
import { z } from "zod"
import { t } from "@/i18n/t"
import { linkedFlagConflicts, ownImages } from "@/lib/linkedVariants"
import { hintsAligned } from "@/lib/hintSync"
import type { NormalizedVariant, SaveDraftInput, VariantDTO, Version } from "@/api/exercises/versions"
import { deliveriesOfTask } from "@/lib/editor/refs"
import { TEMPLATE_PREFIX } from "@/lib/flagPattern"
import {
  emptyTask, refineVariantTasks, taskSchema, taskToDTO, taskToForm, type TaskFormValues,
} from "@/lib/editor/schemas/task"
import {
  emptyTopology, topologySchema, topologyToDTO, topologyToForm, type TopologyFormValues,
} from "@/lib/editor/schemas/infra"

export * from "@/lib/editor/schemas/task"
export * from "@/lib/editor/schemas/infra"

// ── Form types ─────────────────────────────────────────────────────────────────

export type VariantFormValues = Omit<NormalizedVariant, "Topology" | "Tasks"> & {
  /** Form-only: the stored variant this unsaved one was copied from; sent only when set. */
  CopyOf?: string
  Topology: TopologyFormValues
  Tasks: TaskFormValues[]
}
export type DraftFormValues = {
  AdminNote: string
  Variants: VariantFormValues[]
}

// ── identity ───────────────────────────────────────────────────────────────────

export const identitySchema = z.object({
  Name: z.string().trim().min(3, t("admin.ex.val.name")).max(50, t("admin.ex.val.name")),
  Description: z.string().max(2000, t("admin.ex.val.description")),
  Tags: z
    .array(z.string().trim().min(1, t("admin.ex.val.tag")).max(30, t("admin.ex.val.tag")))
    .max(20, t("admin.ex.val.tags")),
})
export type IdentityFormValues = z.infer<typeof identitySchema>

/** Daemon range of a variant's issue weight. */
export const MIN_VARIANT_WEIGHT = 1
export const MAX_VARIANT_WEIGHT = 100

const variantSchema = z.object({
  ID: z.string(),
  Index: z.number().int(),
  Note: z.string(),
  Weight: z.number({ error: t("admin.ex.val.weight", { max: MAX_VARIANT_WEIGHT }) }).int(t("admin.ex.val.weight", { max: MAX_VARIANT_WEIGHT }))
    .min(MIN_VARIANT_WEIGHT, t("admin.ex.val.weight", { max: MAX_VARIANT_WEIGHT })).max(MAX_VARIANT_WEIGHT, t("admin.ex.val.weight", { max: MAX_VARIANT_WEIGHT })),
  LinkedTo: z.string(),
  ImageOverrides: z.array(z.object({ DeviceID: z.string(), Image: z.string() })).optional(),
  CopyOf: z.string().optional(),
  Tasks: z.array(taskSchema).min(1, t("admin.ex.val.taskRequired")),
  Topology: topologySchema,
})

export const draftSchema = z
  .object({
    AdminNote: z.string(),
    Variants: z.array(variantSchema).min(1, t("admin.ex.val.variantRequired")),
  })
  .superRefine((draft, ctx) => {
    // Owner rule: within a base and its linked variants a fixed answer may not repeat per subtask.
    // The issue sits on the repeated value itself: the answer list shows per-value errors only.
    for (const { variantIndex, taskIndex, flagIndex } of linkedFlagConflicts(draft.Variants)) {
      ctx.addIssue({ code: "custom", path: ["Variants", variantIndex, "Tasks", taskIndex, "Check", "Answer", "Values", flagIndex], message: t("admin.ex.val.linkedFlagDuplicate") })
    }
    // Domain invariant ErrTaskCountMismatch: every variant has the same number of tasks.
    const expected = draft.Variants[0]?.Tasks.length ?? 0
    draft.Variants.forEach((variant, i) => {
      const nodes = new Set(variant.Topology.Devices.filter((device) => device.Type === "node").map((device) => device.ID))
      refineVariantTasks(i, variant.Tasks, nodes, ctx)
      variant.Tasks.forEach((task, taskIndex) => {
        // An answer the participant cannot be told inside the lab must be one fixed value (publish rule).
        if (task.Check.Kind === "answer" && (variant.LinkedTo === "" || task.Check.Answer.Values.length > 0)) {
          const values = task.Check.Answer.Values
          const many = values.length > 1 || values.some((value) => value.startsWith(TEMPLATE_PREFIX))
          if (many && deliveriesOfTask(variant.Topology, task.Key).length === 0) {
            ctx.addIssue({ code: "custom", path: ["Variants", i, "Tasks", taskIndex, "Check", "Answer", "Values"], message: t("ed.b.val.deliveryRequired") })
          }
        }
      })
      if (variant.Tasks.length !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["Variants", i, "Tasks"],
          message: t("admin.ex.val.taskCountMismatch"),
        })
      }
      if (i > 0) variant.Tasks.forEach((task, taskIndex) => {
        const canonical = draft.Variants[0].Tasks[taskIndex]
        if (canonical && !hintsAligned(task.Hints, canonical.Hints)) {
          ctx.addIssue({
            code: "custom",
            path: ["Variants", i, "Tasks", taskIndex, "Hints"],
            message: t("exercises.hints.val.mismatch"),
          })
        }
        if (canonical && task.Difficulty !== canonical.Difficulty) {
          ctx.addIssue({
            code: "custom",
            path: ["Variants", i, "Tasks", taskIndex, "Difficulty"],
            message: t("admin.ex.val.taskDifficultyMismatch"),
          })
        }
        // The kind of check and the answer type are the same in every variant.
        if (canonical && (task.Check.Kind !== canonical.Check.Kind || (task.Check.Kind === "answer" && task.Check.Answer.Type !== canonical.Check.Answer.Type))) {
          ctx.addIssue({ code: "custom", path: ["Variants", i, "Tasks", taskIndex, "Check", "Kind"], message: t("ed.b.val.checkKindMismatch") })
        }
      })
    })
  })

// ── Empty-value factories ────────────────────────────────────────────────────────

export function emptyVariant(index: number): VariantFormValues {
  return {
    ID: "",
    Index: index,
    Note: "",
    Weight: 1,
    LinkedTo: "",
    Tasks: [emptyTask()],
    Topology: emptyTopology(),
  }
}

export function emptyDraft(): DraftFormValues {
  return { AdminNote: "", Variants: [emptyVariant(1)] }
}

// ── Serialization: version → form → saveDraftRequest ────────────────────────────

/** Version (or null — no draft yet) → editor form values. */
export function toDraftFormValues(version: Version | null): DraftFormValues {
  if (!version) return emptyDraft()
  return {
    AdminNote: version.AdminNote,
    Variants: version.Variants.map((v, vi) => ({
      ID: v.ID,
      Index: v.Index,
      Note: v.Note ?? "",
      Weight: v.Weight ?? 1,
      LinkedTo: v.LinkedTo ?? "",
      ImageOverrides: v.ImageOverrides ?? [],
      Tasks: v.Tasks.map((task, ti) => taskToForm(task, vi, ti)),
      Topology: topologyToForm(v.Topology),
    })),
  }
}

export function isValidWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_VARIANT_WEIGHT && value <= MAX_VARIANT_WEIGHT
}

/** A linked variant's own images against its base (the full list; [] when none or the base is not in the form). */
function imageOverrides(variant: VariantFormValues, variants: VariantFormValues[]): { DeviceID: string; Image: string }[] {
  const base = variants.find((candidate) => candidate.ID !== "" && candidate.ID === variant.LinkedTo)
  return base ? ownImages(variant, base).map(({ DeviceID, Image }) => ({ DeviceID, Image })) : []
}

/** Form values → PUT /:id/draft (1:1, Index is renumbered by position). */
export function toSaveDraftInput(values: DraftFormValues): SaveDraftInput {
  const variants: VariantDTO[] = values.Variants.map((v, i) => ({
    ...(v.ID ? { ID: v.ID } : {}),
    Index: i + 1,
    ...(v.Note ? { Note: v.Note } : {}),
    // 1 is the default on the wire; an invalid value never leaves the form (the weight field keeps the last valid one).
    ...(isValidWeight(v.Weight) && v.Weight > 1 ? { Weight: v.Weight } : {}),
    ...(v.LinkedTo ? { LinkedTo: v.LinkedTo, ImageOverrides: imageOverrides(v, values.Variants) } : {}),
    // CopyOf is for a new variant only: once saved it has its own stored secrets.
    ...(v.CopyOf && !v.ID ? { CopyOf: v.CopyOf } : {}),
    Tasks: v.Tasks.map(taskToDTO),
    Topology: topologyToDTO(v.Topology),
  }))
  return {
    AdminNote: values.AdminNote,
    Variants: variants,
  }
}
