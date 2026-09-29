import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { useExerciseLeaveGuard } from "./useExerciseLeaveGuard"

type FakeNavigate = Event & { destination: { url: string }; navigationType: string; canIntercept: boolean }

function navigateEvent(url: string, navigationType: string): FakeNavigate {
  return Object.assign(new Event("navigate", { cancelable: true }), {
    destination: { url: new URL(url, window.location.href).href }, navigationType, canIntercept: true,
  })
}

let navigation: EventTarget

beforeEach(() => {
  window.history.replaceState(null, "", "/new")
  navigation = new EventTarget()
  Object.defineProperty(window, "navigation", { configurable: true, value: navigation })
})

afterEach(() => {
  Reflect.deleteProperty(window, "navigation")
})

describe("useExerciseLeaveGuard navigate events", () => {
  it("lets an in-place replace through after the address changed", () => {
    const { result } = renderHook(() => useExerciseLeaveGuard(true))
    window.history.replaceState(null, "", "/detail?id=x")
    const event = navigateEvent("/detail?id=x", "replace")
    act(() => { navigation.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(false)
    expect(result.current.destination).toBeNull()
  })

  it("ignores a navigation to the current location, read at event time", () => {
    const { result } = renderHook(() => useExerciseLeaveGuard(true))
    window.history.replaceState(null, "", "/detail?id=x")
    const event = navigateEvent("/detail?id=x", "push")
    act(() => { navigation.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(false)
    expect(result.current.destination).toBeNull()
  })

  it("intercepts a push to another path while guarded", () => {
    const { result } = renderHook(() => useExerciseLeaveGuard(true))
    const event = navigateEvent("/", "push")
    act(() => { navigation.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    expect(result.current.destination).toBe("/")
  })
})
