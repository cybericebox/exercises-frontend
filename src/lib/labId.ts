const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
const LAB_ID_LENGTH = 25

/**
 * The lab id of a web host `<device>-<labid>.<base domain>`: the 128-bit UUID as
 * a big integer in lowercase base36, left-padded with "0" to 25 characters. Base64
 * would be shorter but DNS labels are case-insensitive and allow only [a-z0-9-].
 * Mirrors names.LabID in the laboratory operator; the test vectors are shared.
 */
export function labId(uuid: string): string {
  const hex = uuid.replaceAll("-", "").toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("not a UUID")
  let n = BigInt(`0x${hex}`)
  let out = ""
  while (n > BigInt(0)) {
    out = DIGITS[Number(n % BigInt(36))] + out
    n /= BigInt(36)
  }
  return out.padStart(LAB_ID_LENGTH, "0")
}

/** Inverse of labId; null for anything that is not a valid 25 character id. */
export function uuidFromLabId(id: string): string | null {
  if (id.length !== LAB_ID_LENGTH) return null
  let n = BigInt(0)
  for (const c of id) {
    const d = DIGITS.indexOf(c)
    if (d < 0) return null
    n = n * BigInt(36) + BigInt(d)
  }
  if (n >= BigInt(1) << BigInt(128)) return null
  const h = n.toString(16).padStart(32, "0")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** A fixed, non-trivial lab UUID used only to show authors the shape of a lab link. */
export const EXAMPLE_LAB_UUID = "7f3c9a2e-4b1d-4e8a-9c6f-2d5b8e1a0c47"

/** An example web link of a device: https://<device>-<labid>.example-challenges.com */
export function exampleLabLink(device: string): string {
  return `https://${device}-${labId(EXAMPLE_LAB_UUID)}.example-challenges.com`
}
