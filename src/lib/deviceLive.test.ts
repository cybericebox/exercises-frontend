import { describe, expect, it } from "vitest"
import { startingNote } from "./deviceLive"

const queue = { Position: 0, Length: 1, Reason: "", Message: "", Pods: 3, Pending: 0 }

describe("starting note", () => {
  it("waits for the long wait before it says anything", () => {
    expect(startingNote({ ...queue, Reason: "Withdrawn" }, false)).toBeNull()
  })

  it("gives a calm line while a new cluster node starts", () => {
    expect(startingNote({ ...queue, Reason: "NodeStarting" }, true)).toBe("Готуємо додаткові потужності кластера. Це може зайняти декілька хвилин, лабораторія запуститься автоматично.")
  })

  it("says resources are short for every resource wait, a withdrawn launch included", () => {
    for (const Reason of ["InsufficientResources", "NoSchedulableNodes", "TenantQuota", "DoesNotFitNow", "ReservationMissing", "ReservationNotActive", "ReservationFull", "Withdrawn"]) {
      expect(startingNote({ ...queue, Reason }, true)).toBe("Зараз бракує ресурсів. Лабораторія запуститься, щойно вони звільняться.")
    }
  })

  it("keeps the generic line for pacing reasons", () => {
    expect(startingNote({ ...queue, Reason: "WaitingForTurn" }, true)).toContain("Ще трохи")
    expect(startingNote(null, true)).toContain("Ще трохи")
  })
})
