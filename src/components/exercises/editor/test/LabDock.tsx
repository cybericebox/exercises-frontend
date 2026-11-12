"use client"

import { X } from "lucide-react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTask, NormalizedTopology } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import type { LabChip } from "@/lib/testLab"
import { cn } from "@/utils/cn"
import { AuthorTab } from "./AuthorTab"
import { DeviceList, type DeviceActions } from "./DeviceList"
import { SchemaTab } from "./SchemaView"

export type DockTab = "devices" | "schema" | "author"

/**
 * The lab panel at the right: «Пристрої» (how far the start is, every device, its access), «Схема» (the schema with the
 * stage of each device) and «Для автора» (what only the author sees about each task). The panel never shows data the
 * participant must have in the task: that stays in the middle.
 */
export function LabDock({ tab, onTab, topology, status, chip, deployId, tasks, currentTaskId, solvedIds, expanded, onToggleDevice, actions, schemaSelected, onSchemaSelect, onFull, author, onClose, sheet }: {
  tab: DockTab
  onTab: (tab: DockTab) => void
  topology: NormalizedTopology
  status: DeployStatus | null
  chip: LabChip
  deployId: string
  tasks: NormalizedTask[]
  currentTaskId: string | null
  solvedIds: ReadonlySet<string>
  expanded: ReadonlySet<string>
  onToggleDevice: (device: string) => void
  actions: DeviceActions
  schemaSelected: string | null
  onSchemaSelect: (key: string | null) => void
  onFull: () => void
  /** The author's data is shown («Для автора» tab, limits). */
  author: boolean
  onClose: () => void
  /** Shown as a sheet over the page (narrow screens): the close button is always there. */
  sheet: boolean
}) {
  const tabs: DockTab[] = author ? ["devices", "schema", "author"] : ["devices", "schema"]
  const current = tabs.includes(tab) ? tab : "devices"
  return <aside id="lab-dock" aria-label={t("ed.d.dock.label")} className="flex min-h-0 w-full flex-col bg-background">
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
      <div role="tablist" aria-label={t("ed.d.dock.label")} className="flex min-w-0 flex-1 gap-4">
        {tabs.map((id) => <button key={id} type="button" role="tab" id={`lab-tab-${id}`} aria-selected={current === id} aria-controls={`lab-panel-${id}`} onClick={() => onTab(id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
            current === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t(`ed.d.dock.tab.${id}`)}</button>)}
      </div>
      <HoverTooltip text={t("ed.d.dock.hide")}>
        <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8", !sheet && "max-lg:hidden")} aria-label={t("ed.d.dock.hide")} onClick={onClose}><X aria-hidden="true" size={16} /></Button>
      </HoverTooltip>
    </div>
    <div role="tabpanel" id={`lab-panel-${current}`} aria-labelledby={`lab-tab-${current}`} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {current === "devices" && <DeviceList topology={topology} status={status} chip={chip} deployId={deployId} expanded={expanded} onToggle={onToggleDevice} actions={actions} author={author} />}
      {current === "schema" && <SchemaTab topology={topology} status={status} selected={schemaSelected} onSelect={onSchemaSelect} onFull={onFull} />}
      {current === "author" && <AuthorTab tasks={tasks} currentId={currentTaskId} status={status} devices={topology.Devices} solvedIds={solvedIds} />}
    </div>
  </aside>
}
