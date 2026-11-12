"use client"

import { createContext, useContext, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * H12 — the one place of the «add» action: the right end of the sub-view row. Each view renders its action into it, so the
 * button stands in the same place on Схема, Пристрої, Зʼєднання and Змінні and never twice in a view.
 */
export const ActionsSlotContext = createContext<HTMLElement | null>(null)

export function InActionsSlot({ children }: { children: ReactNode }) {
  const slot = useContext(ActionsSlotContext)
  return slot ? createPortal(children, slot) : null
}
