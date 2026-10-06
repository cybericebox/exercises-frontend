"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWatch } from "react-hook-form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import type { Exercise } from "@/api/exercises/catalog"
import { listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { listVersions, type DeviceOutside, type Version } from "@/api/exercises/versions"
import { ErrorScreen } from "@/components/ErrorScreen"
import { NotFoundScreen } from "@/components/NotFoundScreen"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActiveDeploys } from "@/lib/useActiveDeploys"
import { DraftVariants } from "@/components/exercises/DraftFields"
import { DevicePersistenceProvider } from "@/components/exercises/DevicePersistenceContext"
import { EditorPositionProvider, useEditorValidationFocus } from "@/components/exercises/EditorPosition"
import { ArchivedBanner, VersionBanner } from "@/components/exercises/ExerciseBanners"
import { ExerciseGeneralFields } from "@/components/exercises/ExerciseGeneralFields"
import { ExerciseHeader, type HeaderBadge, type HeaderMode, type TestVariantOption } from "@/components/exercises/ExerciseHeader"
import { ResourcesPanel } from "@/components/exercises/ResourcesPanel"
import { ResourcesConfigProvider } from "@/components/exercises/ResourcesConfigContext"
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { RunningLabsDialog } from "@/components/exercises/RunningLabsDialog"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { HistoryDialog } from "@/components/exercises/HistoryDialog"
import { SnapshotDialog } from "@/components/exercises/SnapshotDialog"
import { useExerciseActions } from "@/components/exercises/useExerciseActions"
import { useExerciseEditor } from "@/components/exercises/useExerciseEditor"
import { Card, CardContent } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { LoadingArea } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { DEFAULT_EDITOR_POSITION, editorPositionStorageKey, parseEditorPosition, type EditorPosition } from "@/lib/editorPosition"
import { exerciseHref, testLabHref, testLabStartHref } from "@/lib/exerciseRoutes"
import { canPublishExercise, formatExerciseDate, formatExerciseDateTime } from "@/lib/exerciseStatus"
import { useExerciseLeaveGuard } from "@/lib/useExerciseLeaveGuard"
import { useRole } from "@/lib/useRole"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { useReturnContext } from "@/components/shell/ReturnContext"
import { defaultOwner, editorPermissions, infrastructureAllowed, isReadOnlyCatalogView, ownerOptions } from "@/lib/exerciseRights"
import { SelectMenu } from "@/components/ui/select-menu"
import { AccessDialog } from "./AccessDialog"
import { EventReturnCallout, InfrastructureBlockedNote, ReadOnlyBanner } from "./EventBanners"
import { InfrastructureIcon, OwnershipBadges } from "./OwnershipBadges"
import { AccessCell, ResourceHeavyBadge, StatusBadges } from "./catalog/CatalogCells"
import { headerStatus } from "@/lib/catalogList"
import { ProposeDialog } from "./ProposeDialog"

// eventId: owner event of a new exercise (from /new?event=…), used from Phase 2 on.
type Props = { exerciseId: string | null; versionId: string | null; eventId?: string | null }
type DialogName = "history" | "snapshot" | "revert" | "archive" | "delete" | "export" | "access" | "propose"

export function ExercisePage(props: Props) {
  const { isLoading } = useRole()
  if (isLoading) return <LoadingArea className="h-full" label={t("admin.loading")} />
  return <ExerciseScreen {...props} />
}

function ExerciseMeta({ exercise, version, isVersion, publishedAt }: {
  exercise: Exercise | null
  version: Version | null
  isVersion: boolean
  publishedAt: string | null
}) {
  let text: string | null
  if (!exercise) {
    text = null
  } else if (isVersion && version) {
    const author = version.AuthorName
    text = [t(`admin.exHistory.kind.${version.Status}`), formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt), author]
      .filter(Boolean).join(" · ")
  } else {
    // Publication info only; Exercise.UpdatedAt does not track working-copy edits.
    text = publishedAt ? t("admin.exPage.meta.published", { date: formatExerciseDate(publishedAt) }) : null
  }
  return text ? <span className="text-xs text-muted-foreground">{text}</span> : null
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
  const [published, setPublished] = useState<{ versionId: string; at: string | null } | null>(null)
  const [position, setPosition] = useState<EditorPosition>(DEFAULT_EDITOR_POSITION)
  const [leaveOffline, setLeaveOffline] = useState(false)
  const { formRef, focusField } = useEditorValidationFocus()

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
  const exercise = editor.exercise
  // Rights follow the loaded card (server Permissions); synced from the editor state.
  if (exercise !== loadedExercise) setLoadedExercise(exercise)
  const readOnly = editor.readOnly
  const ownerEventId = exercise ? exercise.OwnerEventID : owner || null
  const infraAllowed = infrastructureAllowed(access, ownerEventId)
  const publishedIdRef = useRef<string | null | undefined>(undefined)
  const archived = Boolean(exercise?.ArchivedAt)
  const editing = !isVersion && !archived && mode === "edit" && permissions.write && !readOnly && (exercise !== null || owner !== null)
  const saveStatus = editor.autosave.status
  const leave = useExerciseLeaveGuard(editing && exercise !== null && (saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error"))
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
  useEffect(() => {
    // Read-only viewers have no history access (403): the published date comes with the version.
    if (!currentId || !publishedVersionId || readOnly) return
    let cancelled = false
    listVersions(currentId)
      .then((versions) => {
        if (!cancelled) setPublished({ versionId: publishedVersionId, at: versions.find((v) => v.ID === publishedVersionId)?.PublishedAt ?? null })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [currentId, publishedVersionId, readOnly])
  const publishedAt = readOnly ? editor.version?.PublishedAt ?? null
    : published && published.versionId === publishedVersionId ? published.at : null

  useEffect(() => {
    if (!leave.destination) return
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

  const watchedVariants = useWatch({ control: editor.draftForm.control, name: "Variants" }) ?? []
  const resourceBlocked = Boolean(editor.version?.Resources?.Outside.some((issue) => !issue.Covered))
  // The elevation dialog picks a larger block per device: it is written to that device of the working copy.
  const pickDeviceBlock = useCallback((issue: DeviceOutside, presetId: string) => {
    const variants = editor.draftForm.getValues("Variants")
    const variantIndex = variants.findIndex((variant) => variant.ID === issue.VariantID)
    const deviceIndex = variantIndex < 0 ? -1 : variants[variantIndex].Topology.Devices.findIndex((device) => device.ID === issue.DeviceID)
    if (deviceIndex >= 0) editor.draftForm.setValue(`Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ResourcePreset`, presetId, { shouldDirty: true })
  }, [editor.draftForm])
  const getTestVariants = useCallback((): TestVariantOption[] =>
    editor.draftForm.getValues("Variants").map((variant, index) => ({
      index,
      label: t("admin.exDraft.variantN", { n: index + 1 }),
      disabled: variant.Topology.Devices.length === 0,
    })), [editor.draftForm])

  // The testing page: an active lab is reopened, otherwise the page starts one for the chosen variant.
  const openTest = (deployId: string | undefined = activeDeploy?.DeployID, forExercise: string | null = exerciseId) => {
    if (!forExercise || !deployId) return
    leave.allowNavigation()
    router.push(testLabHref(forExercise, deployId))
  }

  // Test deploy needs a topology with devices and a connected platform infrastructure.
  const hasDevices = watchedVariants.some((variant) => variant.Topology.Devices.length > 0)
  const testBlockedReason = laboratories === null ? "" : !infraAllowed ? t("exercises.infra.blocked")
    : !laboratories ? t("admin.exPage.action.testNoPlatform") : !hasDevices ? t("admin.exPage.action.testNoDevices") : ""
  const testBlocked = laboratories === null || testBlockedReason !== ""

  const owners = access ? ownerOptions(access, t("exercises.owner.catalog")) : []
  if (!exerciseId && !permissions.write) {
    return <p role="alert" className="text-sm text-destructive">{t("admin.ex.create.forbidden")}</p>
  }
  if (editor.loadState === "loading") return <LoadingArea className="h-full" label={t("admin.loading")} />
  if (editor.loadState === "notFound") return <NotFoundScreen block title={t("admin.exDetail.notFound")} />
  if (editor.loadState === "error") return <ErrorScreen title={t("admin.exDetail.loadError")} error={editor.loadError} onRetry={editor.retryLoad} />

  const headerMode: HeaderMode = readOnly ? "readonly" : isVersion ? "version" : exercise === null ? "new" : mode
  const canManageAccess = Boolean(exercise && exercise.Scope === "catalog" && rights.manageAccess && !archived && !isVersion)
  const canPropose = Boolean(exercise && exercise.Scope === "event" && rights.propose && exercise.PublishedVersionID && !archived && !isVersion)
  const originEventName = exercise?.OriginEventID ? access?.Events.find((event) => event.ID === exercise.OriginEventID)?.Name : undefined
  const version = editor.version
  // A version shows its date; the current exercise shows the catalog status badges (in meta).
  const badge: HeaderBadge | null = isVersion && version
    ? { kind: "version", label: t("admin.exPage.badge.version", { date: formatExerciseDate(version.PublishedAt ?? version.CreatedAt) }) }
    : null

  return <DevicePersistenceProvider value={devicePersistence}><ResourcesConfigProvider value={resourcesConfig}><EditorPositionProvider position={position} onChange={updatePosition}>
    <Tabs value={position.tab} onValueChange={(value) => updatePosition("tab", value === "variants" ? "variants" : "general")}
      className="flex min-h-full w-full flex-col gap-4">
      <Link href="/" className="w-fit text-sm text-primary hover:underline">← {t("admin.exDetail.back")}</Link>
      <ExerciseHeader
        mode={headerMode}
        title={exercise?.Name ?? t("admin.ex.create.title")}
        badge={badge}
        meta={exercise && !isVersion ? <>
          <StatusBadges status={headerStatus(exercise)} />
          <ResourceHeavyBadge show={exercise.ResourceHeavy} />
          <InfrastructureIcon show={exercise.Infrastructure} />
          <AccessCell item={exercise} eventName={(id) => access?.Events.find((event) => event.ID === id)?.Name || undefined} />
          <OwnershipBadges exercise={exercise} showAccess={false} showEvent={false} />
        </> : undefined}
        saveStatus={saveStatus}
        permissions={permissions}
        archived={archived}
        publishable={exercise ? canPublishExercise(exercise) : false}
        publishBlockedReason={resourceBlocked ? t("exercises.res.publishBlockedShort") : undefined}
        revertable={Boolean(exercise?.PublishedVersionID && exercise.HasChanges)}
        busy={actions.busy}
        testAvailable={permissions.write}
        testBlocked={testBlocked}
        testBlockedReason={testBlockedReason}
        getTestVariants={getTestVariants}
        usageEvents={actions.usageEvents.map((event) => event.Name)}
        onRetrySave={() => void editor.autosave.flush()}
        onCancelNew={() => void editor.autosave.discard()}
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
                className="h-10 min-w-56 text-sm" />}
          {owner === null && <span className="text-xs text-muted-foreground">{t("exercises.owner.required")}</span>}
        </div>
      )}
      {readOnly && <ReadOnlyBanner returnUrl={returnUrl} />}
      {returnUrl && justDone && <EventReturnCallout returnUrl={returnUrl} kind={justDone} />}
      {!infraAllowed && !readOnly && <InfrastructureBlockedNote />}
      {isVersion && version && exercise && <VersionBanner
        label={t("admin.exPage.version.banner", { date: formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt) })}
        canRestore={permissions.write && !archived}
        busy={actions.busy}
        onBack={() => void actions.openVersion(null)}
        onRestore={() => void actions.restore(version.ID)} />}
      {!isVersion && archived && <ArchivedBanner canUnarchive={permissions.write} busy={actions.busy} onUnarchive={() => void actions.unarchive()} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="general">{t("admin.ex.create.tab.general")}</TabsTrigger>
          <TabsTrigger value="variants">{t("admin.ex.create.tab.variants")}</TabsTrigger>
        </TabsList>
        <ExerciseMeta exercise={exercise} version={version} isVersion={isVersion} publishedAt={publishedAt} />
      </div>
      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col pt-5">
          <Form {...editor.draftForm}>
            <form ref={formRef} noValidate onSubmit={(event) => event.preventDefault()} className="flex flex-1 flex-col gap-5">
              <TabsContent value="general" forceMount className="m-0 flex-1 data-[state=inactive]:hidden">
                <ExerciseGeneralFields identityForm={editor.identityForm} draftForm={editor.draftForm} disabled={!editing || actions.busy} autoFocusName={!exerciseId} />
              </TabsContent>
              <TabsContent value="variants" forceMount className="m-0 flex-1 data-[state=inactive]:hidden">
                {infraAllowed && <ResourcesPanel exerciseId={exercise?.ID ?? null} resources={editor.version?.Resources ?? null} elevation={editor.version?.Elevation ?? null}
                  config={resourcesConfig} canRequest={editing} canPublish={permissions.publish}
                  flush={() => editor.autosave.flush()} onRequested={editor.setElevation} onPickBlock={pickDeviceBlock} />}
                <DraftVariants form={editor.draftForm} disabled={!editing || actions.busy} infrastructureBlocked={!infraAllowed} />
              </TabsContent>
            </form>
          </Form>
        </CardContent>
      </Card>
    </Tabs>

    {dialog === "history" && exercise && <HistoryDialog exerciseId={exercise.ID} viewingVersionId={versionId}
      onClose={() => setDialog(null)}
      onView={(target) => { setDialog(null); void actions.openVersion(target) }} />}
    {dialog === "snapshot" && <SnapshotDialog busy={actions.busy} onCancel={() => setDialog(null)}
      onConfirm={(note) => void actions.snapshot(note).then((ok) => { if (ok) setDialog(null) })} />}
    <ConfirmDialog open={dialog === "revert"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.revert.title")} description={t("admin.exPage.revert.description")} confirmLabel={t("admin.exPage.revert.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.revert().then((ok) => { if (ok) setDialog(null) })} />
    <ConfirmDialog open={dialog === "archive"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.archive.title")} description={t("admin.exPage.archive.description")} confirmLabel={t("admin.exPage.archive.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.archive().then((ok) => { if (ok) setDialog(null) })} />
    <ConfirmDialog open={dialog === "delete"} busy={actions.busy} error={actions.confirmError} tone="danger" cancelLabel={t("admin.exPage.dialog.cancel")}
      title={t("admin.exPage.delete.title")} description={t("admin.exPage.delete.description")} confirmLabel={t("admin.exPage.delete.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.remove().then((ok) => { if (ok) setDialog(null) })} />
    {dialog === "export" && exercise && <ExportDialog exerciseIds={[exercise.ID]} onClose={() => setDialog(null)} />}
    {dialog === "access" && exercise && <AccessDialog exercise={exercise} originEventName={originEventName} onClose={() => setDialog(null)}
      onSaved={(updated) => { editor.setExercise(updated); setDialog(null) }} />}
    {dialog === "propose" && exercise && <ProposeDialog exerciseId={exercise.ID} onClose={() => setDialog(null)}
      onProposed={(proposal) => { editor.setExercise({ ...exercise, PendingProposalID: proposal.ID }); setDialog(null) }} />}
    <RunningLabsDialog open={limitReached !== null && limitReached.items.length > 0} items={limitReached?.items ?? []} now={limitReached?.at ?? 0}
      description={t("admin.exTest.limitDescription", { n: limitReached?.items.filter((item) => !item.Expired).length ?? 0, max: maxTests })}
      onClose={() => setLimitReached(null)}
      onEnded={(id) => { activeDeploys.forget(id); setLimitReached((current) => current && { ...current, items: current.items.filter((item) => item.DeployID !== id) }) }} />
    <ConfirmDialog open={leaveOffline} onCancel={() => { setLeaveOffline(false); leave.cancelLeave() }}
      title={t("admin.exPage.leave.title")} description={t("admin.exPage.leave.description")}
      cancelLabel={t("admin.exPage.leave.stay")} confirmLabel={t("admin.exPage.leave.go")}
      onConfirm={() => { setLeaveOffline(false); leave.finishLeave() }} />
  </EditorPositionProvider></ResourcesConfigProvider></DevicePersistenceProvider>
}
