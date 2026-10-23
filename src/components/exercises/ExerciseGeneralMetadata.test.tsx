import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import type { Version, VersionResources } from "@/api/exercises/versions"
import type { Exercise } from "@/api/exercises/catalog"
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { averageDifficulty, ExerciseGeneralMetadata, type GeneralStatus } from "./ExerciseGeneralMetadata"
vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
const exercise: Exercise = { ...OWNERSHIP, ID:"ex1", Name:"Public task", Description:"", Tags:[], DraftVersionID:"draft", PublishedVersionID:"pub", ArchivedAt:null, HasChanges:true, CreatedAt:"2026-01-01", CreatedBy:"creator", AuthorName:"Creator Name", UpdatedAt:"", UpdatedBy:null }
const totals = { Devices:0, Blocks:0, CPUMillicores:0, MemoryBytes:0 }
const resources: VersionResources = { Min:totals, Max:{ Devices:3, Blocks:6, CPUMillicores:2500, MemoryBytes:2.5 * 1024 ** 3 }, Variants:[], SpreadPercent:0, VariantsDiffer:false, Outside:[], ResourceHeavy:false }
const publication: Version = { ID:"pub", ExerciseID:"ex1", Status:"published", AdminNote:"", Label:"", Variants:[], Resources:{ ...resources, ResourceHeavy:true }, Elevation:null, CreatedAt:"", CreatedBy:null, PublishedAt:"2026-10-16T12:00:00Z" }

function draft(): DraftFormValues {
  const value = emptyDraft()
  value.Variants = [
    { ...emptyVariant(1), Tasks:[{ ...emptyTask(), Difficulty:"easy" }, { ...emptyTask(), Difficulty:"hard" }] },
    { ...emptyVariant(2), Tasks:[{ ...emptyTask(), Difficulty:"insane" }, { ...emptyTask(), Difficulty:"insane" }] },
  ]
  return value
}

function Card({ value = exercise, status = "changed", withResources = true, published = publication, usage = [] }: { value?: Exercise; status?: GeneralStatus; withResources?: boolean; published?: Version | null; usage?: string[] }) {
  const form = useForm<DraftFormValues>({ defaultValues: draft() })
  return <ExerciseGeneralMetadata exercise={value} publishedVersion={published} publishedAt={published?.PublishedAt ?? null} eventName={() => undefined}
    draftForm={form} status={status} resources={withResources ? resources : null} usageEvents={usage} />
}

const fact = (label: string) => screen.getByText(label, { selector: "dt, dt *" }).closest("div")!

describe("General facts", () => {
  it("lists status, publication, counts, the average difficulty of variant 1, the largest variant's resources, owner and author", () => {
    render(<Card usage={["Winter CTF", "School CTF"]} />)
    expect(fact("admin.exGeneral.status")).toHaveTextContent("exercises.status.short.changed")
    expect(fact("admin.exGeneral.published")).toBeInTheDocument()
    expect(fact("admin.exGeneral.counts")).toHaveTextContent('admin.exGeneral.countsValue {"subtasks":2,"variants":2}')
    // (easy 3 + hard 5) / 2 = 4 → medium; variant 2 does not count.
    expect(fact("admin.exGeneral.difficulty")).toHaveTextContent("admin.ex.difficulty.medium")
    expect(fact("admin.exGeneral.resources")).toHaveTextContent("admin.exGeneral.resourcesValue")
    expect(fact("admin.exGeneral.status")).toHaveTextContent("exercises.res.heavy")
    expect(fact("admin.exGeneral.owner")).toHaveTextContent("exercises.owner.catalog")
    expect(fact("admin.exGeneral.authorLabel")).toHaveTextContent("Creator Name")
    expect(fact("admin.exGeneral.usedIn")).toHaveTextContent("Winter CTF, School CTF")
  })

  it("leaves out what is unknown: no publication, no devices, no use", () => {
    render(<Card status="draft" withResources={false} published={null} />)
    expect(screen.queryByText("admin.exGeneral.published")).not.toBeInTheDocument()
    expect(screen.queryByText("admin.exGeneral.resources")).not.toBeInTheDocument()
    expect(screen.queryByText("admin.exGeneral.usedIn")).not.toBeInTheDocument()
    expect(fact("admin.exGeneral.status")).toHaveTextContent("exercises.status.short.draft")
  })

  it("computes the average level of the subtasks", () => {
    expect(averageDifficulty([])).toBeNull()
    expect(averageDifficulty([{ Difficulty:"elementary" }, { Difficulty:"insane" }])).toBe(3.5)
  })

  it("opens an availability-only dialog and keeps hidden names redacted", () => {
    render(<Card value={{ ...exercise, AccessLevel:"selected", AccessEventIDs:["known", "hidden-secret-id"], AccessEvents:[{ ID:"known", Name:"Visible event" }] }} />)
    fireEvent.click(screen.getByRole("button", { name:"exercises.access.level.selected" }))
    const dialog = screen.getByRole("dialog", { name:"admin.exGeneral.access" })
    expect(within(dialog).getByText("Visible event")).toBeInTheDocument()
    expect(within(dialog).getByText("admin.exGeneral.redactedEvent")).toBeInTheDocument()
    expect(within(dialog).queryByText("hidden-secret-id")).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name:"admin.exGeneral.close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("does not infer no access from an absent selected list", () => {
    render(<Card value={{ ...exercise, AccessLevel:"selected", AccessEventIDs:[], AccessEvents:[] }} />)
    fireEvent.click(screen.getByRole("button", { name:"exercises.access.level.selected" }))
    expect(screen.getAllByText("exercises.access.level.selected").length).toBeGreaterThan(0)
    expect(screen.getByText("admin.exGeneral.redactedEvents")).toBeInTheDocument()
    expect(screen.queryByText("exercises.access.level.none")).not.toBeInTheDocument()
  })
})
