import { describe, expect, it } from "vitest"
import { canPublishExercise, exerciseBadgeKind, formatExerciseDate, formatExerciseDateTime } from "./exerciseStatus"

const base = { ArchivedAt: null, PublishedVersionID: null, HasChanges: true }

describe("exercise status badge", () => {
  it("covers the four header states", () => {
    expect(exerciseBadgeKind(base)).toBe("none")
    expect(exerciseBadgeKind({ ...base, PublishedVersionID: "p1", HasChanges: false })).toBe("published")
    expect(exerciseBadgeKind({ ...base, PublishedVersionID: "p1", HasChanges: true })).toBe("changes")
    expect(exerciseBadgeKind({ ...base, PublishedVersionID: "p1", ArchivedAt: "2026-09-20T00:00:00Z" })).toBe("archived")
  })

  it("allows publishing only when the working copy has changes and is not archived", () => {
    expect(canPublishExercise({ ArchivedAt: null, HasChanges: true })).toBe(true)
    expect(canPublishExercise({ ArchivedAt: null, HasChanges: false })).toBe(false)
    expect(canPublishExercise({ ArchivedAt: "2026-09-20T00:00:00Z", HasChanges: true })).toBe(false)
  })
})

describe("exercise dates", () => {
  const now = new Date(2026, 8, 26, 15, 0)

  it("says 'today' with the time for today's changes", () => {
    expect(formatExerciseDateTime(new Date(2026, 8, 26, 11, 42).toISOString(), now)).toBe("сьогодні о 11:42")
  })

  it("prints the full date and time otherwise", () => {
    expect(formatExerciseDateTime(new Date(2026, 8, 20, 9, 30).toISOString(), now)).toBe("20.09.2026, 09:30")
    expect(formatExerciseDate(new Date(2026, 8, 20, 9, 30).toISOString())).toBe("20.09.2026")
  })
})
