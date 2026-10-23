import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
vi.mock("@/api/exercises/archiveImport", () => ({ prepareArchiveImport: vi.fn(), previewArchiveImport: vi.fn(), commitArchiveImport: vi.fn() }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
import { prepareArchiveImport, previewArchiveImport, commitArchiveImport, type ArchivePreviewItem } from "@/api/exercises/archiveImport"
import { useArchiveImport } from "./useArchiveImport"
const item = (id: string): ArchivePreviewItem => ({ ItemKey: id, Name: id, Target: { ItemKey: id, Mode: "new" }, SuggestedTarget: { ItemKey: id, Mode: "new" }, ConfirmationRevision: "r", ReplacesDraft: false } as ArchivePreviewItem)
beforeEach(() => { vi.clearAllMocks(); vi.mocked(prepareArchiveImport).mockResolvedValue({ UploadID: "one" }) })
it("invalidates consent immediately and never installs an old preview after a new source", async () => {
 let resolve!: (value: { Items: ArchivePreviewItem[] }) => void
 vi.mocked(previewArchiveImport).mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue({ Items: [item("current")] })
 const { result } = renderHook(() => useArchiveImport())
 act(() => result.current.chooseFile(new File(["a"], "a.zip")))
 let first!: Promise<void>
 act(() => { first = result.current.previewArchive() })
 await act(async () => { await Promise.resolve() })
 act(() => result.current.chooseFile(new File(["b"], "b.zip")))
 await act(async () => { await result.current.previewArchive() })
 await act(async () => { resolve({ Items: [item("old")] }); await first })
 expect(result.current.preview?.Items[0].ItemKey).toBe("current")
 act(() => result.current.setPassword("different"))
 expect(result.current.preview).toBeNull()
 await expect(result.current.commit(false)).rejects.toThrow()
 expect(commitArchiveImport).not.toHaveBeenCalled()
})
it("preserves upload across password/target previews and blocks duplicate destinations locally", async () => {
 vi.mocked(previewArchiveImport).mockImplementation(async input => ({ Items: [item("a"), item("b")].map(value => ({ ...value, Target: input.Targets?.find(choice => choice.ItemKey === value.ItemKey) ?? value.Target })) }))
 const { result } = renderHook(() => useArchiveImport())
 act(() => result.current.chooseFile(new File(["a"], "a.zip")))
 await act(async () => { await result.current.previewArchive() })
 act(() => result.current.setPassword("pw"))
 await act(async () => { await result.current.previewArchive() })
 expect(prepareArchiveImport).toHaveBeenCalledTimes(1)
 await act(async () => { await result.current.chooseTarget("a", { ItemKey: "a", Mode: "update", ExerciseID: "same" }) })
 await act(async () => { await result.current.chooseTarget("b", { ItemKey: "b", Mode: "update", ExerciseID: "same" }) })
 expect(result.current.targetErrors.b).toBeTruthy()
 expect(result.current.preview).toBeNull()
})
