"use client"

import { useEffect } from "react"

import type { TaskDTO } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { resolvePlaceholders } from "@/lib/placeholderResolve"
import { useDeployTest } from "@/lib/useDeployTest"

type Props = {
  open: boolean
  onClose: () => void
  exerciseId: string
  versionId: string
  variantId: string
  tasks: TaskDTO[]
}

/**
 * DeployTestDialog runs a variant's test deploy and renders its progress: a
 * spinner while the lab provisions, then each task's placeholders resolved to the
 * deployed lab's real values, the web-access links, and the tester's VPN config.
 * Closing (button, overlay, escape) tears the deploy down via the hook.
 */
export function DeployTestDialog({ open, onClose, exerciseId, versionId, variantId, tasks }: Props) {
  const deploy = useDeployTest()

  useEffect(() => {
    if (open && variantId) {
      void deploy.start(exerciseId, versionId, variantId)
    }
    // deploy is a fresh closure each render; starting is keyed on open+variantId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variantId, exerciseId, versionId])

  function handleClose() {
    deploy.close()
    onClose()
  }

  const status = deploy.status
  const ready = status?.Ready ?? false
  const failed = status?.Phase === "Failed"

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.exDeploy.title")}</DialogTitle>
        </DialogHeader>

        {deploy.error || failed ? (
          <LoadError
            compact
            message={t("admin.exDeploy.failed")}
            onRetry={() => void deploy.start(exerciseId, versionId, variantId)}
          />
        ) : !ready ? (
          <LoadingArea
            compact
            label={t("admin.exDeploy.provisioning")}
            message={status?.Phase && status.Phase !== "Ready" ? status.Phase : t("admin.exDeploy.provisioning")}
          />
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {tasks.map((task, i) => {
              // ready === true (this branch) implies status is set.
              const values = resolvePlaceholders(task.Placeholders, status!)
              return (
                <div key={task.ID ?? i} className="rounded-md border p-3">
                  <div className="font-medium">{task.Name}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {t("admin.exDeploy.resolved")}
                  </div>
                  {values.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t("admin.exDeploy.noValues")}</div>
                  ) : (
                    <ul className="mt-1 space-y-0.5 font-mono text-sm">
                      {values.map((v, vi) => (
                        <li key={vi}>{v || "—"}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {status?.Access && status.Access.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("admin.exDeploy.access")}</div>
                {deploy.session === "error" ? (
                  <LoadError compact message={t("admin.exDeploy.sessionFailed")} error={deploy.sessionError} onRetry={deploy.retrySession} />
                ) : deploy.session !== "open" ? (
                  <LoadingArea compact label={t("admin.exDeploy.sessionOpening")} message={t("admin.exDeploy.sessionOpening")} />
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {status.Access.map((a, i) => (
                      <li key={i}>
                        <a href={a.URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {a.Device} — {a.URL}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {status?.VPNConfig && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("admin.exDeploy.vpnConfig")}
                </div>
                <textarea
                  readOnly
                  value={status.VPNConfig}
                  className="mt-1 h-32 min-h-32 w-full rounded-md border bg-muted p-2 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => downloadConfig(status.VPNConfig ?? "")}
                >
                  {t("admin.exDeploy.download")}
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t("admin.exDeploy.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function downloadConfig(cfg: string) {
  const blob = new Blob([cfg], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "tester.conf"
  a.click()
  URL.revokeObjectURL(url)
}
