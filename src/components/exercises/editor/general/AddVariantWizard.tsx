"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ListPlus, RefreshCw, X } from "lucide-react"
import { useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import "@/styles/editor-a.css"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { uploadExerciseAttachment } from "@/api/exercises/files"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { baseCandidates } from "@/lib/linkedVariants"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { FieldLabel, SelectMenu, SwitchList, useEditor, type HelpContent } from "../kit"
import { duplicateVariantAt } from "./variantsModel"
import { useReturnFocus } from "./useReturnFocus"
import {
  PRESETS, WIZARD_MAX_COUNT, answerError, baseInfo, buildEmpty, buildLinked, defaultPreset, fileError, firstError, imageError, insertionPoint, isLinkedPreset,
  generatedFlag, nodeDevices, nothingOwn, ownAnswers, parseCount, parseWeight, presetBlocked, presetOwn, syncFill,
  type Fill, type Own, type PresetId,
} from "./wizardModel"

type Upload = { key: string; name: string; percent: number }

const fieldHelp = (key: string): HelpContent => ({ intro: t(`ed.a.wizard.help.${key}.intro`), default: t(`ed.a.wizard.help.${key}.default`) })

/**
 * «Додати варіант»: at most two steps built on presets (F5, H11). Step 1 picks the preset; «Копія варіанта» and «Порожній
 * варіант» have no second step. For the three presets that differ, step 2 is one list (tasks or devices): a check box per
 * row, and the field for the new value (answer, image) appears in that same row; files expand directly under their row.
 */
export function AddVariantWizard({ onClose }: { onClose: () => void }) {
  const { form, exerciseId, variantIndex, selectVariant, goTo } = useEditor()
  const variants = useWatch({ control: form.control, name: "Variants" }) as DraftFormValues["Variants"]
  const candidates = useMemo(() => baseCandidates(variants), [variants])
  const linkedAvailable = candidates.length > 0

  const [initial] = useState(() => {
    const current = variants[variantIndex]
    const currentBase = current?.LinkedTo ? variants.findIndex((candidate) => candidate.ID !== "" && candidate.ID === current.LinkedTo) : variantIndex
    const base = candidates.includes(currentBase) ? currentBase : candidates[0] ?? 0
    const preset: PresetId = linkedAvailable ? defaultPreset(variants[base]) : "copy"
    return { base, preset }
  })
  const [step, setStep] = useState<1 | 2>(1)
  const [preset, setPreset] = useState<PresetId>(initial.preset)
  const [base, setBase] = useState(initial.base)
  const [src, setSrc] = useState(variantIndex)
  const [countText, setCountText] = useState("1")
  const [weightText, setWeightText] = useState("1")
  const [own, setOwn] = useState<Own>(() => linkedAvailable ? presetOwn(initial.preset, variants[initial.base]) : { ans: {}, files: {}, img: {} })
  const [fills, setFills] = useState<Fill[]>([])
  const [tried, setTried] = useState(false)
  const [emptyOwn, setEmptyOwn] = useState(false)
  const [paste, setPaste] = useState<number | null>(null)
  const [pasteText, setPasteText] = useState("")
  const [uploads, setUploads] = useState<Upload[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const returnFocus = useReturnFocus("editor-variant-trigger")
  const controllers = useRef(new Set<AbortController>())
  useEffect(() => {
    const running = controllers.current
    return () => { for (const controller of running) controller.abort() }
  }, [])

  const baseVariant = variants[base]
  const linked = isLinkedPreset(preset)
  const blocked = linked && baseVariant ? presetBlocked(preset, baseVariant) : false
  const needsFill = linked && !blocked
  const count = parseCount(countText)
  const weight = parseWeight(weightText)
  const countError = linked && count === null ? t("ed.a.wizard.val.count", { max: WIZARD_MAX_COUNT }) : ""
  const weightError = linked && weight === null ? t("ed.a.wizard.val.weight") : ""
  const info = baseVariant ? baseInfo(baseVariant) : { free: [], delivered: [], files: [] }
  const uploading = uploads.length > 0
  const uploadPercent = uploading ? Math.min(...uploads.map((upload) => upload.percent)) : 0
  const dirty = step === 2 && fills.some((fill) => Object.values(fill.ans).some((value) => value && !/^ICE\{[0-9a-f]{16}\}$/.test(value)) || Object.values(fill.files).some((list) => list.length > 0) || Object.values(fill.img).some(Boolean))

  function choosePreset(next: PresetId) {
    setPreset(next)
    setFills([])
    setEmptyOwn(false)
    if (isLinkedPreset(next) && baseVariant) setOwn(presetOwn(next, baseVariant))
  }
  function chooseBase(index: number) {
    setBase(index)
    setFills([])
    setOwn(presetOwn(preset, variants[index]))
  }
  function tick(kind: "task" | "device", key: number | string, on: boolean) {
    const next: Own = { ans: { ...own.ans }, files: { ...own.files }, img: { ...own.img } }
    if (kind === "device") next.img[key as string] = on
    else {
      const position = key as number
      const task = baseVariant.Tasks[position]
      if (preset === "files") {
        next.files[position] = on && task.Attachments.length > 0
        next.ans[position] = on && task.Check.Kind === "answer" && !info.delivered.includes(position)
      } else next.ans[position] = on
    }
    setOwn(next)
    setEmptyOwn(false)
    setFills(syncFill(baseVariant, next, count ?? 1, fills))
  }

  function next() {
    if (!linked) return create()
    if (countError || weightError || blocked) { focus(countError ? "wz-count" : "wz-weight"); return }
    if (!needsFill) return create()
    setFills(syncFill(baseVariant, own, count ?? 1, fills))
    setTried(false)
    setPaste(null)
    setStep(2)
  }

  function focus(id: string) {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0)
  }

  function finish(firstAt: number, created: number) {
    selectVariant(firstAt)
    toast.success(t(created > 1 ? "ed.a.wizard.createdMany" : "ed.a.wizard.created", { n: firstAt + 1, count: created }))
    onClose()
  }

  function create() {
    const current = form.getValues("Variants")
    if (preset === "copy") {
      const result = duplicateVariantAt(current, src)
      form.setValue("Variants", result.variants, { shouldDirty: true })
      return finish(result.at, 1)
    }
    if (preset === "empty") {
      form.setValue("Variants", [...current, buildEmpty(current.length)], { shouldDirty: true })
      return finish(current.length, 1)
    }
    if (countError || weightError || weight === null || count === null) { setStep(1); focus(countError ? "wz-count" : "wz-weight"); return }
    if (nothingOwn(own)) { setStep(2); setEmptyOwn(true); setFills(syncFill(baseVariant, own, count, fills)); return }
    const typed = step === 1 ? syncFill(baseVariant, own, count, fills) : fills
    setTried(true)
    const bad = firstError(current, base, own, typed, true)
    if (bad) { setFills(typed); setStep(2); focus(bad); return }
    const created = buildLinked(current, base, own, typed, weight)
    const at = insertionPoint(current, base)
    form.setValue("Variants", [...current.slice(0, at), ...created, ...current.slice(at)], { shouldDirty: true })
    finish(at, created.length)
  }

  function setAnswer(k: number, position: number, value: string) {
    setFills((current) => current.map((fill, index) => index === k ? { ...fill, ans: { ...fill.ans, [position]: value } } : fill))
  }
  function setImage(k: number, id: string, value: string) {
    setFills((current) => current.map((fill, index) => index === k ? { ...fill, img: { ...fill.img, [id]: value } } : fill))
  }
  function regenerate(k: number, position: number) {
    const taken = new Set(fills.map((fill) => fill.ans[position]))
    const value = generatedFlag(taken)
    setAnswer(k, position, value)
  }
  async function addFiles(k: number, position: number, list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const controller = new AbortController()
      controllers.current.add(controller)
      const key = `${k}-${position}-${file.name}-${Math.random()}`
      setUploadError(null)
      setUploads((current) => [...current, { key, name: file.name, percent: 0 }])
      try {
        const uploaded = await uploadExerciseAttachment(exerciseId, file, (percent) => setUploads((current) => current.map((upload) => upload.key === key ? { ...upload, percent } : upload)), controller.signal)
        if (controller.signal.aborted) continue
        setFills((current) => current.map((fill, index) => index === k ? { ...fill, files: { ...fill.files, [position]: [...(fill.files[position] ?? []), { FileID: uploaded.FileID, Name: uploaded.Name }] } } : fill))
      } catch (error) {
        if (!controller.signal.aborted) setUploadError(exerciseErrorMessage(error))
      } finally {
        controllers.current.delete(controller)
        setUploads((current) => current.filter((upload) => upload.key !== key))
      }
    }
  }
  function removeFile(k: number, position: number, index: number) {
    setFills((current) => current.map((fill, other) => other === k ? { ...fill, files: { ...fill.files, [position]: (fill.files[position] ?? []).filter((_, i) => i !== index) } } : fill))
  }
  function applyPaste() {
    if (paste === null) return
    const lines = pasteText.split("\n").map((line) => line.trim()).filter(Boolean)
    setFills((current) => current.map((fill, k) => lines[k] === undefined ? fill : { ...fill, ans: { ...fill.ans, [paste]: lines[k] } }))
    if (lines.length !== fills.length) toast.warning(t("ed.a.wizard.pasteMismatch", { lines: lines.length, count: fills.length }))
    setPaste(null)
    setPasteText("")
  }
  function addValue(position: number) {
    onClose()
    goTo({ tab: "tasks", variant: base, task: position })
    toast.success(t("ed.a.wizard.addValueDone"))
  }
  function requestClose() {
    if (uploading) return
    if (dirty) setDiscard(true)
    else onClose()
  }

  const first = variants.length + 1
  const multi = fills.length > 1
  const tag = (k: number) => multi ? <span aria-hidden="true" className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-muted px-1 text-xs tabular-nums text-muted-foreground">{first + k}</span> : null

  const presetLabel = (id: PresetId) => t(`ed.a.wizard.preset.${id}`)
  const dependent = (id: PresetId) => {
    if (id !== preset) return null
    if (linked) return <>{!blocked && <div className="ed-wz-dep" id="wz-deps">
      <div className="min-w-0 w-[340px] max-w-full"><FieldLabel className="pointer-coarse:min-h-8" text={t("ed.a.wizard.base")} required htmlFor="wz-base" help={fieldHelp("base")} />
        <SelectMenu id="wz-base" ariaLabel={t("ed.a.wizard.base")} className="w-full" value={String(base)} onChange={(value) => chooseBase(Number(value))}
          options={candidates.map((index) => ({ value: String(index), label: t("ed.a.wizard.variantN", { n: index + 1 }), description: variants[index].Note || undefined }))} /></div>
      <div className="w-[190px] max-w-full"><FieldLabel className="pointer-coarse:min-h-8" text={t("ed.a.wizard.count")} required htmlFor="wz-count" help={fieldHelp("count")} />
        <Input id="wz-count" type="number" inputMode="numeric" min={1} max={WIZARD_MAX_COUNT} value={countText} aria-invalid={countError ? true : undefined} aria-describedby={countError ? "wz-count-error" : undefined}
          onChange={(event) => { setCountText(event.target.value); const parsed = parseCount(event.target.value); if (parsed !== null) setFills((current) => syncFill(baseVariant, own, parsed, current).map((fill, index) => ({ ...fill, weight: current[index]?.weight }))) }} />
        {countError && <p id="wz-count-error" role="alert" className="mt-1 text-xs text-destructive">{countError}</p>}</div>
      <div className="w-[190px] max-w-full"><FieldLabel className="pointer-coarse:min-h-8" text={t("ed.a.wizard.weight")} required htmlFor="wz-weight" help={{ intro: t("ed.a.wizard.help.weight.intro"), items: [{ term: t("ed.a.wizard.help.weight.allowed"), text: t("ed.a.wizard.help.weight.allowedText") }], default: t("ed.a.wizard.help.weight.default") }} />
        <Input id="wz-weight" type="number" inputMode="numeric" min={1} max={100} value={weightText} aria-invalid={weightError ? true : undefined} aria-describedby={weightError ? "wz-weight-error" : undefined}
          onChange={(event) => setWeightText(event.target.value)} />
        {weightError && <p id="wz-weight-error" role="alert" className="mt-1 text-xs text-destructive">{weightError}</p>}</div>
    </div>}{answersNotice && <div className="ed-wz-dep">{answersNotice}</div>}</>
    if (id === "copy") return <div className="ed-wz-dep" id="wz-deps">
      <div className="min-w-0 w-[340px] max-w-full"><FieldLabel className="pointer-coarse:min-h-8" text={t("ed.a.wizard.source")} htmlFor="wz-src" help={fieldHelp("source")} />
        <SelectMenu id="wz-src" ariaLabel={t("ed.a.wizard.source")} className="w-full" value={String(src)} onChange={(value) => setSrc(Number(value))}
          options={variants.map((variant, index) => ({ value: String(index), label: t("ed.a.wizard.variantN", { n: index + 1 }), description: variant.LinkedTo ? t("ed.a.variants.basedOn", { base: variants.findIndex((candidate) => candidate.ID !== "" && candidate.ID === variant.LinkedTo) + 1 }) : variant.Note || undefined }))} /></div>
    </div>
    return null
  }

  const answersNotice = preset === "answers" && linked ? (
    info.free.length === 0
          ? <div role="status" id="wz-notice" className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <span>{t("ed.a.wizard.notNeeded")}</span>
            <div><Button type="button" size="sm" onClick={() => addValue(info.delivered[0] ?? 0)}>{t("ed.a.wizard.addValue")}</Button></div>
          </div>
          : info.delivered.length > 0 && <p id="wz-notice" className="text-xs text-muted-foreground">
            {t("ed.a.wizard.deliveredNote", { tasks: info.delivered.map((position) => `«${baseVariant.Tasks[position].Name}»`).join(", ") })}{" "}
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => addValue(info.delivered[0])}>{t("ed.a.wizard.addValue")}</Button>
          </p>
  ) : null

  const step1 = <>
    <div role="radiogroup" aria-label={t("ed.a.wizard.which")} id="wz-presets" className="flex flex-col gap-1">
      <SwitchList className="gap-1">
        {PRESETS.map((item) => {
          const disabled = isLinkedPreset(item.id) && !linkedAvailable
          const selected = item.id === preset
          return <div key={item.id} className="min-w-0">
            <button type="button" role="radio" id={`wz-p-${item.id}`} aria-checked={selected} disabled={disabled} tabIndex={selected ? 0 : -1} onClick={() => choosePreset(item.id)}
              onKeyDown={(event) => {
                const ids = PRESETS.filter((candidate) => !(isLinkedPreset(candidate.id) && !linkedAvailable)).map((candidate) => candidate.id)
                const index = ids.indexOf(item.id)
                const move = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0
                if (!move) return
                event.preventDefault()
                const target = ids[(index + move + ids.length) % ids.length]
                choosePreset(target)
                focus(`wz-p-${target}`)
              }}
              className={cn("flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60", selected ? "border-primary bg-accent/50" : "border-border")}>
              {/* The mark column is reserved; only the chosen option draws its dot. */}
              <span aria-hidden="true" className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center">{selected && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{presetLabel(item.id)}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">{disabled ? t("ed.a.wizard.needsSaved") : t(`ed.a.wizard.presetSub.${item.id}`)}</span>
              </span>
            </button>
            {selected && !disabled && dependent(item.id)}
          </div>
        })}
      </SwitchList>
    </div>
  </>

  const answerErrorText = (code: string, type: string) => code === "required" ? t(type === "flag" ? "ed.a.wizard.val.flag" : "ed.a.wizard.val.answer")
    : code === "taken" ? t("ed.a.wizard.val.taken") : code === "twice" ? t("ed.a.wizard.val.twice") : code

  const step2Tasks = () => {
    const rows = baseVariant.Tasks.map((task, position) => ({ task, position })).filter(({ task }) => preset === "files" ? task.Check.Kind === "answer" || task.Attachments.length > 0 : task.Check.Kind === "answer")
    if (rows.length === 0) return <li className="p-3 text-sm text-muted-foreground">{t("ed.a.wizard.noRows")}</li>
    return rows.map(({ task, position }) => {
      const answer = task.Check.Kind === "answer" ? task.Check.Answer : null
      const delivered = info.delivered.includes(position)
      const on = preset === "files" ? Boolean(own.files[position] || own.ans[position]) : Boolean(own.ans[position])
      const disabled = preset === "answers" && delivered
      const currentValue = answer ? (answer.Values[0] ? answer.Values[0].replace(/^template:/, "") + (answer.Values.length > 1 ? ` · ${t("ed.a.wizard.more", { n: answer.Values.length - 1 })}` : "") : t("ed.a.wizard.random")) : ""
      const current = [currentValue, task.Attachments.length > 0 ? t("ed.a.wizard.filesOf", { names: task.Attachments.map((file) => file.Name).join(", ") }) : ""].filter(Boolean).join(" · ")
      return <li key={position} className="border-b border-border last:border-b-0">
        <div className="ed-wz-row">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Checkbox id={`wz-t-${position}`} checked={on} disabled={disabled} label={<span className="font-medium">{task.Name || t("ed.a.wizard.taskN", { n: position + 1 })}</span>} onChange={(event) => tick("task", position, event.target.checked)} />
            {disabled && <span className="pl-6 text-xs text-muted-foreground">{t("ed.a.wizard.delivered")}</span>}
          </div>
          <span className="min-w-0 break-words text-xs text-muted-foreground">{current || "—"}</span>
          <div className="flex min-w-0 flex-col gap-2">
            {on && own.ans[position] && answer ? fills.map((fill, k) => {
              const code = answerError(variants, base, fills, k, position, tried)
              const id = `wz-a-${k}-${position}`
              return <div key={k} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">{tag(k)}
                  <Input id={id} value={fill.ans[position] ?? ""} className={cn("min-w-0", answer.Type === "flag" && "font-mono")} spellCheck={false} autoComplete="off"
                    placeholder={answer.Type === "flag" ? "ICE{…}" : t("ed.a.wizard.answerPlaceholder")} aria-label={t("ed.a.wizard.newAnswer", { n: first + k })}
                    aria-invalid={code ? true : undefined} aria-describedby={code ? `${id}-error` : undefined} onChange={(event) => setAnswer(k, position, event.target.value)} />
                  {answer.Type === "flag" && <HoverTooltip text={t("ed.a.wizard.generate")}><Button type="button" variant="ghost" size="icon" aria-label={t("ed.a.wizard.generateFor", { n: first + k })} onClick={() => regenerate(k, position)}><RefreshCw aria-hidden="true" className="h-4 w-4" /></Button></HoverTooltip>}
                </div>
                {code && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{answerErrorText(code, answer.Type)}</p>}
              </div>
            }) : on && delivered && answer ? <span className="text-xs text-muted-foreground">{t("ed.a.wizard.deliveredKept")}</span> : null}
          </div>
        </div>
        {preset === "files" && on && own.files[position] && <div className="flex flex-col gap-2 px-3 pb-3 pl-9">
          {fills.map((fill, k) => {
            const id = `wz-f-${k}-${position}`
            const code = fileError(fills, k, position, tried)
            return <div key={k} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(k, position, event.dataTransfer.files) }}>
                {tag(k)}
                <label htmlFor={id} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                  {t("ed.a.wizard.dropFiles")}
                  <input id={id} type="file" multiple className="sr-only" aria-label={t("ed.a.wizard.newFiles", { n: first + k })} aria-invalid={code ? true : undefined} aria-describedby={code ? `${id}-error` : undefined}
                    onChange={(event) => { const picked = event.target.files; if (picked) void addFiles(k, position, picked); event.target.value = "" }} />
                </label>
                {(fill.files[position] ?? []).map((file, index) => <span key={`${file.FileID}-${index}`} className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 py-0.5 pl-2 pr-1 text-xs">
                  {file.Name}
                  <button type="button" aria-label={t("ed.a.wizard.removeFile", { name: file.Name })} className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent" onClick={() => removeFile(k, position, index)}><X aria-hidden="true" className="h-3 w-3" /></button>
                </span>)}
              </div>
              {code && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{t("ed.a.wizard.val.file")}</p>}
            </div>
          })}
        </div>}
      </li>
    })
  }

  const step2Devices = () => {
    const devices = nodeDevices(baseVariant)
    if (devices.length === 0) return <li className="p-3 text-sm text-muted-foreground">{t("ed.a.wizard.noRows")}</li>
    return devices.map((device) => {
      const on = Boolean(own.img[device.ID])
      return <li key={device.ID} className="border-b border-border last:border-b-0"><div className="ed-wz-row">
        <Checkbox id={`wz-d-${device.ID}`} checked={on} label={<span className="font-medium">{device.Name}</span>} onChange={(event) => tick("device", device.ID, event.target.checked)} />
        <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{device.Image || t("ed.a.wizard.imageNone")}</span>
        <div className="flex min-w-0 flex-col gap-2">
          {on && fills.map((fill, k) => {
            const code = imageError(baseVariant, fills, k, device.ID, tried)
            const id = `wz-i-${k}-${device.ID}`
            return <div key={k} className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">{tag(k)}
                <Input id={id} value={fill.img[device.ID] ?? ""} className="min-w-0 font-mono" spellCheck={false} autoComplete="off" placeholder={device.Image || "image"}
                  aria-label={t("ed.a.wizard.newImage", { name: device.Name })} aria-invalid={code ? true : undefined} aria-describedby={code ? `${id}-error` : undefined}
                  onChange={(event) => setImage(k, device.ID, event.target.value)} />
              </div>
              {code && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{t(code === "same" ? "ed.a.wizard.val.imageSame" : "ed.a.wizard.val.image")}</p>}
            </div>
          })}
        </div>
      </div></li>
    })
  }

  const head = preset === "image" ? ["device", "now", "newImage"] : ["task", "now", preset === "files" ? "newAnswerFiles" : "newAnswer"]
  const step2 = <>
    {preset !== "image" && ownAnswers(own).length > 0 && <div className="flex flex-wrap gap-2">
      {ownAnswers(own).map((position) => <Button key={position} type="button" size="sm" variant="outline" aria-expanded={paste === position} onClick={() => setPaste(paste === position ? null : position)}>
        <ListPlus aria-hidden="true" className="mr-1 h-4 w-4" />{t("ed.a.wizard.pasteOpen", { name: baseVariant.Tasks[position].Name })}
      </Button>)}
    </div>}
    {paste !== null && <div role="group" aria-label={t("ed.a.wizard.pasteTitle")} className="flex flex-col gap-2 rounded-md border border-border p-3">
      <FieldLabel text={t("ed.a.wizard.pasteFor", { name: baseVariant.Tasks[paste].Name })} htmlFor="wz-paste-in" />
      <Textarea id="wz-paste-in" rows={4} value={pasteText} placeholder={t("ed.a.wizard.pastePlaceholder")} onChange={(event) => setPasteText(event.target.value)} />
      <div className="flex gap-2"><Button type="button" size="sm" onClick={applyPaste}>{t("ed.a.wizard.pasteApply")}</Button><Button type="button" size="sm" variant="outline" onClick={() => setPaste(null)}>{t("ed.a.wizard.pasteClose")}</Button></div>
    </div>}
    {emptyOwn && <p id="wz-none" role="alert" className="text-xs font-medium text-destructive">{t("ed.a.wizard.val.none")}</p>}
    {uploadError && <p role="alert" className="text-xs font-medium text-destructive">{uploadError}</p>}
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <div className="ed-wz-row ed-wz-head bg-muted/40 text-xs font-medium text-muted-foreground">{head.map((key) => key === "task" || key === "device" ? <span key={key}>{t(`ed.a.wizard.col.${key}`)}</span> : <FieldLabel key={key} as="span" className="text-xs" labelClassName="font-medium text-muted-foreground" text={t(`ed.a.wizard.col.${key}`)} help={{ intro: t(`ed.a.wizard.help.col.${key}.intro`), default: t(`ed.a.wizard.help.col.${key}.default`) }} />)}</div>
      <ul className="max-h-[50dvh] overflow-y-auto">{preset === "image" ? step2Devices() : step2Tasks()}</ul>
    </div>
  </>

  const last = step === 2 || !needsFill
  const createLabel = linked && (count ?? 1) > 1 ? t("ed.a.wizard.createN", { count: count ?? 1 }) : t("ed.a.wizard.create")

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) requestClose() }}>
      <DialogContent className="max-w-[min(760px,calc(100vw-2rem))]" onCloseAutoFocus={returnFocus} onOpenAutoFocus={(event) => { event.preventDefault(); focus(`wz-p-${preset}`) }}>
        <DialogHeader className="relative pr-10">
          <DialogTitle>{t("ed.a.wizard.title")}</DialogTitle>
          <DialogDescription>{t(step === 1 ? "ed.a.wizard.desc1" : "ed.a.wizard.desc2")}</DialogDescription>
          <HoverTooltip text={t("ed.a.wizard.close")}><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={t("ed.a.wizard.close")} onClick={requestClose}><X aria-hidden="true" className="h-4 w-4" /></Button></HoverTooltip>
        </DialogHeader>
        {needsFill && <ol aria-label={t("ed.a.wizard.steps")} className="flex items-center gap-4 text-sm">
          {[1, 2].map((n) => <li key={n} aria-current={n === step ? "step" : undefined} className={cn("flex items-center gap-2", n === step ? "font-medium text-foreground" : "text-muted-foreground")}>
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs", n === step ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{n < step ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : n}</span>
            {t(n === 1 ? "ed.a.wizard.step1" : "ed.a.wizard.step2")}
          </li>)}
        </ol>}
        <div className="flex min-w-0 flex-col gap-3" data-wizard-step={step}>{step === 1 ? step1 : step2}</div>
        <div className="sticky bottom-[-1rem] z-10 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-card px-4 py-3 sm:bottom-[-1.5rem] sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={requestClose}>{t("confirm.cancel")}</Button>
          {step === 2 && <Button type="button" variant="outline" onClick={() => { setStep(1); focus(`wz-p-${preset}`) }}>{t("ed.a.wizard.back")}</Button>}
          <Button type="button" busy={uploading} busyLabel={t("ed.a.wizard.uploading", { percent: uploadPercent })} disabled={blocked} onClick={last ? create : next}>{last ? createLabel : t("ed.a.wizard.next")}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={discard} tone="danger" title={t("ed.a.wizard.discardTitle")} description={t("ed.a.wizard.discardText")} confirmLabel={t("ed.a.wizard.discardConfirm")}
      cancelLabel={t("ed.a.wizard.discardKeep")} onCancel={() => setDiscard(false)} onConfirm={onClose} />
  </>
}
