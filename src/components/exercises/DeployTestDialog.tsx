"use client"

import { useEffect, useState } from "react"

import type { DeployFlag } from "@/api/exercises/deploy"
import type { TaskDTO } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { resolvePlaceholders } from "@/lib/placeholderResolve"
import { PopupBlockedError, useDeployTest } from "@/lib/useDeployTest"

type Props = {
  open: boolean
  onClose: () => void
  exerciseId: string
  versionId: string
  variantId: string
  tasks: TaskDTO[]
  /** Reopen a deploy that is already running instead of starting a new one. */
  attach?: { deployId: string; flags: DeployFlag[] }
}

/**
 * DeployTestDialog runs a variant's test deploy and renders its progress: a
 * spinner while the lab provisions, then each task's placeholders resolved to the
 * deployed lab's real values, the web-access buttons, and the tester's VPN config.
 * Closing (button, overlay, escape) tears the deploy down via the hook.
 */
export function DeployTestDialog({ open, onClose, exerciseId, versionId, variantId, tasks, attach }: Props) {
  const deploy = useDeployTest()

  useEffect(() => {
    if (open && attach) {
      deploy.attach(attach.deployId, attach.flags)
    } else if (open && variantId) {
      void deploy.start(exerciseId, versionId, variantId)
    }
    // deploy is a fresh closure each render; starting is keyed on open+variantId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variantId, exerciseId, versionId, attach?.deployId])

  function handleClose() {
    deploy.close()
    onClose()
  }

  const [copiedFlag, setCopiedFlag] = useState<string | null>(null)

  function copyFlag(key: string, flag: string) {
    void navigator.clipboard?.writeText(flag).then(() => {
      setCopiedFlag(key)
      setTimeout(() => setCopiedFlag((current) => (current === key ? null : current)), 1500)
    })
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
            error={deploy.errorCause}
            message={deploy.error ? t("admin.exDeploy.failedReason", { reason: exerciseErrorMessage(deploy.errorCause) }) : t("admin.exDeploy.failed")}
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
                        <li key={vi} className="break-all">
                          {v && /^https?:\/\//.test(v) && task.Placeholders?.[vi]?.AsLink
                            ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{v}</a>
                            : v || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {deploy.flags.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("admin.exDeploy.flags")}</div>
                <p className="text-xs text-muted-foreground">{t("admin.exDeploy.flagsHelp")}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {deploy.flags.map((f, i) => {
                    const key = f.TaskID || String(i)
                    return (
                      <li key={key} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate">{f.Name}</span>
                          <code className="block break-all font-mono text-xs">{f.Flag}</code>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={t("admin.exDeploy.copyFlag", { name: f.Name })}
                          onClick={() => copyFlag(key, f.Flag)}
                        >
                          {copiedFlag === key ? t("admin.exDeploy.copied") : t("admin.exDeploy.copy")}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {status?.Access && status.Access.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("admin.exDeploy.access")}</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {status.Access.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{a.Device} — {a.URL}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        busy={deploy.link === "opening" && deploy.linkKey === `${a.Device}:${a.Port}`}
                        disabled={deploy.link === "opening"}
                        onClick={() => deploy.openLink(a.Device, a.Port)}
                      >
                        {t("admin.exDeploy.open")}
                      </Button>
                    </li>
                  ))}
                </ul>
                {deploy.link === "error" && (
                  <LoadError
                    compact
                    message={deploy.linkError instanceof PopupBlockedError ? t("admin.exDeploy.linkPopupBlocked") : t("admin.exDeploy.linkFailed")}
                    error={deploy.linkError}
                    onRetry={deploy.retryLink}
                  />
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
  // wg-quick takes the interface name from the file name (<=15 chars).
  a.download = "cybericebox.conf"
  a.click()
  URL.revokeObjectURL(url)
}
