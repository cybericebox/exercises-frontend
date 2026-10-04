"use client"

import { useEffect, useState } from "react"

import { getExercise } from "@/api/exercises/catalog"
import { getVersion } from "@/api/exercises/versions"

/** Exercise names by id, fetched once per id and kept; an id that fails to load stays unnamed. */
export function useExerciseNames(ids: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const wanted = [...new Set(ids)].filter((id) => id && names[id] === undefined).sort().join(",")
  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    for (const id of wanted.split(",")) {
      getExercise(id).then(
        (exercise) => { if (!cancelled) setNames((current) => ({ ...current, [id]: exercise.Name })) },
        () => undefined
      )
    }
    return () => { cancelled = true }
  }, [wanted])
  return names
}

type VersionRef = { DeployID: string; ExerciseID: string; VersionID: string; VariantID: string }

/** The 1-based number of each deploy's variant in its version, by deploy id; fetched once per version. */
export function useVariantNumbers(items: VersionRef[]): Record<string, number> {
  const [variants, setVariants] = useState<Record<string, string[]>>({})
  const wanted = [...new Set(items.map((item) => `${item.ExerciseID}|${item.VersionID}`))].filter((key) => variants[key] === undefined).sort().join(",")
  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    for (const key of wanted.split(",")) {
      const [exerciseId, versionId] = key.split("|")
      getVersion(exerciseId, versionId).then(
        (version) => { if (!cancelled) setVariants((current) => ({ ...current, [key]: version.Variants.map((variant) => variant.ID) })) },
        () => undefined
      )
    }
    return () => { cancelled = true }
  }, [wanted])
  const out: Record<string, number> = {}
  for (const item of items) {
    const at = variants[`${item.ExerciseID}|${item.VersionID}`]?.indexOf(item.VariantID) ?? -1
    if (at >= 0) out[item.DeployID] = at + 1
  }
  return out
}
