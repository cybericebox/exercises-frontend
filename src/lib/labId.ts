/** An example web link of a device: https://<device>-<code>.example-challenges.com (the code is 3-4 random base36 chars) */
export function exampleLabLink(device: string): string {
  return `https://${device}-k3x.example-challenges.com`
}
