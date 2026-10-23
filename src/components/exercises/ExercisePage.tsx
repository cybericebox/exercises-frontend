"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWatch } from "react-hook-form"
import { useRouter } from "next/navigation"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import type { Exercise } from "@/api/exercises/catalog"
import { listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { getVersion, type DeviceOutside, type Version } from "@/api/exercises/versions"
import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { useImportJob } from "@/lib/importJobs"
import { importStageText } from "@/lib/importStage"
import { Spinner } from "@/components/ui/spinner"
import { ImportDialog } from "./ImportDialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { testVariantOptions } from "@/lib/testVariantOptions"
import { useActiveDeploys } from "@/lib/useActiveDeploys"
import { EditorWorkspace } from "@/components/exercises/EditorWorkspace"
import { DevicePersistenceProvider } from "@/components/exercises/DevicePersistenceContext"
import { ExerciseIdProvider } from "@/components/exercises/ExerciseIdContext"
import { ImageUploadsProvider } from "@/components/exercises/ImageUploads"
import { EditorPositionProvider, useEditorValidationFocus } from "@/components/exercises/EditorPosition"
import { ArchivedBanner, VersionBanner } from "@/components/exercises/ExerciseBanners"
import { ExerciseGeneralFields } from "@/components/exercises/ExerciseGeneralFields"
import { ExerciseHeader, type HeaderBadge, type HeaderMode, type TestVariantOption } from "@/components/exercises/ExerciseHeader"
import { TopologyResourcesPanel } from "@/components/exercises/TopologyResourcesPanel"
import { ResourcesConfigProvider } from "@/components/exercises/ResourcesConfigContext"
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { RunningLabsDialog } from "@/components/exercises/RunningLabsDialog"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { HistoryDialog } from "@/components/exercises/HistoryDialog"
import { SnapshotDialog } from "@/components/exercises/SnapshotDialog"
import { useExerciseActions } from "@/components/exercises/useExerciseActions"
import { useExerciseEditor } from "@/components/exercises/useExerciseEditor"
import { ExerciseGeneralMetadata } from "./ExerciseGeneralMetadata"
import "@/styles/exercise-general.css"
import { Form } from "@/components/ui/form"
import { LoadingArea } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { DEFAULT_EDITOR_POSITION, editorPositionStorageKey, parseEditorPosition, type EditorPosition } from "@/lib/editorPosition"
import { exerciseHref, testLabHref, testLabStartHref } from "@/lib/exerciseRoutes"
import { canPublishExercise, exerciseBadgeKind, formatExerciseDate, formatExerciseDateTime } from "@/lib/exerciseStatus"
import { useExerciseLeaveGuard } from "@/lib/useExerciseLeaveGuard"
import { useRole } from "@/lib/useRole"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { useReturnContext } from "@/components/shell/ReturnContext"
import { defaultOwner, editorPermissions, infrastructureAllowed, isReadOnlyCatalogView, ownerOptions } from "@/lib/exerciseRights"
import { SelectMenu } from "@/components/ui/select-menu"
import { AccessDialog } from "./AccessDialog"
import { EventReturnCallout, InfrastructureBlockedNote, ReadOnlyBanner } from "./EventBanners"
import { ProposeDialog } from "./ProposeDialog"
import { NoAccessScreen } from "@/components/shell/NoAccessScreen"

// eventId: owner event of a new exercise (from /new?event=…), used from Phase 2 on.
type Props = { exerciseId: string | null; versionId: string | null; eventId?: string | null }
type DialogName = "history" | "snapshot" | "revert" | "restore" | "archive" | "delete" | "export" | "access" | "propose" | "import"

export function ExercisePage(props: Props) {
  const { isLoading } = useRole()
  if (isLoading) return <LoadingArea className="h-full" label={t("admin.loading")} />
  return <ExerciseScreen {...props} />
}

function ExerciseScreen({ exerciseId, versionId, eventId = null }: Props) {
  const { can, me } = useRole()
  const { access } = useExerciseAccess()
  const { returnUrl } = useReturnContext()
  // Owner of a NEW exercise: "" = catalog, an event ID, or null = must be picked first.
  const [owner, setOwner] = useState<string | null>(() => access ? defaultOwner(access, eventId) : "")
  const [ownerTouched, setOwnerTouched] = useState(false)
  // ?event= resolves after mount (return context): adopt it until the user picks an owner.
  const [ownerFor, setOwnerFor] = useState(eventId)
  if (eventId !== ownerFor) {
    setOwnerFor(eventId)
    if (!ownerTouched && access) setOwner(defaultOwner(access, eventId))
  }
  const [loadedExercise, setLoadedExercise] = useState<Exercise | null>(null)
  const rights = editorPermissions(loadedExercise, access, can)
  const permissions = { write: rights.write, publish: rights.publish, delete: rights.delete, export: rights.export }
  const [justDone, setJustDone] = useState<"created" | "published" | null>(null)
  const isVersion = versionId !== null
  const userId = me?.ID ?? null
  const [mode, setMode] = useState<"view" | "edit">(exerciseId ? "view" : "edit")
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const router = useRouter()
  // The user's running test labs, offered instead of a start once the limit of running labs is reached.
  const [limitReached, setLimitReached] = useState<{ items: DeployListItem[]; at: number } | null>(null)
  const [maxTests, setMaxTests] = useState(1)
  const activeDeploys = useActiveDeploys(exerciseId)
  // A lab whose lease is over only waits to be ended: it is not "the running test" of the exercise.
  const activeDeploy = activeDeploys.items.find((item) => !item.Expired) ?? null
  const [laboratories, setLaboratories] = useState<boolean | null>(null)
  const [devicePersistence, setDevicePersistence] = useState(false)
  const [resourcesConfig, setResourcesConfig] = useState<ResourcesConfig | null>(null)
  const [publishedVersions, setPublishedVersions] = useState<Partial<Record<string, Version>>>({})
  const [position, setPosition] = useState<EditorPosition>(DEFAULT_EDITOR_POSITION)
  const [leaveOffline, setLeaveOffline] = useState(false)
  const { formRef, focusField } = useEditorValidationFocus()
  // «Ввести назву» under the image field: the General tab, with the cursor in the name.
  const showNameField = () => {
    updatePosition("tab", "general")
    window.setTimeout(() => document.getElementById("exercise-name")?.focus(), 0)
  }

  const editor = useExerciseEditor({
    exerciseId,
    versionId,
    editable: !isVersion && mode === "edit" && permissions.write && (exerciseId !== null || owner !== null),
    canWrite: permissions.write,
    userId,
    ownerEventId: owner || null,
    publishedOnly: access && !access.IsAdmin ? (loaded) => isReadOnlyCatalogView(access, loaded) : undefined,
    onCreated: (createdExercise) => {
      // Not router.replace: /new → /detail is another route segment and would remount the editor.
      window.history.replaceState(null, "", exerciseHref(createdExercise.ID))
      toast.success(t("admin.exPage.toast.created"))
      setJustDone("created")
    },
    onPendingRestored: () => setMode("edit"),
  })
  const selectedName = useWatch({ control: editor.identityForm.control, name: "Name" })
  const exercise = editor.exercise
  // Rights follow the loaded card (server Permissions); synced from the editor state.
  if (exercise !== loadedExercise) setLoadedExercise(exercise)
  const readOnly = editor.readOnly
  const ownerEventId = exercise ? exercise.OwnerEventID : owner || null
  const infraAllowed = infrastructureAllowed(access, ownerEventId)
  const publishedIdRef = useRef<string | null | undefined>(undefined)
  const archived = Boolean(exercise?.ArchivedAt)
  const editing = !editor.replacementActive && !isVersion && !archived && mode === "edit" && permissions.write && !readOnly && (exercise !== null || owner !== null)
  const replacementJob = useImportJob(editor.replacementRecovery?.jobID ?? null)
  const [replacementError, setReplacementError] = useState<string | null>(null)
  const reconciling = useRef(false)
  useEffect(() => {
    if (!editor.replacementRecovery || editor.loadState !== "ready" || dialog === "import" || reconciling.current || replacementError) return
    if (replacementJob?.state === "failed") { editor.cancelImportReplacement(); return }
    if (replacementJob?.state !== "done" && editor.replacementRecovery.state !== "done") return
    reconciling.current = true
    void editor.reconcileImportReplacement().catch(() => setReplacementError(t("admin.exImport.update.reconcileError"))).finally(() => { reconciling.current = false })
  }, [replacementJob, editor, dialog, replacementError])
  const saveStatus = editor.autosave.status
  // A new task without a name is not on the server: only this browser holds it.
  const leave = useExerciseLeaveGuard(
    () => editing && (exercise !== null ? (saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error") : editor.hasLocalDraft()),
    () => editing && exercise === null && editor.hasLocalDraft(),
  )
  // A leave request on an unsaved new task: nothing to send, ask and keep the draft in this browser.
  const [cancelNewAsk, setCancelNewAsk] = useState(false)
  const leaveDraft = leave.destination !== null && exercise === null
  const actions = useExerciseActions({
    editor, canWrite: permissions.write, canDelete: permissions.delete, setMode, setPosition, focusField,
    allowNavigation: leave.allowNavigation,
  })

  const positionKey = userId && exercise ? editorPositionStorageKey(userId, exercise.ID) : null
  useEffect(() => {
    if (!positionKey) return
    let stored: EditorPosition | null = null
    try { stored = parseEditorPosition(window.localStorage.getItem(positionKey)) } catch { /* storage unavailable */ }
    // Syncing from external storage once the key is known (the exercise loads async).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPosition(stored)
  }, [positionKey])

  function updatePosition<K extends keyof EditorPosition>(key: K, value: EditorPosition[K]) {
    setPosition((current) => {
      const next = { ...current, [key]: value }
      if (positionKey) {
        try { window.localStorage.setItem(positionKey, JSON.stringify(next)) } catch { /* best effort */ }
      }
      return next
    })
  }

  useEffect(() => {
    if (!permissions.write || isVersion) return
    let cancelled = false
    getExerciseCapabilities()
      .then((capabilities) => { if (!cancelled) { setLaboratories(capabilities.Laboratories); setMaxTests(Math.max(1, capabilities.MaxActiveTestDeploys ?? 1)); setDevicePersistence(capabilities.DevicePersistence ?? false); setResourcesConfig(capabilities.Resources ?? null) } })
      .catch(() => { if (!cancelled) setLaboratories(false) })
    return () => { cancelled = true }
  }, [permissions.write, isVersion])

  const currentId = exercise?.ID ?? null
  const publishedVersionId = exercise?.PublishedVersionID ?? null
  useEffect(() => {
    if (!currentId) return
    const previous = publishedIdRef.current
    publishedIdRef.current = publishedVersionId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a server-side publish
    if (previous !== undefined && publishedVersionId && previous !== publishedVersionId) setJustDone("published")
  }, [currentId, publishedVersionId])
  const publishedKey = currentId && publishedVersionId ? JSON.stringify([currentId, publishedVersionId]) : null
  // A card's properties are actor-visible (often draft-derived). Only the actual
  // publication may supply these facts. Reuse an already loaded matching snapshot.
  const loadedPublication = !isVersion && editor.version && editor.version.ExerciseID === currentId && editor.version.ID === publishedVersionId ? editor.version : null
  const cachedPublication = publishedKey ? publishedVersions[publishedKey] : undefined
  const publishedVersion = !isVersion ? loadedPublication ?? cachedPublication ?? null : null
  useEffect(() => {
    if (!currentId || !publishedVersionId || !publishedKey || isVersion) return
    const exerciseId = currentId
    const versionId = publishedVersionId
    const cacheKey = publishedKey
    let cancelled = false
    async function loadPublication() {
      const snapshot = await Promise.resolve(loadedPublication ?? cachedPublication ?? getVersion(exerciseId, versionId))
      if (cancelled || !snapshot || snapshot.ExerciseID !== exerciseId || snapshot.ID !== versionId) return
      setPublishedVersions((current) => current[cacheKey] === snapshot ? current : { ...current, [cacheKey]: snapshot })
    }
    void loadPublication().catch(() => undefined)
    return () => { cancelled = true }
  }, [currentId, publishedVersionId, publishedKey, isVersion, loadedPublication, cachedPublication])
  // History belongs entirely to the selected snapshot. A checkpoint never inherits
  // the current publication date; pending/failed lookups remain unknown, not unpublished.
  const publishedAt = isVersion ? editor.version?.PublishedAt ?? null : publishedVersion?.PublishedAt ?? null

  useEffect(() => {
    if (!leave.destination) return
    if (editor.exercise === null) return
    let cancelled = false
    void editor.autosave.flush().then((ok) => {
      if (cancelled) return
      if (ok) leave.finishLeave()
      else setLeaveOffline(true)
    })
    return () => { cancelled = true }
    // React to a new leave request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave.destination])

  const resourceBlocked = Boolean(editor.version?.Resources?.Outside.some((issue) => !issue.Covered))
  // The elevation dialog picks a larger block per device: it is written to that device of the working copy.
  const pickDeviceBlock = useCallback((issue: DeviceOutside, presetId: string) => {
    const variants = editor.draftForm.getValues("Variants")
    const variantIndex = variants.findIndex((variant) => variant.ID === issue.VariantID)
    const deviceIndex = variantIndex < 0 ? -1 : variants[variantIndex].Topology.Devices.findIndex((device) => device.ID === issue.DeviceID)
    if (deviceIndex >= 0) editor.draftForm.setValue(`Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ResourcePreset`, presetId, { shouldDirty: true })
  }, [editor.draftForm])
  // A static variant is testable without laboratories; only lab variants depend on the platform.
  const getTestVariants = useCallback((): TestVariantOption[] =>
    testVariantOptions(editor.draftForm.getValues("Variants"), { laboratories, infraAllowed }, (n) => t("admin.exDraft.variantN", { n })),
  [editor.draftForm, laboratories, infraAllowed])

  // The testing page: an active lab is reopened, otherwise the page starts one for the chosen variant.
  const openTest = (deployId: string | undefined = activeDeploy?.DeployID, forExercise: string | null = exerciseId) => {
    if (!forExercise || !deployId) return
    leave.allowNavigation()
    router.push(testLabHref(forExercise, deployId))
  }


  const owners = access ? ownerOptions(access, t("exercises.owner.catalog")) : []
  if (!exerciseId && !permissions.write) {
    return <NoAccessScreen mode="block" title={t("admin.ex.create.forbidden")} />
  }
  if (editor.loadState === "loading") return <LoadingArea className="h-full" label={t("admin.loading")} />
  if (editor.loadState === "notFound") return <ErrorPage mode="block" status={404} title={t("admin.exDetail.notFound")} />
  if (editor.loadState === "error") return <ErrorPage mode="block" status={500} title={t("admin.exDetail.loadError")} error={editor.loadError} onRetry={editor.retryLoad} />

  const headerMode: HeaderMode = readOnly ? "readonly" : isVersion ? "version" : exercise === null ? "new" : mode
  // The internal notes are for full access only (admins, the owner event's owners/managers); the API blanks them
  // for other readers, so the fields are left out instead of showing empty.
  const showNotes = Boolean(access?.IsAdmin) || permissions.write
  const canManageAccess = Boolean(exercise && exercise.Scope === "catalog" && rights.manageAccess && !archived && !isVersion)
  const canPropose = Boolean(exercise && exercise.Scope === "event" && rights.propose && exercise.PublishedVersionID && !archived && !isVersion)
  const originEventName = exercise?.OriginEventID ? access?.Events.find((event) => event.ID === exercise.OriginEventID)?.Name : undefined
  const version = editor.version
  // One selected-version context; published-only readers never see working-copy state.
  const unpublishedWork = Boolean(exercise?.HasChanges || (editing && (saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error")))
  const badge: HeaderBadge | null = isVersion && version
    ? { kind: "version", label: t("admin.exPage.badge.version", { date: formatExerciseDate(version.PublishedAt ?? version.CreatedAt) }) }
    : exercise ? { kind: exerciseBadgeKind({ ...exercise, HasChanges: !readOnly && unpublishedWork }) } : null

  return <ExerciseIdProvider value={exercise?.ID ?? exerciseId}><DevicePersistenceProvider value={devicePersistence}><ResourcesConfigProvider value={resourcesConfig}><EditorPositionProvider position={position} onChange={updatePosition}>
    <div className="exercise-general-screen">
      <ExerciseHeader
        mode={headerMode}
        title={exercise ? selectedName : t("admin.ex.create.title")}
        badge={badge}
        saveStatus={saveStatus}
        permissions={permissions}
        archived={archived}
        publishable={exercise ? canPublishExercise({ ...exercise, HasChanges: unpublishedWork }) : false}
        publishBlockedReason={resourceBlocked ? t("exercises.res.publishBlockedShort") : undefined}
        revertable={Boolean(exercise?.PublishedVersionID && exercise.HasChanges)}
        busy={actions.busy || editor.replacementActive}
        running={actions.running}
        testAvailable={permissions.write}
        getTestVariants={getTestVariants}
        usageEvents={actions.usageEvents.map((event) => event.Name)}
        onRetrySave={() => void editor.autosave.flush()}
        onCancelNew={(event) => {
          // A draft with content is erased only after a confirmation.
          if (editor.hasLocalDraft()) { event.preventDefault(); setCancelNewAsk(true); return }
          leave.allowNavigation()
          void editor.autosave.discard()
        }}
        activeTestUntil={activeDeploy?.ExpiresAt ?? null}
        onOpenTest={activeDeploy ? () => openTest() : undefined}
        onTest={(index) => {
          void actions.test(index).then(async (target) => {
            if (!target) return
            // A user runs a limited number of test labs across all exercises: open the running
            // one (this exercise's, or pick among them) instead of failing.
            const running = await listDeploys().catch(() => [] as DeployListItem[])
            const here = running.find((item) => item.ExerciseID === target.exerciseId)
            if (here) { openTest(here.DeployID); return }
            if (running.filter((item) => !item.Expired).length >= maxTests) { setLimitReached({ items: running, at: Date.now() }); return }
            leave.allowNavigation()
            router.push(testLabStartHref(target.exerciseId, target.versionId, target.variantId))
          })
        }}
        onHistory={() => setDialog("history")}
        onEdit={() => setMode("edit")}
        onDone={() => void actions.done()}
        onPublish={() => void actions.publish()}
        onSnapshot={() => setDialog("snapshot")}
        onRevert={() => { actions.clearConfirmError(); setDialog("revert") }}
        onImportUpdate={exercise && permissions.write && !archived && !isVersion && !readOnly && !editor.replacementActive ? () => setDialog("import") : undefined}
        onExport={() => setDialog("export")}
        onArchive={() => { actions.clearConfirmError(); setDialog("archive") }}
        onUnarchive={() => void actions.unarchive()}
        onDelete={() => { actions.clearConfirmError(); setDialog("delete") }}
        onAccess={canManageAccess ? () => setDialog("access") : undefined}
        onPropose={canPropose ? () => setDialog("propose") : undefined}
        proposalPending={Boolean(exercise?.PendingProposalID)}
      />
      {!exercise && owners.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span id="owner-label" className="text-sm font-medium text-foreground">{t("exercises.owner.label")}</span>
          {owners.length === 1
            ? <span className="text-sm text-muted-foreground">{owners[0].label}</span>
            : <SelectMenu value={owner ?? "__none"} onChange={(value) => { setOwnerTouched(true); setOwner(value === "__none" ? null : value) }} ariaLabel={t("exercises.owner.label")}
                options={[...(owner === null ? [{ value: "__none", label: t("exercises.owner.pick") }] : []), ...owners.map((option) => ({ value: option.value, label: option.label }))]}
                className="h-10 min-w-0 w-full sm:min-w-56 sm:w-auto text-sm" />}
          {owner === null && <span className="text-xs text-muted-foreground">{t("exercises.owner.required")}</span>}
        </div>
      )}
      {editor.replacementActive && <div className="exercise-import-strip" role="status"><span><Spinner size="sm" />{replacementError ?? (editor.replacementRecovery?.state === "unknown" || editor.replacementRecovery?.jobID && !replacementJob ? t("admin.exImport.update.unknown") : replacementJob?.state === "running" ? importStageText(replacementJob) : t("admin.exImport.update.fenced"))}</span><Button type="button" variant="outline" size="sm" onClick={() => { setReplacementError(null); setDialog("import") }}>{t("admin.exImport.update.reopen")}</Button></div>}
      {readOnly && <ReadOnlyBanner returnUrl={returnUrl} />}
      {returnUrl && justDone && <EventReturnCallout returnUrl={returnUrl} kind={justDone} />}
      {!infraAllowed && !readOnly && <InfrastructureBlockedNote />}
      {isVersion && version && exercise && <VersionBanner
        label={t("admin.exPage.version.banner", { date: formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt) })}
        canRestore={permissions.write && !archived}
        busy={actions.busy}
        onBack={() => void actions.openVersion(null)}
        onRestore={() => { actions.clearConfirmError(); setDialog("restore") }} />}
      {!isVersion && archived && <ArchivedBanner canUnarchive={permissions.write} busy={actions.busy} unarchiving={actions.running === "unarchive"} onUnarchive={() => void actions.unarchive()} />}
      <Form {...editor.draftForm}>
        {/* Image uploads live here, above the device cards: collapsing or switching panels never stops one; leaving the editor does. */}
        <ImageUploadsProvider canWrite={permissions.write && !readOnly} flush={() => editor.autosave.flush()} onNeedName={showNameField}>
        {/* exercise-view: viewing (not a busy edit) shows values as read-only text, not as dimmed empty inputs. */}
        <form ref={formRef} noValidate onSubmit={(event) => event.preventDefault()} className={`editor-form${editing ? "" : " exercise-view"}`}>
          <EditorWorkspace form={editor.draftForm} exerciseId={exercise?.ID ?? null} disabled={!editing || actions.busy} infrastructureBlocked={!infraAllowed} showNotes={showNotes}
            general={<div className="editor-general">
              <ExerciseGeneralFields identityForm={editor.identityForm} draftForm={editor.draftForm} disabled={!editing || actions.busy} readOnly={!editing && Boolean(exercise)} autoFocusName={!exerciseId} showNotes={showNotes} />
              {exercise && <ExerciseGeneralMetadata exercise={exercise} publishedVersion={publishedVersion} publishedAt={publishedAt}
                eventName={(id) => access?.Events.find((event) => event.ID === id)?.Name} />}
            </div>}
            resources={infraAllowed ? <TopologyResourcesPanel form={editor.draftForm} exerciseId={exercise?.ID ?? null} resources={editor.version?.Resources ?? null} elevation={editor.version?.Elevation ?? null}
              config={resourcesConfig} canRequest={editing} canPublish={permissions.publish}
              flush={() => editor.autosave.flush()} onRequested={editor.setElevation} onPickBlock={pickDeviceBlock} /> : undefined} />
        </form>
        </ImageUploadsProvider>
      </Form>
    </div>

    {dialog === "history" && exercise && <HistoryDialog exerciseId={exercise.ID} viewingVersionId={versionId}
      onClose={() => setDialog(null)}
      onView={(target) => { setDialog(null); void actions.openVersion(target) }} />}
    {dialog === "snapshot" && <SnapshotDialog busy={actions.busy} onCancel={() => setDialog(null)}
      onConfirm={(note) => void actions.snapshot(note).then((ok) => { if (ok) setDialog(null) })} />}
    <ConfirmDialog open={dialog === "revert"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.revert.title")} description={t("admin.exPage.revert.description")} confirmLabel={t("admin.exPage.revert.confirm")} busyLabel={t("admin.exPage.revert.busy")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.revert().then((ok) => { if (ok) setDialog(null) })} />
    {version && <ConfirmDialog open={dialog === "restore"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.restore.title", { date: formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt) })}
      description={t("admin.exPage.restore.description")} confirmLabel={t("admin.exPage.restore.confirm")} busyLabel={t("admin.exPage.version.restoring")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.restore(version.ID).then((ok) => { if (ok) setDialog(null) })} />}
    <ConfirmDialog open={dialog === "archive"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.archive.title")} description={t("admin.exPage.archive.description")} confirmLabel={t("admin.exPage.archive.confirm")} busyLabel={t("admin.exPage.archive.busy")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.archive().then((ok) => { if (ok) setDialog(null) })} />
    <ConfirmDialog open={dialog === "delete"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.delete.title")} description={t("admin.exPage.delete.description")} confirmLabel={t("admin.exPage.delete.confirm")} busyLabel={t("admin.exPage.delete.busy")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.remove().then((ok) => { if (ok) setDialog(null) })} />
    {dialog === "import" && exercise && <ImportDialog fixedExercise={{ ID: exercise.ID, Name: selectedName }}
      onClose={() => setDialog(null)} prepareReplacement={editor.prepareImportReplacement} cancelReplacement={editor.cancelImportReplacement}
      recordDispatch={editor.recordImportDispatch} onReconcile={editor.reconcileImportReplacement} />}
    {dialog === "export" && exercise && <ExportDialog exerciseIds={[exercise.ID]} onClose={() => setDialog(null)} />}
    {dialog === "access" && exercise && <AccessDialog exercise={exercise} originEventName={originEventName} onClose={() => setDialog(null)}
      onSaved={(updated) => { editor.setExercise(updated) }} />}
    {dialog === "propose" && exercise && <ProposeDialog exerciseId={exercise.ID} onClose={() => setDialog(null)}
      onProposed={(proposal) => { editor.setExercise({ ...exercise, PendingProposalID: proposal.ID }); setDialog(null) }} />}
    <RunningLabsDialog open={limitReached !== null && limitReached.items.length > 0} items={limitReached?.items ?? []} onExpired={() => void activeDeploys.refresh()}
      description={t("admin.exTest.limitDescription", { n: limitReached?.items.filter((item) => !item.Expired).length ?? 0, max: maxTests })}
      onClose={() => setLimitReached(null)}
      onEnded={(id) => { activeDeploys.forget(id); setLimitReached((current) => current && { ...current, items: current.items.filter((item) => item.DeployID !== id) }) }} />
    <ConfirmDialog open={cancelNewAsk} tone="danger" onCancel={() => setCancelNewAsk(false)}
      title={t("admin.ex.cancelNew.title")} description={t("admin.ex.cancelNew.description")}
      confirmLabel={t("admin.ex.cancelNew.confirm")}
      onConfirm={() => { setCancelNewAsk(false); leave.allowNavigation(); void editor.autosave.discard(); router.push("/") }} />
    <ConfirmDialog open={leaveDraft} onCancel={leave.cancelLeave}
      title={t("admin.ex.leaveNew.title")} description={t("admin.ex.leaveNew.description")}
      cancelLabel={t("admin.ex.leaveNew.stay")} confirmLabel={t("admin.ex.leaveNew.go")}
      onConfirm={leave.finishLeave} />
    <ConfirmDialog open={leaveOffline} onCancel={() => { setLeaveOffline(false); leave.cancelLeave() }}
      title={t("admin.exPage.leave.title")} description={t("admin.exPage.leave.description")}
      cancelLabel={t("admin.exPage.leave.stay")} confirmLabel={t("admin.exPage.leave.go")}
      onConfirm={() => { setLeaveOffline(false); leave.finishLeave() }} />
  </EditorPositionProvider></ResourcesConfigProvider></DevicePersistenceProvider></ExerciseIdProvider>
}
