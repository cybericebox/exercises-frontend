"use client"

import { useId, useMemo, useRef, useState } from "react"
import { BarChart3, Copy, Ellipsis, FileText, Link2Off, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import "@/styles/editor-a.css"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { uploadExerciseAttachment } from "@/api/exercises/files"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { answerValueError, isValidWeight, MAX_VARIANT_WEIGHT, MIN_VARIANT_WEIGHT, type DraftFormValues, type VariantFormValues } from "@/lib/exerciseSchemas"
import { pluralKey } from "@/lib/presetLabels"
import { linkedFlagConflicts, withOwnImage } from "@/lib/linkedVariants"
import { cn } from "@/utils/cn"
import { VariantStatsDialog } from "../../VariantStatsDialog"
import { ExpandableRow, FieldError, FieldLabel, ViewToolbar, fieldProps, useEditor, useFieldError, type HelpContent } from "../kit"
import { nodeDevices, generatedFlag } from "./wizardModel"
import { baseIndexOf, detachVariantAt, duplicateVariantAt, needlessVariants, removeVariantAt, variantSummary, weightShares } from "./variantsModel"

const help = (key: string, withDefault = true): HelpContent => ({ intro: t(`ed.a.variants.help.${key}.intro`), ...(withDefault ? { default: t(`ed.a.variants.help.${key}.default`) } : {}) })

/**
 * The weight of a variant (F2): a plain numeric field with the share in percent beside it. The typed text is local: only
 * a whole number in range reaches the form, so the autosave never sends a half-typed value; an invalid one shows its
 * error beside the field and the form keeps the last valid weight.
 */
function WeightField({ index, value, share, disabled }: { index: number; value: number; share: number; disabled: boolean }) {
  const { form } = useEditor()
  const path = `Variants.${index}.Weight`
  const formError = useFieldError(path)
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  // The form changed it (a wizard, a reload): show the new value.
  if (shown !== value) {
    setShown(value)
    if (Number(text) !== value) setText(String(value))
  }
  const typed = text.trim() === "" ? NaN : Number(text)
  const error = isValidWeight(typed) ? formError : t("ed.a.variants.weightError", { max: MAX_VARIANT_WEIGHT })
  return <div className="flex min-w-0 flex-col gap-1">
    <div className="flex items-center gap-2">
      <Input {...fieldProps(path, error)} type="number" inputMode="numeric" min={MIN_VARIANT_WEIGHT} max={MAX_VARIANT_WEIGHT} step={1} className="w-[76px] text-right" disabled={disabled}
        aria-label={t("ed.a.variants.weightOf", { n: index + 1 })} value={text}
        onChange={(event) => {
          setText(event.target.value)
          const next = event.target.value.trim() === "" ? NaN : Number(event.target.value)
          if (isValidWeight(next) && next !== value) {
            setShown(next)
            form.setValue(path as `Variants.${number}.Weight`, next, { shouldDirty: true, shouldValidate: Boolean(formError) })
          }
        }} />
      <span className="text-[12.5px] tabular-nums text-muted-foreground" aria-label={t("ed.a.variants.shareAria", { n: share })}>{share}%</span>
    </div>
    {error && <FieldError path={path} message={error} />}
  </div>
}

/** The answer of a linked variant's task: «як в основному» until it has its own, then an editable value. */
function OwnAnswer({ variantIndex, position, base, disabled }: { variantIndex: number; position: number; base: VariantFormValues; disabled: boolean }) {
  const { form } = useEditor()
  const path = `Variants.${variantIndex}.Tasks.${position}.Check.Answer.Values`
  const values = useWatch({ control: form.control, name: path as `Variants.${number}.Tasks.${number}.Check.Answer.Values` }) as string[] | undefined
  const variants = form.getValues("Variants")
  const type = base.Tasks[position].Check.Answer.Type
  const formError = useFieldError(`${path}.0`)
  const first = values?.[0] ?? ""
  const own = (values?.length ?? 0) > 0
  const live = own ? answerValueError(type, first) : ""
  const duplicate = linkedFlagConflicts(variants).some((conflict) => conflict.variantIndex === variantIndex && conflict.taskIndex === position)
  const error = formError ?? (live || (duplicate ? t("ed.a.wizard.val.taken") : ""))
  const set = (next: string[]) => form.setValue(path as `Variants.${number}.Tasks.${number}.Check.Answer.Values`, next, { shouldDirty: true })
  if (!own) {
    const shownBase = base.Tasks[position].Check.Answer.Values[0]
    return <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{shownBase ? t("ed.a.variants.asInBaseValue", { value: shownBase.replace(/^template:/, "") }) : t("ed.a.variants.asInBase")}</span>
      {!disabled && <Button type="button" size="sm" variant="outline" onClick={() => {
        const taken = new Set(variants.flatMap((variant) => variant.Tasks[position]?.Check.Answer.Values ?? []))
        set([type === "flag" ? generatedFlag(taken) : ""])
        window.setTimeout(() => document.getElementById(fieldProps(`${path}.0`, undefined).id)?.focus(), 0)
      }}>{t("ed.a.variants.ownAnswer")}</Button>}
    </div>
  }
  return <div className="flex min-w-0 flex-col gap-1">
    <div className="flex items-center gap-2">
      <Input {...fieldProps(`${path}.0`, error)} value={first} disabled={disabled} className={cn("min-w-0 max-w-md", type === "flag" && "font-mono")} spellCheck={false} autoComplete="off"
        placeholder={type === "flag" ? "ICE{…}" : t("ed.a.variants.answerPlaceholder")} aria-label={t("ed.a.variants.answerOf", { n: variantIndex + 1, task: position + 1 })}
        onChange={(event) => set([event.target.value, ...(values ?? []).slice(1)])} />
      {(values?.length ?? 0) > 1 && <span className="text-xs text-muted-foreground">+{(values?.length ?? 1) - 1}</span>}
      {!disabled && <Button type="button" size="sm" variant="outline" onClick={() => set([])}><RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{t("ed.a.variants.reset")}</Button>}
    </div>
    {error && <FieldError path={`${path}.0`} message={error} className="max-w-md" />}
  </div>
}

/** The own files of a linked variant's task: «файли як в основному» until it has its own. */
function OwnFiles({ variantIndex, position, base, disabled }: { variantIndex: number; position: number; base: VariantFormValues; disabled: boolean }) {
  const { form, exerciseId } = useEditor()
  const path = `Variants.${variantIndex}.Tasks.${position}.Attachments` as `Variants.${number}.Tasks.${number}.Attachments`
  const files = (useWatch({ control: form.control, name: path }) ?? []) as VariantFormValues["Tasks"][number]["Attachments"]
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const baseFiles = base.Tasks[position].Attachments
  async function add(list: FileList) {
    setError(null)
    for (const file of Array.from(list)) {
      setProgress(0)
      try {
        const uploaded = await uploadExerciseAttachment(exerciseId, file, setProgress)
        form.setValue(path, [...(form.getValues(path) ?? []), { FileID: uploaded.FileID, Name: uploaded.Name }], { shouldDirty: true })
      } catch (cause) {
        setError(exerciseErrorMessage(cause))
      } finally { setProgress(null) }
    }
  }
  if (files.length === 0 && baseFiles.length === 0 && disabled) return null
  return <div className="flex flex-wrap items-center gap-2">
    {files.length === 0
      ? baseFiles.length > 0 && <span className="text-sm text-muted-foreground">{t("ed.a.variants.filesAsInBase", { count: baseFiles.length })}</span>
      : <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t("ed.a.variants.ownFilesBadge")}</span>}
    {files.map((file, index) => <span key={`${file.FileID}-${index}`} className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 py-0.5 pl-2 pr-1 text-xs">
      <FileText aria-hidden="true" className="h-3 w-3" />{file.Name}
      {!disabled && <button type="button" aria-label={t("ed.a.variants.removeFile", { name: file.Name })} className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
        onClick={() => form.setValue(path, files.filter((_, i) => i !== index), { shouldDirty: true })}><X aria-hidden="true" className="h-3 w-3" /></button>}
    </span>)}
    {!disabled && <>
      <input id={inputId} type="file" multiple className="sr-only" aria-label={t("ed.a.variants.addFileTo", { task: position + 1 })}
        onChange={(event) => { if (event.target.files) void add(event.target.files); event.target.value = "" }} />
      <Button type="button" size="sm" variant="outline" busy={progress !== null} busyLabel={t("ed.a.variants.uploading", { percent: progress ?? 0 })} onClick={() => document.getElementById(inputId)?.click()}>
        <Plus aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{t(files.length === 0 ? "ed.a.variants.ownFiles" : "ed.a.variants.addFile")}
      </Button>
      {files.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => form.setValue(path, [], { shouldDirty: true })}><RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{t("ed.a.variants.reset")}</Button>}
    </>}
    {error && <p role="alert" className="w-full text-xs font-medium text-destructive">{error}</p>}
  </div>
}

/** The image of a device in a linked variant: the base's until the variant has its own. */
function OwnImage({ variantIndex, baseIndex, deviceId, disabled }: { variantIndex: number; baseIndex: number; deviceId: string; disabled: boolean }) {
  const { form } = useEditor()
  const overrides = useWatch({ control: form.control, name: `Variants.${variantIndex}.ImageOverrides` })
  const baseImage = form.getValues(`Variants.${baseIndex}.Topology.Devices`).find((device) => device.ID === deviceId)?.Image ?? ""
  const own = overrides?.find((override) => override.DeviceID === deviceId)?.Image
  const name = form.getValues(`Variants.${baseIndex}.Topology.Devices`).find((device) => device.ID === deviceId)?.Name ?? ""
  const set = (image: string) => form.setValue(`Variants.${variantIndex}.ImageOverrides`, withOwnImage(form.getValues(`Variants.${variantIndex}.ImageOverrides`), deviceId, image, baseImage), { shouldDirty: true })
  if (own === undefined) return <div className="flex flex-wrap items-center gap-2">
    <span className="min-w-0 break-all text-sm text-muted-foreground">{t("ed.a.variants.imageAsInBase", { image: baseImage || "—" })}</span>
    {!disabled && <Button type="button" size="sm" variant="outline" onClick={() => {
      // The override is recorded only when it differs from the base: seed it with a marker the author edits at once.
      form.setValue(`Variants.${variantIndex}.ImageOverrides`, [...(form.getValues(`Variants.${variantIndex}.ImageOverrides`) ?? []), { DeviceID: deviceId, Image: baseImage }], { shouldDirty: true })
      window.setTimeout(() => document.getElementById(`ea-img-${variantIndex}-${deviceId}`)?.focus(), 0)
    }}>{t("ed.a.variants.ownImage")}</Button>}
  </div>
  return <div className="flex items-center gap-2">
    <Input id={`ea-img-${variantIndex}-${deviceId}`} value={own} disabled={disabled} className="min-w-0 max-w-md font-mono" spellCheck={false} autoComplete="off" placeholder={baseImage}
      aria-label={t("ed.a.variants.imageOf", { name })} onChange={(event) => {
        // Typing the base image back keeps the entry while the field is focused; it is dropped when the field is reset.
        const overridesNow = form.getValues(`Variants.${variantIndex}.ImageOverrides`) ?? []
        form.setValue(`Variants.${variantIndex}.ImageOverrides`, overridesNow.map((override) => override.DeviceID === deviceId ? { ...override, Image: event.target.value } : override), { shouldDirty: true })
      }} />
    {!disabled && <Button type="button" size="sm" variant="outline" onClick={() => set("")}><RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{t("ed.a.variants.reset")}</Button>}
  </div>
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
}

/** What a variant without a base has: every subtask with its answers and files, every device with its image. */
function BaseDetails({ variant, index }: { variant: VariantFormValues; index: number }) {
  const { goTo } = useEditor()
  const devices = nodeDevices(variant)
  return <div className="flex flex-col gap-3">
    <div><SectionTitle>{t("ed.a.variants.tasks")}</SectionTitle>
      {variant.Tasks.length === 0 ? <p className="text-sm text-muted-foreground">{t("ed.a.variants.noTasks")}</p> : <ul className="flex flex-col">
        {variant.Tasks.map((task, position) => <li key={position} className="ea-detail-row">
          <span className="flex min-w-0 items-center gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs tabular-nums text-muted-foreground">{position + 1}</span><span className="truncate">{task.Name || t("ed.a.variants.taskN", { n: position + 1 })}</span></span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {task.Check.Kind === "answer"
              ? task.Check.Answer.Values.length > 0
                ? task.Check.Answer.Values.map((value, i) => <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{value.replace(/^template:/, "")}{value.startsWith("template:") ? ` · ${t("ed.a.variants.template")}` : ""}</code>)
                : <span className="text-sm text-muted-foreground">{t("ed.a.variants.random")}</span>
              : <span className="text-sm text-muted-foreground">{t("ed.a.variants.stateCheck")}</span>}
            {task.Attachments.map((file, i) => <span key={i} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs"><FileText aria-hidden="true" className="h-3 w-3" />{file.Name}</span>)}
          </span>
          <Button type="button" size="sm" variant="outline" aria-label={t("ed.a.variants.openTask", { n: position + 1 })} onClick={() => goTo({ tab: "tasks", variant: index, task: position })}>{t("ed.a.variants.open")}</Button>
        </li>)}
      </ul>}
    </div>
    <div><SectionTitle>{t("ed.a.variants.devices")}</SectionTitle>
      {devices.length === 0 ? <p className="text-sm text-muted-foreground">{t("ed.a.variants.noDevices")}</p> : <ul className="flex flex-col">
        {devices.map((device) => <li key={device.ID || device.Name} className="ea-detail-row">
          <span className="truncate">{device.Name}</span>
          <code className="min-w-0 break-all font-mono text-xs">{device.Image || t("ed.a.variants.imageNone")}</code>
          <Button type="button" size="sm" variant="outline" aria-label={t("ed.a.variants.openDevice", { name: device.Name })} onClick={() => goTo({ tab: "infrastructure", variant: index, view: "devices", node: device.ID, section: "main" })}>{t("ed.a.variants.open")}</Button>
        </li>)}
      </ul>}
    </div>
  </div>
}

/** What a linked variant differs by: the answer of every answer task, its files, the image of every device. */
function LinkedDetails({ variant, index, baseIndex, disabled }: { variant: VariantFormValues; index: number; baseIndex: number; disabled: boolean }) {
  const { form } = useEditor()
  const base = form.getValues(`Variants.${baseIndex}`)
  const devices = nodeDevices(base)
  const shared = base.Tasks.filter((task, position) => task.Check.Kind !== "answer" && task.Attachments.length === 0 && (variant.Tasks[position]?.Attachments.length ?? 0) === 0).length
  return <div className="flex flex-col gap-3">
    <div><SectionTitle>{t("ed.a.variants.tasks")}</SectionTitle>
      <ul className="flex flex-col">
        {base.Tasks.map((task, position) => {
          if (task.Check.Kind !== "answer" && task.Attachments.length === 0 && (variant.Tasks[position]?.Attachments.length ?? 0) === 0) return null
          return <li key={position} className="ea-detail-row ea-detail-row-form">
            <span className="flex min-w-0 items-center gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs tabular-nums text-muted-foreground">{position + 1}</span><span className="truncate">{task.Name || t("ed.a.variants.taskN", { n: position + 1 })}</span></span>
            <div className="flex min-w-0 flex-col gap-2">
              {task.Check.Kind === "answer" ? <OwnAnswer variantIndex={index} position={position} base={base} disabled={disabled} /> : <span className="text-sm text-muted-foreground">{t("ed.a.variants.stateCheck")}</span>}
              <OwnFiles variantIndex={index} position={position} base={base} disabled={disabled} />
            </div>
          </li>
        })}
      </ul>
      {shared > 0 && <p className="mt-1 text-sm text-muted-foreground">{t(pluralKey("ed.a.variants.unchanged", shared), { count: shared })}</p>}
    </div>
    <div><SectionTitle>{t("ed.a.variants.devices")}</SectionTitle>
      {devices.length === 0 ? <p className="text-sm text-muted-foreground">{t("ed.a.variants.noDevices")}</p> : <ul className="flex flex-col">
        {devices.map((device) => <li key={device.ID || device.Name} className="ea-detail-row ea-detail-row-form">
          <span className="truncate">{device.Name}</span>
          <OwnImage variantIndex={index} baseIndex={baseIndex} deviceId={device.ID} disabled={disabled} />
        </li>)}
      </ul>}
    </div>
  </div>
}

type Pending = { kind: "detach" | "delete"; index: number } | null

/**
 * «Усі варіанти» (F1..F5): a list, not a matrix. Every row — base and linked alike — starts with the same expand chevron
 * and expands to its content; the weight is a plain field with its share; detach, duplicate and delete live only in the
 * row's «…» menu. The only «add» action sits in the toolbar.
 */
export function AllVariantsView() {
  const { form, exerciseId, disabled, showNotes, selectVariant, variantIndex, goTo, openWizard } = useEditor()
  const variants = useWatch({ control: form.control, name: "Variants" }) as DraftFormValues["Variants"]
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<Pending>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const returnTo = useRef("ea-add")
  const shares = useMemo(() => weightShares(variants.map((variant) => variant.Weight)), [variants])
  const needless = useMemo(() => needlessVariants(variants), [variants])
  const rowKey = (variant: VariantFormValues, index: number) => variant.ID || `new-${index}`
  const toggle = (key: string, value: boolean) => setOpen((current) => ({ ...current, [key]: value }))

  function setVariants(next: VariantFormValues[]) { form.setValue("Variants", next, { shouldDirty: true }) }
  function duplicate(index: number) {
    const result = duplicateVariantAt(variants, index)
    setVariants(result.variants)
    toast.success(t("ed.a.variants.duplicated", { n: result.at + 1 }))
  }
  function confirmPending() {
    if (!pending) return
    const { kind, index } = pending
    if (kind === "detach") {
      setVariants(detachVariantAt(variants, index))
      toast.success(t("ed.a.variants.detached", { n: index + 1 }))
    } else {
      setVariants(removeVariantAt(variants, index))
      if (variantIndex >= index && variantIndex > 0) selectVariant(variantIndex - 1)
    }
    setPending(null)
  }
  function restoreFocus(event: Event) {
    event.preventDefault()
    ;(document.getElementById(returnTo.current) ?? document.getElementById("ea-add"))?.focus()
  }
  const pendingBase = pending ? baseIndexOf(variants, pending.index) : -1
  const pendingKids = pending && pending.kind === "delete" ? variants.filter((_, other) => baseIndexOf(variants, other) === pending.index).length : 0

  return <div className="flex min-w-0 flex-col gap-3">
    <ViewToolbar add={!disabled ? <Button type="button" id="ea-add" onClick={openWizard}><Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("ed.a.variants.add")}</Button> : undefined}>
      <h2 className="text-sm font-semibold text-foreground">{t("ed.a.variants.title")}<span className="ml-1.5 text-[13px] font-normal text-muted-foreground">· {variants.length}</span></h2>
      {exerciseId && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setStatsOpen(true)}><BarChart3 aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("admin.exStats.open")}</Button>}
    </ViewToolbar>
    {needless && <div role="note" id="ea-needless" className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{t("ed.a.variants.needless")}</div>}
    <div role="list" aria-label={t("ed.a.variants.title")} className="min-w-0 rounded-md border border-border">
      <div className="ea-vhead border-b border-border bg-muted/40">
        {(["variant", "weight", "differs"] as const).map((key) => <FieldLabel key={key} as="span" className="text-xs" labelClassName="font-semibold text-muted-foreground" text={t(`ed.a.variants.col.${key}`)} help={help(`col.${key}`)} />)}
        <span />
      </div>
      {variants.map((variant, index) => {
        const base = baseIndexOf(variants, index)
        const linked = base >= 0
        const key = rowKey(variant, index)
        const isOpen = Boolean(open[key])
        const kids = variants.filter((_, other) => baseIndexOf(variants, other) === index).length
        const kind = linked ? t("ed.a.variants.basedOn", { base: base + 1 }) : index === 0 ? t("ed.a.variants.main") : t("ed.a.variants.separate")
        const readOnlyDetails = disabled
        return <div role="listitem" key={key} data-variant-row={index + 1}>
          <ExpandableRow open={isOpen} onOpenChange={(value) => toggle(key, value)} ariaLabel={t("ed.a.variants.rowLabel", { n: index + 1 })}
            summary={<div className="ea-vgrid">
              <span className={cn("flex min-w-0 items-center gap-2 text-sm", linked && "ea-linked")}><span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-muted px-1 text-xs font-semibold tabular-nums text-foreground">{index + 1}</span><span className="truncate font-medium text-foreground">{kind}</span></span>
              <WeightField index={index} value={variant.Weight} share={shares[index]} disabled={disabled} />
              <p className="min-w-0 text-[13.5px] text-muted-foreground" id={`ea-summary-${index}`}>{variantSummary(variants, index, t)}</p>
              <DropdownMenu>
                <HoverTooltip text={t("ed.a.variants.menu")}>
                  <DropdownMenuTrigger asChild><Button type="button" id={`ea-menu-${index}`} variant="ghost" size="icon" aria-label={t("ed.a.variants.menuOf", { n: index + 1 })}><Ellipsis aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
                </HoverTooltip>
                <DropdownMenuContent align="end" className="w-64" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem className="gap-2" onSelect={() => { selectVariant(index); goTo({ tab: "tasks", variant: index }) }}><FileText aria-hidden="true" className="h-4 w-4" />{t("ed.a.variants.menu.open")}</DropdownMenuItem>
                  {!disabled && <>
                    <DropdownMenuItem className="gap-2" onSelect={() => duplicate(index)}><Copy aria-hidden="true" className="h-4 w-4" />{t("ed.a.variants.menu.duplicate")}</DropdownMenuItem>
                    {linked && <DropdownMenuItem className="gap-2" onSelect={() => { returnTo.current = `ea-menu-${index}`; setPending({ kind: "detach", index }) }}><Link2Off aria-hidden="true" className="h-4 w-4" />{t("ed.a.variants.menu.detach")}</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" disabled={variants.length < 2} onSelect={() => { returnTo.current = `ea-menu-${index}`; setPending({ kind: "delete", index }) }}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />{t("ed.a.variants.menu.delete")}{variants.length < 2 && <span className="ml-auto text-xs text-muted-foreground">{t("ed.a.variants.menu.lastOne")}</span>}
                    </DropdownMenuItem>
                  </>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>}>
            <div className="flex min-w-0 flex-col gap-3 pt-1" id={`ea-details-${index}`}>
              {showNotes && <div className="max-w-xl">
                <FieldLabel text={t("ed.a.variants.note")} htmlFor={`ea-note-${index}`} help={help("note", false)} />
                <Textarea id={`ea-note-${index}`} rows={2} disabled={readOnlyDetails} value={variant.Note} onChange={(event) => form.setValue(`Variants.${index}.Note`, event.target.value, { shouldDirty: true })} />
              </div>}
              {linked ? <LinkedDetails variant={variant} index={index} baseIndex={base} disabled={disabled} /> : <BaseDetails variant={variant} index={index} />}
              {!linked && kids > 0 && <p className="text-xs text-muted-foreground">{t("ed.a.variants.kids", { count: kids })}</p>}
            </div>
          </ExpandableRow>
        </div>
      })}
    </div>
    {statsOpen && exerciseId && <VariantStatsDialog exerciseId={exerciseId} onClose={() => setStatsOpen(false)} />}
    <ConfirmDialog open={pending?.kind === "detach"} tone="danger" onCancel={() => setPending(null)}
      title={t("ed.a.variants.detachTitle")} description={pending ? t("ed.a.variants.detachText", { n: pending.index + 1, base: pendingBase + 1 }) : undefined}
      confirmLabel={t("ed.a.variants.detach")} onConfirm={confirmPending} onCloseAutoFocus={restoreFocus} />
    <ConfirmDialog open={pending?.kind === "delete"} tone="danger" onCancel={() => setPending(null)}
      title={t("ed.a.variants.deleteTitle")} description={pending ? t(pendingKids > 0 ? "ed.a.variants.deleteBase" : "ed.a.variants.deleteText", { n: pending.index + 1, count: pendingKids }) : undefined}
      confirmLabel={t("ed.a.variants.deleteConfirm")} onConfirm={confirmPending} onCloseAutoFocus={restoreFocus} />
  </div>
}
