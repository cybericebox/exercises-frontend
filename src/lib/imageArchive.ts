/**
 * imageArchive.ts — reads a `docker save` archive without loading it into memory.
 *
 * Only the tar headers (512-byte blocks) and the small JSON files are read, through File.slice; the layers stay
 * on disk and the uploader slices them by the offset and size found here. Two layouts are understood:
 *   - Docker ≥25 OCI layout: index.json → (nested index → linux/amd64) → manifest blob → config + layers.
 *   - legacy manifest.json: Config `<hex>.json`, Layers `<id>/layer.tar`, layer digests from the config's
 *     rootfs.diff_ids (a layer.tar is the uncompressed layer, so its sha256 is the diff id).
 * When both are present the OCI layout wins. Only an uncompressed tar is accepted.
 */

/** The largest image archive the platform takes (10 GiB). */
export const MAX_IMAGE_ARCHIVE_BYTES = 10 * 1024 ** 3

export type BlobEntry = {
  /** "sha256:<64 hex>" */
  digest: string
  size: number
  mediaType: string
  /** Where the blob's bytes start in the archive. */
  offset: number
}

export type ImageArchive = { config: BlobEntry; layers: BlobEntry[] }

export type ImageArchiveErrorCode = "gzip" | "notTar" | "noImage" | "multiImage" | "noAmd64" | "tooLarge"

export class ImageArchiveError extends Error {
  constructor(public readonly code: ImageArchiveErrorCode) {
    super(`image archive: ${code}`)
    this.name = "ImageArchiveError"
  }
}

const BLOCK = 512
/** A JSON file larger than this is not an image description. */
const MAX_JSON_BYTES = 16 * 1024 * 1024

const LAYER_TAR = "application/vnd.oci.image.layer.v1.tar"
const OCI_CONFIG = "application/vnd.oci.image.config.v1+json"
const INDEX_TYPES = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
])

type TarEntry = { offset: number; size: number; type: string; linkname: string }

type Descriptor = {
  mediaType?: string
  digest?: string
  size?: number
  platform?: { os?: string; architecture?: string }
  annotations?: Record<string, string>
}

const decoder = new TextDecoder()

async function readBytes(file: File, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

function cString(block: Uint8Array, start: number, length: number): string {
  const field = block.subarray(start, start + length)
  const nul = field.indexOf(0)
  return decoder.decode(nul < 0 ? field : field.subarray(0, nul))
}

/** A numeric tar field: octal text, or base-256 when the high bit of the first byte is set. */
function tarNumber(block: Uint8Array, start: number, length: number): number {
  const field = block.subarray(start, start + length)
  if (field[0] & 0x80) {
    let value = field[0] & 0x7f
    for (let i = 1; i < field.length; i++) value = value * 256 + field[i]
    return value
  }
  const text = cString(block, start, length).trim()
  if (text === "") return 0
  if (!/^[0-7]+$/.test(text)) return NaN
  return parseInt(text, 8)
}

function validChecksum(block: Uint8Array): boolean {
  const expected = tarNumber(block, 148, 8)
  if (!Number.isFinite(expected)) return false
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i]
  return sum === expected
}

/** PAX records: "<length> <key>=<value>\n". */
function paxRecords(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>()
  let at = 0
  while (at < data.length) {
    const space = data.indexOf(0x20, at)
    if (space < 0) break
    const length = parseInt(decoder.decode(data.subarray(at, space)), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = decoder.decode(data.subarray(space + 1, at + length - 1))
    const eq = record.indexOf("=")
    if (eq > 0) records.set(record.slice(0, eq), record.slice(eq + 1))
    at += length
  }
  return records
}

function normalize(name: string): string {
  const parts: string[] = []
  for (const part of name.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}

/** Walks the tar headers and records where every entry's data sits. */
async function listEntries(file: File): Promise<Map<string, TarEntry>> {
  const entries = new Map<string, TarEntry>()
  let at = 0
  let longName: string | null = null
  let longLink: string | null = null
  let pax: Map<string, string> | null = null
  for (;;) {
    if (at + BLOCK > file.size) {
      if (at === 0) throw new ImageArchiveError("notTar")
      break // No end-of-archive blocks: some writers stop right after the last entry.
    }
    const block = await readBytes(file, at, at + BLOCK)
    if (block.every((b) => b === 0)) {
      if (at === 0) throw new ImageArchiveError("notTar")
      break
    }
    if (!validChecksum(block)) throw new ImageArchiveError("notTar")
    const type = String.fromCharCode(block[156] || 0x30)
    let size = tarNumber(block, 124, 12)
    if (pax?.has("size")) size = Number(pax.get("size"))
    if (!Number.isFinite(size) || size < 0) throw new ImageArchiveError("notTar")
    const dataStart = at + BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > file.size) throw new ImageArchiveError("notTar")
    at = dataStart + Math.ceil(size / BLOCK) * BLOCK

    if (type === "x" || type === "L" || type === "K") {
      if (size > MAX_JSON_BYTES) throw new ImageArchiveError("notTar")
      const data = await readBytes(file, dataStart, dataEnd)
      if (type === "x") pax = paxRecords(data)
      else if (type === "L") longName = cString(data, 0, data.length)
      else longLink = cString(data, 0, data.length)
      continue
    }
    if (type === "g") continue // Global PAX header: nothing in it matters here.

    let name = cString(block, 0, 100)
    const ustar = cString(block, 257, 6).startsWith("ustar")
    const prefix = ustar ? cString(block, 345, 155) : ""
    if (prefix) name = `${prefix}/${name}`
    if (longName !== null) name = longName
    if (pax?.has("path")) name = pax.get("path")!
    let linkname = cString(block, 157, 100)
    if (longLink !== null) linkname = longLink
    if (pax?.has("linkpath")) linkname = pax.get("linkpath")!
    longName = null
    longLink = null
    pax = null
    entries.set(normalize(name), { offset: dataStart, size, type, linkname })
  }
  return entries
}

class Archive {
  constructor(private readonly file: File, private readonly entries: Map<string, TarEntry>) {}

  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** The regular file behind a name, following symbolic and hard links. */
  find(name: string): TarEntry | null {
    let current = normalize(name)
    for (let hops = 0; hops < 16; hops++) {
      const entry = this.entries.get(current)
      if (!entry) return null
      if (entry.type === "2") {
        const dir = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : ""
        current = normalize(entry.linkname.startsWith("/") ? entry.linkname : `${dir}/${entry.linkname}`)
      } else if (entry.type === "1") {
        current = normalize(entry.linkname)
      } else {
        return entry.type === "0" || entry.type === "7" ? entry : null
      }
    }
    return null
  }

  async json(name: string): Promise<unknown> {
    const entry = this.find(name)
    if (!entry || entry.size > MAX_JSON_BYTES) throw new ImageArchiveError("noImage")
    try {
      return JSON.parse(decoder.decode(await readBytes(this.file, entry.offset, entry.offset + entry.size)))
    } catch {
      throw new ImageArchiveError("noImage")
    }
  }
}

const HEX_DIGEST = /^sha256:[0-9a-f]{64}$/

function blobPath(digest: string): string {
  return `blobs/sha256/${digest.slice("sha256:".length)}`
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ImageArchiveError("noImage")
  return value as Record<string, unknown>
}

function blobEntry(archive: Archive, descriptor: Descriptor | undefined, fallbackType: string): BlobEntry {
  const digest = descriptor?.digest
  if (typeof digest !== "string" || !HEX_DIGEST.test(digest)) throw new ImageArchiveError("noImage")
  const entry = archive.find(blobPath(digest))
  if (!entry) throw new ImageArchiveError("noImage")
  return { digest, size: entry.size, mediaType: descriptor?.mediaType || fallbackType, offset: entry.offset }
}

/** Refuses an image built for anything but linux/amd64, when the config says what it was built for. */
function checkPlatform(config: unknown): void {
  const c = asObject(config)
  if (typeof c.architecture === "string" && c.architecture !== "amd64") throw new ImageArchiveError("noAmd64")
  if (typeof c.os === "string" && c.os !== "linux") throw new ImageArchiveError("noAmd64")
}

function isAttestation(d: Descriptor): boolean {
  return d.annotations?.["vnd.docker.reference.type"] === "attestation-manifest"
}

/** Picks the one image of an index: linux/amd64 among platform entries, and never two different images. */
function pickOne(manifests: Descriptor[]): Descriptor {
  const candidates = manifests.filter((d) => !isAttestation(d))
  const withPlatform = candidates.filter((d) => d.platform)
  const amd64 = withPlatform.filter((d) => d.platform?.os === "linux" && d.platform?.architecture === "amd64")
  const picked = [...amd64, ...candidates.filter((d) => !d.platform)]
  const digests = new Set(picked.map((d) => d.digest))
  if (digests.size === 0) throw new ImageArchiveError(withPlatform.length > 0 ? "noAmd64" : "noImage")
  if (digests.size > 1) throw new ImageArchiveError("multiImage")
  return picked[0]
}

async function readOci(archive: Archive): Promise<ImageArchive> {
  let index = asObject(await archive.json("index.json"))
  for (let depth = 0; depth < 8; depth++) {
    const manifests = Array.isArray(index.manifests) ? (index.manifests as Descriptor[]) : []
    const chosen = pickOne(manifests)
    if (typeof chosen.digest !== "string" || !HEX_DIGEST.test(chosen.digest)) throw new ImageArchiveError("noImage")
    const path = blobPath(chosen.digest)
    if (!archive.find(path)) throw new ImageArchiveError(chosen.platform ? "noAmd64" : "noImage")
    const doc = asObject(await archive.json(path))
    const isIndex = INDEX_TYPES.has(chosen.mediaType ?? "") || INDEX_TYPES.has(String(doc.mediaType ?? "")) ||
      (Array.isArray(doc.manifests) && !doc.layers)
    if (isIndex) {
      index = doc
      continue
    }
    const configDescriptor = doc.config as Descriptor | undefined
    const config = blobEntry(archive, configDescriptor, OCI_CONFIG)
    checkPlatform(await archive.json(blobPath(config.digest)))
    const layers = Array.isArray(doc.layers) ? (doc.layers as Descriptor[]) : null
    if (!layers) throw new ImageArchiveError("noImage")
    return { config, layers: layers.map((d) => blobEntry(archive, d, LAYER_TAR)) }
  }
  throw new ImageArchiveError("noImage")
}

async function readLegacy(archive: Archive): Promise<ImageArchive> {
  const manifest = await archive.json("manifest.json")
  if (!Array.isArray(manifest) || manifest.length === 0) throw new ImageArchiveError("noImage")
  const images = new Set(manifest.map((m) => asObject(m).Config))
  if (images.size > 1) throw new ImageArchiveError("multiImage")
  const item = asObject(manifest[0])
  const configName = typeof item.Config === "string" ? normalize(item.Config) : ""
  const hex = /([0-9a-f]{64})(\.json)?$/.exec(configName)?.[1]
  const configEntry = hex ? archive.find(configName) : null
  if (!hex || !configEntry) throw new ImageArchiveError("noImage")
  const config = asObject(await archive.json(configName))
  checkPlatform(config)
  const diffIds = asObject(config.rootfs ?? {}).diff_ids
  const layerNames = item.Layers
  if (!Array.isArray(diffIds) || !Array.isArray(layerNames) || diffIds.length !== layerNames.length) {
    throw new ImageArchiveError("noImage")
  }
  const layers = layerNames.map((name, i): BlobEntry => {
    const digest = diffIds[i]
    const entry = typeof name === "string" ? archive.find(name) : null
    if (!entry || typeof digest !== "string" || !HEX_DIGEST.test(digest)) throw new ImageArchiveError("noImage")
    return { digest, size: entry.size, mediaType: LAYER_TAR, offset: entry.offset }
  })
  return {
    config: { digest: `sha256:${hex}`, size: configEntry.size, mediaType: OCI_CONFIG, offset: configEntry.offset },
    layers,
  }
}

/** Reads the image of a `docker save` archive: where its config and layers are, and their digests. */
export async function readImageArchive(file: File): Promise<ImageArchive> {
  if (file.size > MAX_IMAGE_ARCHIVE_BYTES) throw new ImageArchiveError("tooLarge")
  const magic = await readBytes(file, 0, 2)
  if (magic.length === 2 && magic[0] === 0x1f && magic[1] === 0x8b) throw new ImageArchiveError("gzip")
  const archive = new Archive(file, await listEntries(file))
  if (archive.has("index.json")) return readOci(archive)
  if (archive.has("manifest.json")) return readLegacy(archive)
  throw new ImageArchiveError("noImage")
}
