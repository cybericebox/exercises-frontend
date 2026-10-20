// @vitest-environment jsdom
import {Component, StrictMode, type ReactNode} from "react"
import {act, cleanup, render, screen} from "@testing-library/react"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {ChunkRecovery} from "./ChunkRecovery"

const state = vi.hoisted(() => ({notify: null as null | ((error: Error) => void), unsubscribe: vi.fn()}))
vi.mock("@/lib/chunkRecovery", () => ({installChunkRecovery: () => ({
  subscribe: (listener: (error: Error) => void) => {
    state.notify = listener
    return state.unsubscribe
  },
})}))
class Boundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  render() { return this.state.failed ? <p role="alert">shared error boundary</p> : this.props.children }
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => { state.notify = null; state.unsubscribe.mockClear() })

describe("chunk recovery bridge", () => {
  it("keeps the page intact until a repeat failure is announced", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<Boundary><ChunkRecovery /><p>working page</p></Boundary>)
    expect(screen.getByText("working page")).toBeTruthy()
    act(() => state.notify?.(Object.assign(new Error("missing old chunk"), {name: "ChunkLoadError"})))
    expect(screen.getByRole("alert").textContent).toBe("shared error boundary")
    expect(screen.queryByText("working page")).toBeNull()
  })
  it("unsubscribes when unmounted and remains safe during React strict effects", () => {
    const view = render(<StrictMode><ChunkRecovery /></StrictMode>)
    expect(view.container.innerHTML).toBe("")
    expect(state.unsubscribe).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(state.unsubscribe).toHaveBeenCalledTimes(2)
  })
})
