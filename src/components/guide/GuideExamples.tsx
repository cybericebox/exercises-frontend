"use client"

import { useEffect, useState } from "react"
import { getImportExampleDocument, type ImportExampleDocument } from "@/api/exercises/archive"
import { LoadError } from "@/components/ui/load-error"
import { Segmented } from "@/components/ui/segmented"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { CopyButton } from "./CopyButton"

type Format = "yaml" | "json"
type State = { kind: "loading" } | { kind: "error"; cause: unknown } | { kind: "ready"; document: ImportExampleDocument }

/**
 * The full example task document, YAML and JSON tabs. It is fetched from the API (the real example/exercise.yaml
 * and its JSON form), so the guide never carries a copy that could drift.
 */
export function GuideExamples() {
  const [format, setFormat] = useState<Format>("yaml")
  const [state, setState] = useState<State>({ kind: "loading" })

  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    getImportExampleDocument()
      .then((document) => { if (active) setState({ kind: "ready", document }) })
      .catch((cause) => { if (active) setState({ kind: "error", cause }) })
    return () => { active = false }
  }, [attempt])

  const text = state.kind === "ready" ? (format === "yaml" ? state.document.Yaml : state.document.Json) : ""
  const formatLabel = t(`exercises.guide.examples.${format}`)
  return <div className="g-code" id="examples-code">
    <div className="g-code__bar">
      <Segmented value={format} onChange={(value) => setFormat(value as Format)} ariaLabel={t("exercises.guide.examples.format")}
        options={[{ value: "yaml", label: t("exercises.guide.examples.yaml") }, { value: "json", label: t("exercises.guide.examples.json") }]} />
      {state.kind === "ready" && <CopyButton key={format} text={text} label={t("exercises.guide.copy")} ariaLabel={t("exercises.guide.copyActive", { format: formatLabel })} />}
    </div>
    {state.kind === "ready" && <pre tabIndex={0}>{text}</pre>}
    {state.kind === "loading" && <div className="g-code__state"><LoadingArea className="h-full" label={t("exercises.guide.examples.loading")} /></div>}
    {state.kind === "error" && <div className="g-code__state"><LoadError className="h-full"
      message={exerciseErrorCode(state.cause) !== null ? exerciseErrorMessage(state.cause) : t("exercises.guide.examples.error")}
      error={state.cause} onRetry={() => { setState({ kind: "loading" }); setAttempt((n) => n + 1) }} /></div>}
  </div>
}
