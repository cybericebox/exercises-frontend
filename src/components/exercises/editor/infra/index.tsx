"use client"

import { InfrastructureBlockedNote } from "../../EventBanners"
import { useEditor } from "../context"
import { InfraWorkspace } from "./InfraWorkspace"

/** «Інфраструктура» of the current variant: schema, devices, connections and variables. */
export function InfraView() {
  const { infrastructureBlocked } = useEditor()
  if (infrastructureBlocked) return <InfrastructureBlockedNote />
  return <InfraWorkspace />
}
