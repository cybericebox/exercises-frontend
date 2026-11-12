"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"
import type { LabCapabilities } from "@/api/exercises/capabilities"
import { labSupport, type LabKind, type LabSupport } from "@/lib/editor/labSupport"

const LabCapabilitiesContext = createContext<LabCapabilities | null>(null)

/** Gives the editor what the laboratories can run (null: older server or not loaded yet: nothing is disabled). */
export function LabCapabilitiesProvider({ value, children }: { value: LabCapabilities | null; children: ReactNode }) {
  return <LabCapabilitiesContext.Provider value={value}>{children}</LabCapabilitiesContext.Provider>
}

/** `const support = useLabSupport(); support({ access: "terminal" })` -> `{ state, reason }`. */
export function useLabSupport(): (kind: LabKind) => LabSupport {
  const caps = useContext(LabCapabilitiesContext)
  return useCallback((kind: LabKind) => labSupport(caps, kind), [caps])
}
