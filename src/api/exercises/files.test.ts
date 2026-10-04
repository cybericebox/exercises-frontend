import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { apiOrigin } from "@/lib/origins"
import { isServiceDown, reportServiceAvailable } from "@/lib/serviceStatus"
import { uploadExerciseFile, exerciseFileURL } from "./files"

const FILE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

class UploadRequest {
  static instances: UploadRequest[] = []
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  withCredentials = false
  status = 200
  responseText = ""
  open = vi.fn()
  send = vi.fn()
  getResponseHeader = vi.fn().mockReturnValue(null)

  constructor() { UploadRequest.instances.push(this) }
}

describe("exercise file upload", () => {
  beforeEach(() => { UploadRequest.instances = []; vi.stubGlobal("XMLHttpRequest", UploadRequest) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); reportServiceAvailable() })

  it("sends multipart data with credentials and reports actual upload progress", async () => {
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" })
    const progress = vi.fn()
    const promise = uploadExerciseFile(file, progress)
    const request = UploadRequest.instances[0]
    expect(request.open).toHaveBeenCalledWith("POST", `${apiOrigin}/api/exercises/files`)
    expect(request.withCredentials).toBe(true)
    expect((request.send.mock.calls[0][0] as FormData).get("file")).toBe(file)
    request.upload.onprogress?.({ lengthComputable: true, loaded: 42, total: 100 } as ProgressEvent)
    expect(progress).toHaveBeenCalledWith(42)
    request.responseText = JSON.stringify({ Status: { Code: 10000, Message: "Success" }, Data: { FileID: FILE_ID, Name: "notes.pdf", Size: 5 } })
    request.onload?.()
    await expect(promise).resolves.toEqual({ FileID: FILE_ID, Name: "notes.pdf", Size: 5 })
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it("preserves API error status and code", async () => {
    const promise = uploadExerciseFile(new File(["x"], "big.bin"))
    const request = UploadRequest.instances[0]
    request.status = 413
    request.responseText = JSON.stringify({ Status: { Code: 21002, Message: "File exceeds the maximum upload size" } })
    request.onload?.()
    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(413)
      expect((error as ApiError).code).toBe(21002)
      return true
    })
  })

  it("shows the API outage state when the upload loses its connection", async () => {
    const promise = uploadExerciseFile(new File(["x"], "notes.pdf"))
    UploadRequest.instances[0].onerror?.()
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
  })

  it("shows the API outage state when the upload endpoint returns 503", async () => {
    const promise = uploadExerciseFile(new File(["x"], "notes.pdf"))
    const request = UploadRequest.instances[0]
    request.status = 503
    request.onload?.()
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
  })

  it("redirects an expired upload session without reporting a file error", async () => {
    const replace = vi.fn()
    vi.stubGlobal("window", { location: {
      href: "https://admin.cybericebox-dev.pp.ua/exercises/new",
      origin: "https://admin.cybericebox-dev.pp.ua",
      replace,
    } })
    const setCookie = vi.spyOn(document, "cookie", "set")
    const settled = vi.fn()
    void uploadExerciseFile(new File(["x"], "notes.pdf")).then(settled, settled)
    const request = UploadRequest.instances[0]
    request.status = 401
    request.getResponseHeader.mockReturnValue("https://id.cybericebox-dev.pp.ua/sign-in")
    request.onload?.()
    await Promise.resolve()
    expect(setCookie).toHaveBeenCalledWith(expect.stringContaining("cib_return_to="))
    expect(replace).toHaveBeenCalledWith("https://id.cybericebox-dev.pp.ua/sign-in")
    expect(settled).not.toHaveBeenCalled()
  })
})

describe("exerciseFileURL", () => {
  it("builds the cookie-authenticated download URL", () => {
    expect(exerciseFileURL(FILE_ID)).toBe(`${apiOrigin}/api/exercises/files/${FILE_ID}`)
  })
})
