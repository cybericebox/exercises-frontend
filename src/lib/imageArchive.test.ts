import { describe, expect, it } from "vitest"
import { ImageArchiveError, MAX_IMAGE_ARCHIVE_BYTES, readImageArchive } from "./imageArchive"

// ---- a tiny tar writer (fixed bytes only) ----

const enc = new TextEncoder()
const BLOCK = 512

type Entry = { name: string; data: Uint8Array; type?: string; prefix?: string; linkname?: string }

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, "0") + "\0"
}

function header(name: string, size: number, type: string, prefix = "", linkname = ""): Uint8Array {
  const h = new Uint8Array(BLOCK)
  const put = (text: string, at: number) => h.set(enc.encode(text), at)
  put(name, 0)
  put(octal(0o644, 8), 100)
  put(octal(0, 8), 108)
  put(octal(0, 8), 116)
  put(octal(size, 12), 124)
  put(octal(0, 12), 136)
  put("        ", 148)
  put(type, 156)
  put(linkname, 157)
  put("ustar\0", 257)
  put("00", 263)
  put(prefix, 345)
  let sum = 0
  for (const b of h) sum += b
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148)
  return h
}

function padded(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK)
  out.set(data)
  return out
}

function tar(entries: Entry[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const e of entries) {
    parts.push(header(e.name, e.data.length, e.type ?? "0", e.prefix, e.linkname), padded(e.data))
  }
  parts.push(new Uint8Array(BLOCK * 2))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`
  let len = body.length + 1
  while (String(len).length + body.length !== len) len = String(len).length + body.length
  return `${len}${body}`
}

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill)
const json = (value: unknown) => enc.encode(JSON.stringify(value))
const fileOf = (data: Uint8Array) => new File([data as BlobPart], "image.tar")

const HEX_CONFIG = "c".repeat(64)
const HEX_L1 = "1".repeat(64)
const HEX_L2 = "2".repeat(64)
const HEX_MANIFEST = "a".repeat(64)
const HEX_ARM = "b".repeat(64)
const HEX_INDEX = "d".repeat(64)

const OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json"
const OCI_INDEX = "application/vnd.oci.image.index.v1+json"
const OCI_CONFIG = "application/vnd.oci.image.config.v1+json"
const LAYER_TAR = "application/vnd.oci.image.layer.v1.tar"

/** The offset of an entry's data in a tar built by `tar()` (no long-name records before it). */
function dataOffset(entries: Entry[], name: string): number {
  let at = 0
  for (const e of entries) {
    at += BLOCK
    if (e.name === name) return at
    at += Math.ceil(e.data.length / BLOCK) * BLOCK
  }
  throw new Error(name)
}

/** Rewrites a header block in place and fixes its checksum. */
function rewriteHeader(raw: Uint8Array, at: number, change: (h: Uint8Array) => void): void {
  const h = raw.subarray(at, at + BLOCK)
  change(h)
  h.set(enc.encode("        "), 148)
  let sum = 0
  for (const b of h) sum += b
  h.set(enc.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148)
}

function ociEntries(index: unknown, extra: Entry[] = [], layer1Size = 1024): Entry[] {
  const config = json({ architecture: "amd64", os: "linux", rootfs: { type: "layers", diff_ids: [] } })
  const manifest = json({
    schemaVersion: 2,
    mediaType: OCI_MANIFEST,
    config: { mediaType: OCI_CONFIG, digest: `sha256:${HEX_CONFIG}`, size: config.length },
    layers: [
      { mediaType: LAYER_TAR, digest: `sha256:${HEX_L1}`, size: layer1Size },
      { mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: `sha256:${HEX_L2}`, size: 700 },
    ],
  })
  return [
    { name: "blobs/", data: new Uint8Array(0), type: "5" },
    { name: "blobs/sha256/", data: new Uint8Array(0), type: "5" },
    { name: `blobs/sha256/${HEX_CONFIG}`, data: config },
    { name: `blobs/sha256/${HEX_L1}`, data: bytes(1024, 1) },
    { name: `blobs/sha256/${HEX_L2}`, data: bytes(700, 2) },
    { name: `blobs/sha256/${HEX_MANIFEST}`, data: manifest },
    ...extra,
    { name: "index.json", data: json(index) },
    { name: "oci-layout", data: json({ imageLayoutVersion: "1.0.0" }) },
  ]
}

const manifestDescriptor = { mediaType: OCI_MANIFEST, digest: `sha256:${HEX_MANIFEST}`, size: 1, annotations: { "io.containerd.image.name": "docker.io/library/app:1" } }

describe("readImageArchive", () => {
  it("reads a Docker 25+ OCI layout: the manifest's config and layers with their offsets", async () => {
    const entries = ociEntries({ schemaVersion: 2, mediaType: OCI_INDEX, manifests: [manifestDescriptor] })
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.config).toEqual({
      digest: `sha256:${HEX_CONFIG}`, mediaType: OCI_CONFIG,
      size: entries.find((e) => e.name.endsWith(HEX_CONFIG))!.data.length,
      offset: dataOffset(entries, `blobs/sha256/${HEX_CONFIG}`),
    })
    expect(archive.layers).toEqual([
      { digest: `sha256:${HEX_L1}`, mediaType: LAYER_TAR, size: 1024, offset: dataOffset(entries, `blobs/sha256/${HEX_L1}`) },
      { digest: `sha256:${HEX_L2}`, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", size: 700, offset: dataOffset(entries, `blobs/sha256/${HEX_L2}`) },
    ])
  })

  it("prefers the OCI layout when manifest.json is there too", async () => {
    const legacy = { name: "manifest.json", data: json([{ Config: `blobs/sha256/${HEX_CONFIG}`, RepoTags: ["app:1"], Layers: [] }]) }
    const entries = ociEntries({ schemaVersion: 2, manifests: [manifestDescriptor] }, [legacy])
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.layers).toHaveLength(2)
  })

  it("picks linux/amd64 from a nested multi-platform index, skipping attestations", async () => {
    const nested = json({
      schemaVersion: 2, mediaType: OCI_INDEX,
      manifests: [
        { mediaType: OCI_MANIFEST, digest: `sha256:${HEX_ARM}`, size: 1, platform: { os: "linux", architecture: "arm64" } },
        { mediaType: OCI_MANIFEST, digest: `sha256:${HEX_MANIFEST}`, size: 1, platform: { os: "linux", architecture: "amd64" } },
        { mediaType: OCI_MANIFEST, digest: `sha256:${"e".repeat(64)}`, size: 1, platform: { os: "unknown", architecture: "unknown" },
          annotations: { "vnd.docker.reference.type": "attestation-manifest" } },
      ],
    })
    const entries = ociEntries(
      { schemaVersion: 2, mediaType: OCI_INDEX, manifests: [{ mediaType: OCI_INDEX, digest: `sha256:${HEX_INDEX}`, size: nested.length }] },
      [{ name: `blobs/sha256/${HEX_INDEX}`, data: nested }],
    )
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.config.digest).toBe(`sha256:${HEX_CONFIG}`)
    expect(archive.layers.map((l) => l.digest)).toEqual([`sha256:${HEX_L1}`, `sha256:${HEX_L2}`])
  })

  it("refuses a multi-platform index without linux/amd64", async () => {
    const nested = json({
      schemaVersion: 2, mediaType: OCI_INDEX,
      manifests: [{ mediaType: OCI_MANIFEST, digest: `sha256:${HEX_ARM}`, size: 1, platform: { os: "linux", architecture: "arm64" } }],
    })
    const entries = ociEntries(
      { schemaVersion: 2, manifests: [{ mediaType: OCI_INDEX, digest: `sha256:${HEX_INDEX}`, size: nested.length }] },
      [{ name: `blobs/sha256/${HEX_INDEX}`, data: nested }],
    )
    await expect(readImageArchive(fileOf(tar(entries)))).rejects.toMatchObject({ code: "noAmd64" })
  })

  it("refuses an archive holding two different images, but accepts one image tagged twice", async () => {
    const two = ociEntries({ schemaVersion: 2, manifests: [manifestDescriptor, { ...manifestDescriptor, digest: `sha256:${HEX_ARM}` }] },
      [{ name: `blobs/sha256/${HEX_ARM}`, data: json({ schemaVersion: 2, config: {}, layers: [] }) }])
    await expect(readImageArchive(fileOf(tar(two)))).rejects.toMatchObject({ code: "multiImage" })
    const twice = ociEntries({ schemaVersion: 2, manifests: [manifestDescriptor, { ...manifestDescriptor, annotations: { "io.containerd.image.name": "app:latest" } }] })
    await expect(readImageArchive(fileOf(tar(twice)))).resolves.toMatchObject({ config: { digest: `sha256:${HEX_CONFIG}` } })
  })

  it("reads a legacy manifest.json: config digest from its name, layer digests from rootfs.diff_ids, sizes from the tar", async () => {
    const config = json({ architecture: "amd64", os: "linux", rootfs: { type: "layers", diff_ids: [`sha256:${HEX_L1}`, `sha256:${HEX_L2}`] } })
    const entries: Entry[] = [
      { name: "0123abcd/", data: new Uint8Array(0), type: "5" },
      { name: "0123abcd/layer.tar", data: bytes(1536, 1) },
      { name: "4567ef00/", data: new Uint8Array(0), type: "5" },
      { name: "4567ef00/layer.tar", data: bytes(512, 2) },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, RepoTags: ["app:1", "app:latest"], Layers: ["0123abcd/layer.tar", "4567ef00/layer.tar"] }]) },
      { name: "repositories", data: json({}) },
    ]
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.config).toEqual({ digest: `sha256:${HEX_CONFIG}`, mediaType: OCI_CONFIG, size: config.length, offset: dataOffset(entries, `${HEX_CONFIG}.json`) })
    expect(archive.layers).toEqual([
      { digest: `sha256:${HEX_L1}`, mediaType: LAYER_TAR, size: 1536, offset: dataOffset(entries, "0123abcd/layer.tar") },
      { digest: `sha256:${HEX_L2}`, mediaType: LAYER_TAR, size: 512, offset: dataOffset(entries, "4567ef00/layer.tar") },
    ])
  })

  it("follows a legacy layer.tar symlink to the layer it repeats", async () => {
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`, `sha256:${HEX_L1}`] } })
    const entries: Entry[] = [
      { name: "aaaa/layer.tar", data: bytes(512, 1) },
      { name: "bbbb/layer.tar", data: new Uint8Array(0), type: "2", linkname: "../aaaa/layer.tar" },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: ["aaaa/layer.tar", "bbbb/layer.tar"] }]) },
    ]
    const archive = await readImageArchive(fileOf(tar(entries)))
    const first = dataOffset(entries, "aaaa/layer.tar")
    expect(archive.layers.map((l) => [l.offset, l.size])).toEqual([[first, 512], [first, 512]])
  })

  it("refuses a legacy archive with more than one image", async () => {
    const entries: Entry[] = [
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: [] }, { Config: `${HEX_ARM}.json`, Layers: [] }]) },
    ]
    await expect(readImageArchive(fileOf(tar(entries)))).rejects.toMatchObject({ code: "multiImage" })
  })

  it("refuses a legacy image built for another architecture", async () => {
    const entries: Entry[] = [
      { name: `${HEX_CONFIG}.json`, data: json({ architecture: "arm64", os: "linux", rootfs: { diff_ids: [] } }) },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: [] }]) },
    ]
    await expect(readImageArchive(fileOf(tar(entries)))).rejects.toMatchObject({ code: "noAmd64" })
  })

  it("reads names from PAX path records and the ustar prefix", async () => {
    const longDir = "d".repeat(120)
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`, `sha256:${HEX_L2}`] } })
    const entries: Entry[] = [
      { name: "PaxHeaders/x", data: enc.encode(paxRecord("path", `${longDir}/layer.tar`) + paxRecord("mtime", "0")), type: "x" },
      { name: "truncated-name-ignored", data: bytes(512, 1) },
      { name: "layer.tar", prefix: "prefixed/dir", data: bytes(1024, 2) },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: [`${longDir}/layer.tar`, "prefixed/dir/layer.tar"] }]) },
    ]
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.layers.map((l) => [l.offset, l.size])).toEqual([
      [dataOffset(entries, "truncated-name-ignored"), 512],
      [dataOffset(entries, "layer.tar"), 1024],
    ])
  })

  it("takes the size from a PAX size record", async () => {
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`] } })
    const entries: Entry[] = [
      { name: "PaxHeaders/x", data: enc.encode(paxRecord("size", "512")), type: "x" },
      { name: "l/layer.tar", data: bytes(512, 1) },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: ["l/layer.tar"] }]) },
    ]
    // The ustar size field of the layer is overwritten with 0 so only the PAX record gives the size.
    const raw = tar(entries)
    const layerHeader = dataOffset(entries, "l/layer.tar") - BLOCK
    const zero = header("l/layer.tar", 0, "0")
    raw.set(zero, layerHeader)
    const archive = await readImageArchive(fileOf(raw))
    expect(archive.layers[0].size).toBe(512)
  })

  it("refuses an OCI blob whose tar entry size differs from its descriptor", async () => {
    const entries = ociEntries({ schemaVersion: 2, manifests: [manifestDescriptor] }, [], 1000)
    await expect(readImageArchive(fileOf(tar(entries)))).rejects.toMatchObject({ code: "noImage" })
  })

  it("refuses a PAX size that is not a plain decimal number", async () => {
    const entries: Entry[] = [
      { name: "PaxHeaders/x", data: enc.encode(paxRecord("size", "5e2")), type: "x" },
      { name: "l/layer.tar", data: bytes(512, 1) },
    ]
    await expect(readImageArchive(fileOf(tar(entries)))).rejects.toMatchObject({ code: "notTar" })
  })

  it("reads a base-256 size field", async () => {
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`] } })
    const entries: Entry[] = [
      { name: "l/layer.tar", data: bytes(512, 1) },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: ["l/layer.tar"] }]) },
    ]
    const raw = tar(entries)
    rewriteHeader(raw, 0, (h) => {
      h.fill(0, 124, 136)
      h[124] = 0x80
      h[134] = 0x02 // 512 big-endian in the last two bytes
      h[135] = 0x00
    })
    const archive = await readImageArchive(fileOf(raw))
    expect(archive.layers[0]).toMatchObject({ offset: BLOCK, size: 512 })
  })

  it("ignores the prefix field of an old GNU header (magic \"ustar  \\0\")", async () => {
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`] } })
    const entries: Entry[] = [
      { name: "l/layer.tar", data: bytes(512, 1), prefix: "junk" },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: ["l/layer.tar"] }]) },
    ]
    const raw = tar(entries)
    rewriteHeader(raw, 0, (h) => h.set(enc.encode("ustar  \0"), 257))
    const archive = await readImageArchive(fileOf(raw))
    expect(archive.layers[0]).toMatchObject({ offset: BLOCK, size: 512 })
    // The same header with the POSIX magic uses the prefix, so the layer is not found.
    const posix = tar(entries)
    await expect(readImageArchive(fileOf(posix))).rejects.toMatchObject({ code: "noImage" })
  })

  it("reads GNU long names", async () => {
    const longName = `${"g".repeat(150)}/layer.tar`
    const config = json({ architecture: "amd64", os: "linux", rootfs: { diff_ids: [`sha256:${HEX_L1}`] } })
    const entries: Entry[] = [
      { name: "././@LongLink", data: enc.encode(`${longName}\0`), type: "L" },
      { name: "g".repeat(100), data: bytes(512, 1) },
      { name: `${HEX_CONFIG}.json`, data: config },
      { name: "manifest.json", data: json([{ Config: `${HEX_CONFIG}.json`, Layers: [longName] }]) },
    ]
    const archive = await readImageArchive(fileOf(tar(entries)))
    expect(archive.layers[0]).toMatchObject({ offset: dataOffset(entries, "g".repeat(100)), size: 512 })
  })

  it("refuses a gzip archive", async () => {
    const gz = new Uint8Array(2048)
    gz.set([0x1f, 0x8b, 0x08, 0x00])
    const error = await readImageArchive(fileOf(gz)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImageArchiveError)
    expect(error).toMatchObject({ code: "gzip" })
  })

  it("refuses a file that is not a tar", async () => {
    await expect(readImageArchive(fileOf(enc.encode("hello world".repeat(100))))).rejects.toMatchObject({ code: "notTar" })
    await expect(readImageArchive(fileOf(new Uint8Array(10)))).rejects.toMatchObject({ code: "notTar" })
  })

  it("refuses a tar without an image", async () => {
    await expect(readImageArchive(fileOf(tar([{ name: "readme.txt", data: enc.encode("hi") }])))).rejects.toMatchObject({ code: "noImage" })
  })

  it("refuses an archive over 10 GiB without reading it", async () => {
    expect(MAX_IMAGE_ARCHIVE_BYTES).toBe(10 * 1024 ** 3)
    let reads = 0
    const huge = { name: "huge.tar", size: MAX_IMAGE_ARCHIVE_BYTES + 1, slice: () => { reads++; return new Blob([]) } } as unknown as File
    await expect(readImageArchive(huge)).rejects.toMatchObject({ code: "tooLarge" })
    expect(reads).toBe(0)
  })
})
