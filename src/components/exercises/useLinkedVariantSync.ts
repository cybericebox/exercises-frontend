"use client"

import { useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { dependentsOf, syncLinkedVariants } from "@/lib/linkedVariants"

const VARIANT_PATH = /^Variants\.(\d+)(?:\.|$)/

/**
 * Live mirror: an edit of a base variant is copied at once into its linked variants
 * (their own flags, files and note stay). Acts only for edits under a variant that has
 * dependents, or for the Variants list itself (add/remove). The autosave queue picks the
 * change up through its own form watch; the server re-syncs on save anyway.
 */
export function useLinkedVariantSync(form: UseFormReturn<DraftFormValues>, enabled: boolean): void {
  const applying = useRef(false)
  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/incompatible-library -- Imperative form subscription; React Compiler must not memoize this effect.
    const subscription = form.watch((_, { name }) => {
      if (applying.current || !name) return
      const variants = form.getValues("Variants")
      let candidates: number[]
      if (name === "Variants") {
        candidates = variants.map((__, index) => index)
      } else {
        const match = VARIANT_PATH.exec(name)
        if (!match) return
        const changed = variants[Number(match[1])]
        if (!changed || changed.LinkedTo) return
        candidates = dependentsOf(variants, changed.ID)
        if (candidates.length === 0) return
      }
      const synced = syncLinkedVariants(variants)
      applying.current = true
      try {
        for (const index of candidates) {
          if (JSON.stringify(synced[index]) !== JSON.stringify(variants[index])) {
            // Trade-off: a whole-variant setValue regenerates the nested field-array ids of that
            // variant, which would remount its open subtask form. Acceptable: a base is edited in
            // its own tab and inactive variant tabs are unmounted.
            form.setValue(`Variants.${index}`, synced[index], { shouldDirty: true })
          }
        }
      } finally {
        applying.current = false
      }
    })
    return () => subscription.unsubscribe()
  }, [form, enabled])
}
