"use client"

import { useState } from "react"

import { checkDeployFlag } from "@/api/exercises/deploy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { t } from "@/i18n/t"

type CheckState = "idle" | "checking" | "correct" | "wrong" | "error"

/** The author types the flag they found and asks the server; the expected value is never shown. */
export function TestFlagCheck({ deployId, taskId, taskName }: { deployId: string; taskId: string; taskName: string }) {
  const [flag, setFlag] = useState("")
  const [state, setState] = useState<CheckState>("idle")

  function check() {
    if (!flag || state === "checking") return
    setState("checking")
    checkDeployFlag(deployId, taskId, flag).then(
      (answer) => setState(answer.Correct ? "correct" : "wrong"),
      () => setState("error")
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={flag}
          aria-label={t("admin.exDeploy.flagInput", { name: taskName })}
          placeholder={t("admin.exDeploy.flagPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 font-mono"
          onChange={(event) => { setFlag(event.target.value); setState("idle") }}
          onKeyDown={(event) => { if (event.key === "Enter") check() }}
        />
        <Button type="button" variant="outline" size="sm" busy={state === "checking"} disabled={!flag}
          aria-label={t("admin.exDeploy.checkFlag", { name: taskName })} onClick={check}>
          {t("admin.exDeploy.check")}
        </Button>
      </div>
      {state === "correct" && <p role="status" className="mt-1 text-xs text-[var(--ib-ok)]">✓ {t("admin.exDeploy.correct")}</p>}
      {state === "wrong" && <p role="status" className="mt-1 text-xs text-destructive">✗ {t("admin.exDeploy.wrong")}</p>}
      {state === "error" && <p role="status" className="mt-1 text-xs text-destructive">{t("admin.exDeploy.checkFailed")}</p>}
    </div>
  )
}
