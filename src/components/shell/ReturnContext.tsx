"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { resolveEventId, resolveReturnContext, type ReturnContext } from "@/lib/returnContext"

const EMPTY: ReturnContext = { returnUrl: null, eventId: null }
const Context = createContext<ReturnContext>(EMPTY)

/** Resolves ?return=/?event= (or the stored context) on every in-app navigation. */
export function ReturnContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [value, setValue] = useState<ReturnContext>(EMPTY)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const context = resolveReturnContext(search)
    const next = { returnUrl: context.returnUrl, eventId: resolveEventId(search, context) }
    queueMicrotask(() => setValue((current) =>
      current.returnUrl === next.returnUrl && current.eventId === next.eventId ? current : next))
  }, [pathname])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useReturnContext(): ReturnContext {
  return useContext(Context)
}
