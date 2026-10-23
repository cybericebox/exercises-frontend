import { beforeEach, expect, it } from "vitest"
import { clearImportReplacement, readImportReplacement, recordImportPlan, settleImportPlan } from "./importReplacement"
const plan = { UploadID: "u", Password: "never-store", Targets: [{ ItemKey: "one", Mode: "update" as const, ExerciseID: "task" }, { ItemKey: "two", Mode: "new" as const }], ConfirmedUpdates: [{ ItemKey: "one", Revision: "rev", ReplaceDraft: true }] }
beforeEach(() => localStorage.clear())
it("keeps source and complete plan for mixed recovery, scopes every selected task, never password or content", () => {
 recordImportPlan("actor", plan, "job")
 expect(readImportReplacement("actor", "task")).toMatchObject({ actorID: "actor", exerciseID: "task", jobID: "job", plan: { UploadID: "u", Targets: plan.Targets, ConfirmedUpdates: plan.ConfirmedUpdates } })
 expect(readImportReplacement("actor", "__catalog__")?.plan).not.toHaveProperty("Password")
 expect(readImportReplacement("other", "task")).toBeNull()
})
it("a late different operation cannot clear or settle the current fence", () => {
 recordImportPlan("actor", plan, "first")
 const other = { ...plan, UploadID: "different" }
 recordImportPlan("actor", other, "second")
 settleImportPlan("actor", plan, false)
 expect(readImportReplacement("actor", "task")?.jobID).toBe("second")
 settleImportPlan("actor", other, true)
 expect(readImportReplacement("actor", "task")?.state).toBe("done")
 clearImportReplacement("actor", "task")
 expect(readImportReplacement("actor", "task")).toBeNull()
})

it("drains a retained orphaned editor before the import can preview that target", async () => {
 const { registerImportEditor, prepareImportEditors, releaseImportEditors } = await import("./importReplacement")
 let finish!: () => void
 let settled = false, cancelled = false
 const unregister = registerImportEditor("actor", "task", { prepare: () => new Promise<boolean>(resolve => { finish = () => resolve(true) }), cancel: () => { cancelled = true } })
 const preparing = prepareImportEditors("actor", ["task"]).then(ok => { settled = true; return ok })
 expect(settled).toBe(false)
 finish(); expect(await preparing).toBe(true)
 releaseImportEditors("other", ["task"]); expect(cancelled).toBe(false)
 releaseImportEditors("actor", ["task"]); expect(cancelled).toBe(true)
 unregister()
})
