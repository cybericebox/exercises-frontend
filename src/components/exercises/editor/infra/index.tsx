"use client"

import { InfrastructureBlockedNote } from "../../EventBanners"
import { TopologySection } from "../../TopologySection"
import { useEditor } from "../context"

/** «Інфраструктура» of the current variant (package C replaces the body: schema, tables, dialogs). */
export function InfraView() {
  const { variantIndex, disabled, baseIndex, infrastructureBlocked, resources } = useEditor()
  const linked = baseIndex >= 0
  if (infrastructureBlocked) return <InfrastructureBlockedNote />
  return <TopologySection variantIndex={variantIndex} disabled={disabled || linked} toolbar={resources}
    linkedBaseIndex={linked ? baseIndex : undefined} imagesEditable={linked && !disabled} />
}
