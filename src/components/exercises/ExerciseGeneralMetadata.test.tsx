import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import type { Version } from "@/api/exercises/versions"
import type { Exercise } from "@/api/exercises/catalog"
import { ExerciseGeneralMetadata } from "./ExerciseGeneralMetadata"
vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string>) => vars?.name ? `${key}: ${vars.name}` : key }))
const exercise: Exercise = { ...OWNERSHIP, ID:"ex1", Name:"Public task", Description:"", Tags:[], DraftVersionID:"draft", PublishedVersionID:"pub", ArchivedAt:null, HasChanges:true, CreatedAt:"2026-01-01", CreatedBy:"creator", AuthorName:"Creator Name", UpdatedAt:"", UpdatedBy:null }

const publication: Version = {
  ID:"pub", ExerciseID:"ex1", Status:"published", AdminNote:"", Label:"", Variants:[{ ID:"v1", Index:1, Note:"", LinkedTo:"", Tasks:[], Topology:{ VPN:{ Enabled:false, DHCP:true }, Internet:{ Enabled:false, DHCP:true }, Devices:[{ ID:"dev1", Name:"server", Type:"container", SecurityPreset:"", Image:"fixture", ResourcePreset:"", Interfaces:[], EnvVars:[], External:null }], Connections:[], VisualRender:null } }],
  Resources:null, Elevation:null, CreatedAt:"", CreatedBy:null, PublishedAt:"2026-10-16T12:00:00Z",
}
const totals = { Devices:0, Blocks:0, CPUMillicores:0, MemoryBytes:0 }
const heavyPublication: Version = { ...publication, Variants:[], Resources:{ Min:totals, Max:totals, Variants:[], SpreadPercent:0, VariantsDiffer:false, Outside:[], ResourceHeavy:true } }

describe("General metadata", () => {
  it("shows the creator and independently conditional published properties", () => {
    const { rerender } = render(<ExerciseGeneralMetadata exercise={{ ...exercise, Infrastructure:false, ResourceHeavy:true }} publishedVersion={publication} publishedAt="2026-10-16T12:00:00Z" eventName={() => undefined} />)
    expect(screen.getByText("admin.exGeneral.author: Creator Name")).toBeInTheDocument()
    expect(screen.getByRole("button", { name:"admin.exGeneral.network" })).toHaveAccessibleDescription("admin.exGeneral.networkHelp")
    expect(screen.queryByRole("button", { name:"exercises.res.heavy" })).not.toBeInTheDocument()
    rerender(<ExerciseGeneralMetadata exercise={{ ...exercise, Infrastructure:true, ResourceHeavy:false }} publishedVersion={heavyPublication} publishedAt={null} eventName={() => undefined} />)
    expect(screen.queryByRole("button", { name:"admin.exGeneral.network" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name:"exercises.res.heavy" })).toHaveAccessibleDescription("admin.exGeneral.resourcesHelp")
    expect(screen.queryByText("admin.exPage.meta.published")).not.toBeInTheDocument()
    rerender(<ExerciseGeneralMetadata exercise={{ ...exercise, PublishedVersionID:null, Infrastructure:true, ResourceHeavy:true }} publishedVersion={publication} publishedAt={null} eventName={() => undefined} />)
    expect(screen.queryByRole("button", { name:"admin.exGeneral.network" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name:"exercises.res.heavy" })).not.toBeInTheDocument()
  })

  it("ignores a snapshot that belongs to another task or publication", () => {
    const { rerender } = render(<ExerciseGeneralMetadata exercise={exercise} publishedVersion={{ ...heavyPublication, ExerciseID:"other-task" }} publishedAt={null} eventName={() => undefined} />)
    expect(screen.queryByRole("button", { name:"exercises.res.heavy" })).not.toBeInTheDocument()
    rerender(<ExerciseGeneralMetadata exercise={exercise} publishedVersion={{ ...publication, ID:"other-publication" }} publishedAt={null} eventName={() => undefined} />)
    expect(screen.queryByRole("button", { name:"admin.exGeneral.network" })).not.toBeInTheDocument()
  })

  it("opens an availability-only dialog and keeps hidden names redacted", () => {
    render(<ExerciseGeneralMetadata exercise={{ ...exercise, AccessLevel:"selected", AccessEventIDs:["known", "hidden-secret-id"], AccessEvents:[{ ID:"known", Name:"Visible event" }] }} publishedVersion={null} publishedAt={null} eventName={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name:"admin.exGeneral.access" }))
    const dialog = screen.getByRole("dialog", { name:"admin.exGeneral.access" })
    expect(within(dialog).getByText("Visible event")).toBeInTheDocument()
    expect(within(dialog).getByText("admin.exGeneral.redactedEvent")).toBeInTheDocument()
    expect(within(dialog).queryByText("hidden-secret-id")).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Creator Name/)).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name:"admin.exGeneral.close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("does not infer no access from an absent selected list", () => {
    render(<ExerciseGeneralMetadata exercise={{ ...exercise, AccessLevel:"selected", AccessEventIDs:[], AccessEvents:[] }} publishedVersion={null} publishedAt={null} eventName={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name:"admin.exGeneral.access" }))
    expect(screen.getByText("exercises.access.level.selected")).toBeInTheDocument()
    expect(screen.getByText("admin.exGeneral.redactedEvents")).toBeInTheDocument()
    expect(screen.queryByText("exercises.access.level.none")).not.toBeInTheDocument()
  })
})
