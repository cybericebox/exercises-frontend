"use client"

import { createContext, useContext, type ReactNode } from "react"

const GatewayLimitContext = createContext<number | null>(null)

/** The platform limit of gateways per lab (capabilities.MaxLabGateways); null while it is not known: nothing is limited then. */
export function GatewayLimitProvider({ value, children }: { value: number | null; children: ReactNode }) {
  return <GatewayLimitContext.Provider value={value}>{children}</GatewayLimitContext.Provider>
}

export const useMaxLabGateways = (): number | null => useContext(GatewayLimitContext)
