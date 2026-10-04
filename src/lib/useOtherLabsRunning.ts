/**
 * useOtherLabsRunning — whether the user has more running test labs than the one about to end.
 * The author's labs share one VPN, so the end dialog may only promise «VPN stops» for the last one.
 * It starts from what the caller already knows and is corrected by the full list (the caller's
 * list may be one exercise's only); a failed fetch keeps the first answer.
 */
import { useEffect, useState } from "react"

import { listDeploys } from "@/api/exercises/deploy"

export function useOtherLabsRunning(deployId: string | null, knownCount: number): boolean {
  const [answer, setAnswer] = useState<{ deployId: string; others: boolean } | null>(null)
  useEffect(() => {
    if (!deployId) return
    let cancelled = false
    listDeploys().then(
      (items) => { if (!cancelled) setAnswer({ deployId, others: items.some((item) => item.DeployID !== deployId) }) },
      () => undefined
    )
    return () => { cancelled = true }
  }, [deployId])
  return answer?.deployId === deployId ? answer.others : knownCount > 1
}
