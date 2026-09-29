import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadBlob } from "./downloadBlob"

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("downloadBlob", () => {
  it("clicks a temporary link with the file name and revokes the object URL", () => {
    vi.useFakeTimers()
    const revoke = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:mock") })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke })
    const seen: { download: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.href })
    })
    downloadBlob(new Blob(["zip"]), "x.cybericebox.zip")
    expect(seen).toEqual([{ download: "x.cybericebox.zip", href: "blob:mock" }])
    expect(document.querySelector("a[download]")).toBeNull()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith("blob:mock")
  })
})
