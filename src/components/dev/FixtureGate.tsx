"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Dev-only editor fixture mode (see src/dev/fixtures/install.ts). In a production build the condition below is a
 * compile-time false, so the dynamic import and everything behind it is dropped from the bundle; next.config.ts also
 * refuses to build with the flag set.
 */
const ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EDITOR_FIXTURES === "1"

export function FixtureGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!ENABLED)
  useEffect(() => {
    if (!ENABLED) return
    let cancelled = false
    void import("@/dev/fixtures/install").then((module) => {
      module.installFixtures()
      if (!cancelled) setReady(true)
    })
    return () => { cancelled = true }
  }, [])
  return ready ? <>{children}</> : null
}
