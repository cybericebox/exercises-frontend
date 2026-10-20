"use client"

import {useEffect, useState} from "react"
import {installChunkRecovery} from "@/lib/chunkRecovery"

/** Forward asynchronous chunk failures into Next's existing shared error screen. */
export function ChunkRecovery() {
  const [failure, setFailure] = useState<Error | null>(null)
  useEffect(() => installChunkRecovery(window).subscribe(setFailure), [])
  if (failure) throw failure
  return null
}
