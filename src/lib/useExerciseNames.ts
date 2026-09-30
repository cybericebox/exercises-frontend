"use client"

import { useEffect, useState } from "react"

import { getExercise } from "@/api/exercises/catalog"

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
