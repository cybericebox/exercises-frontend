import { describe, expect, it } from "vitest"
import { emptyVariant, emptyDevice, type VariantFormValues } from "./exerciseSchemas"
import { duplicateVariantGroups } from "./duplicateVariants"
const variants = () => {
 const a = emptyVariant(1); a.ID = "v1"; a.Tasks[0].ID = "t1"; a.Tasks[0].Flag = ["ICE{a}"]
 const device = emptyDevice(); device.ID = "d1"; device.Name = "web"; a.Topology.Devices = [device]
 a.Tasks[0].LinkedDeviceID = "d1"
 const b = structuredClone(a); b.ID = "v2"; b.Index = 2; b.Tasks[0].ID = "t2"; b.Tasks[0].Flag = ["ICE{b}"]
 b.Topology.Devices[0].ID = "d2"; b.Tasks[0].LinkedDeviceID = "d2"
 return [a, b]
}
describe("advisory duplicate variants", () => {
 it("normalizes service IDs and flags without modifying intentional repeated variants", () => {
  const values = variants(); const original = structuredClone(values)
  expect(duplicateVariantGroups(values)).toEqual([[0, 1]])
  expect(values).toEqual(original)
 })
 it.each([
  ["description", (v: VariantFormValues) => { v.Tasks[0].Description = { root: { type: "root", children: [{ type: "text", text: "different" }] } } }],
  ["subtask", (v: VariantFormValues) => { v.Tasks[0].Name = "different" }],
  ["image", (v: VariantFormValues) => { v.Topology.Devices[0].Image = "different" }],
  ["network", (v: VariantFormValues) => { v.Topology.VPN.DNS = "1.1.1.1" }],
  ["settings", (v: VariantFormValues) => { v.Topology.Devices[0].WaitReadyFile = true }],
  ["files", (v: VariantFormValues) => { v.Tasks[0].Attachments = [{ FileID: "new", Name: "same.bin" }] }],
  ["notes", (v: VariantFormValues) => { v.Note = "different" }],
  ["device", (v: VariantFormValues) => { v.Topology.Devices[0].Name = "other" }],
 ])("silently excludes different %s", (_name, change) => {
  const values = variants(); change(values[1]); expect(duplicateVariantGroups(values)).toEqual([])
 })
 it("does not infer file equality from filenames or redacted secret equality", () => {
  const values = variants()
  values[0].Tasks[0].Attachments = [{ FileID: "one", Name: "same.bin" }]
  values[1].Tasks[0].Attachments = [{ FileID: "two", Name: "same.bin" }]
  expect(duplicateVariantGroups(values)).toEqual([])
  values.forEach(v => { v.Tasks[0].Attachments = []; v.Topology.Devices[0].EnvVars = [{ Name: "SECRET", Secret: true, Value: "", HasValue: true }] })
  expect(duplicateVariantGroups(values)).toEqual([])
 })
 it("normalizes placeholder keys only where their schema references them", () => {
  const values = variants()
  values.forEach((v, i) => {
   v.Tasks[0].Placeholders = [{ Key: `ph${i}`, Kind: "vpn.subnet", IPReference: "", Octets1to3: "", LastOctet: 0, ShowMask: false, DeviceName: "" }]
   v.Tasks[0].Description = { root: { type: "root", children: [{ type: "copy-block", children: [{ type: "variable", varName: `ph${i}` }] }] } }
  })
  expect(duplicateVariantGroups(values)).toEqual([[0, 1]])
  values[1].Tasks[0].Description = { text: "ph1" }
  expect(duplicateVariantGroups(values)).toEqual([])
 })
 it("rejects dangling device references rather than treating them as equal", () => {
  const values = variants(); values.forEach(v => { v.Tasks[0].LinkedDeviceID = "missing" })
  expect(duplicateVariantGroups(values)).toEqual([])
 })
})

it("preserves legacy hint whitespace even when it resembles JSON", () => {
 const values = variants()
 values[0].Tasks[0].Hints = [{ ID: "h1", Level: "nudge", Text: " 123 " }]
 values[1].Tasks[0].Hints = [{ ID: "h2", Level: "nudge", Text: "123" }]
 expect(duplicateVariantGroups(values)).toEqual([])
})
