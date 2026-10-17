"use client"

import { createContext, useContext } from "react"

/** The saved exercise the editor works on; null while it is not saved yet. Attachments ask it for the hash pre-check; images for the registry checks. */
export const ExerciseIdContext = createContext<string | null>(null)

export const ExerciseIdProvider = ExerciseIdContext.Provider

export function useExerciseId(): string | null {
  return useContext(ExerciseIdContext)
}
