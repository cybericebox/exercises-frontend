import { useCallback, useEffect, useState } from "react"
import { getDeployDossier, type DeployDossier } from "@/api/exercises/deploy"
import { ApiError } from "@/api/client"

export type DossierState = { state: "idle" } | { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; dossier: DeployDossier }

/** While the lab is not ready the dossier answers 409: it is asked again after this long. */
const NOT_READY_RETRY_MS = 3000

/**
 * The defender's dossier of a ready test lab, read once per lab and kept only in the page's memory (it carries credentials).
 * A 409 (the lab is not ready yet) is asked again; any other failure is an error with a retry.
 */
export function useDossier(deployId: string | null, ready: boolean): DossierState & { retry: () => void } {
  const [value, setValue] = useState<DossierState>({ state: "idle" })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!deployId || !ready) return
    let cancelled = false
    let timer: number | undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the read starts with the lab becoming ready
    setValue((current) => current.state === "ready" ? current : { state: "loading" })
    getDeployDossier(deployId).then(
      (dossier) => { if (!cancelled) setValue({ state: "ready", dossier }) },
      (cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 409) { timer = window.setTimeout(() => setAttempt((n) => n + 1), NOT_READY_RETRY_MS); return }
        setValue({ state: "error", cause })
      },
    )
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer) }
  }, [deployId, ready, attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...value, retry }
}
