import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AttachmentDownload } from "./AttachmentDownload"
import { apiGetBlob } from "@/api/client"
import { downloadBlob } from "@/lib/downloadBlob"
vi.mock("@/api/client", async (original) => ({ ...await original<typeof import("@/api/client")>(), apiGetBlob: vi.fn() }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
describe("attachment download block", () => {
 it("fetches the bytes once, shows operation state and saves under the displayed filename", async () => {
  let resolve!: (r: {blob: Blob; filename: string}) => void
  vi.mocked(apiGetBlob).mockReturnValue(new Promise(r => { resolve = r }))
  render(<AttachmentDownload file={{ FileID: "f1", Name: "capture.pcap" }} />)
  const button = screen.getByRole("button", { name: /capture.pcap/ })
  expect(button).not.toHaveAttribute("href")
  fireEvent.click(button); fireEvent.click(button)
  expect(button).toHaveAttribute("aria-busy", "true")
  expect(button).toBeDisabled()
  expect(button).toHaveAccessibleName(/Завантажуємо/)
  const blob = new Blob(["data"])
  await act(async () => resolve({ blob, filename: "server-name" }))
  expect(apiGetBlob).toHaveBeenCalledTimes(1)
  expect(apiGetBlob).toHaveBeenCalledWith("/api/exercises/files/f1")
  expect(downloadBlob).toHaveBeenCalledWith(blob, "capture.pcap")
  expect(button).toBeEnabled()
 })
 it("keeps the filename and shows a retryable error if downloading fails", async () => {
  vi.mocked(apiGetBlob).mockRejectedValue(new Error("offline"))
  render(<AttachmentDownload file={{ FileID: "f1", Name: "capture.pcap" }} />)
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
  expect(screen.getByRole("button")).toBeEnabled()
  expect(screen.getByText("capture.pcap")).toBeInTheDocument()
 })
})
