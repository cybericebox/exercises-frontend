import { describe, expect, it } from "vitest"
import { deliveriesOfTask, deliveryDevices, findRefs, hasSubstitution, knownRefsOf, richTextPlain, unknownRefs } from "./refs"
import { deviceErrorPath, deviceFieldPath, pascal, taskFieldPath, variantFieldPath } from "./serverFieldPath"
import { draftIssues } from "./issues"
import { emptyDraft } from "@/lib/exerciseSchemas"
import { lexical } from "@/dev/fixtures/data"
import { formDevice, formTask } from "@/test/editorFixtures"
import { emptyBootstrapFile } from "./schemas/infra"

describe("refs", () => {
  it("finds task and var references and skips an escaped one", () => {
    expect(findRefs("a {{task.web}} b {{var.net_1}} \\{{task.no}}").map((ref) => ref.text)).toEqual(["{{task.web}}", "{{var.net_1}}"])
  })

  it("lists references that name nothing known", () => {
    const known = knownRefsOf([{ Key: "web" }, { Key: "" }], [{ Name: "net" }])
    expect(unknownRefs("{{task.web}} {{task.db}} {{var.net}} {{var.x}}", known)).toEqual(["{{task.db}}", "{{var.x}}"])
  })

  it("finds where an answer is delivered, only on node devices", () => {
    const web = formDevice({ ID: "d1", Name: "web" })
    web.Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.scan}}", Secret: false } as never]
    web.Bootstrap.Files = [{ ...emptyBootstrapFile(), Path: "/etc/f", Content: "x {{task.scan}}" }]
    web.Bootstrap.Script = "echo {{task.scan}}"
    const hub = formDevice({ ID: "d2", Name: "hub", Type: "hub" })
    hub.Bootstrap.Script = "{{task.scan}}"
    const found = deliveriesOfTask({ Devices: [web, hub] }, "scan")
    expect(found.map((delivery) => delivery.kind)).toEqual(["env", "file", "script"])
    expect(deliveryDevices(found)).toEqual(["web"])
    expect(deliveriesOfTask({ Devices: [web] }, "")).toEqual([])
  })
})

describe("server field paths", () => {
  it("maps task fields", () => {
    expect(taskFieldPath("check.answer.values")).toEqual(["Check", "Answer", "Values"])
    expect(taskFieldPath("check.answer.input_hint")).toEqual(["Check", "Answer", "InputHint"])
    expect(taskFieldPath("check.state.conditions[3].port.port")).toEqual(["Check", "State", "Conditions", 2, "Port", "Port"])
    expect(taskFieldPath("check.state.conditions[1].observation")).toEqual(["Check", "State", "Conditions", 0, "Kind"])
    expect(taskFieldPath("check.state.interval")).toEqual(["Check", "State", "Interval"])
    expect(taskFieldPath("requires[2]")).toEqual(["Requires", 1])
    expect(taskFieldPath("description")).toEqual(["Description"])
    expect(taskFieldPath("hints[3].text")).toEqual(["Hints", 2, "Text"])
    expect(taskFieldPath("nonsense")).toBeNull()
    expect(taskFieldPath("check.state.conditions[1].bogus")).toBeNull()
  })

  it("maps device and variant fields", () => {
    expect(deviceFieldPath("bootstrap.env[3].name")).toEqual(["Bootstrap", "Env", 2, "Name"])
    expect(deviceFieldPath("bootstrap.script")).toEqual(["Bootstrap", "Script"])
    expect(deviceFieldPath("access[2].port")).toEqual(["Access", 1, "Port"])
    expect(deviceFieldPath("image")).toEqual(["Image"])
    expect(deviceFieldPath("dhcp")).toEqual(["DHCP"])
    expect(deviceFieldPath("dhcp_ranges[2].start")).toEqual(["DHCPRanges"])
    expect(deviceFieldPath("dns")).toEqual(["DNS"])
    expect(deviceFieldPath("reverse_connections")).toEqual(["ReverseConnections"])
    expect(deviceFieldPath("???")).toBeNull()
    expect(variantFieldPath("variables[2].name")).toEqual(["Topology", "Variables", 1, "Name"])
    expect(variantFieldPath("topology.vpn.reverse_connections")).toBeNull() // the VPN is a gateway device now
    expect(variantFieldPath("x")).toBeNull()
    expect(pascal("body_contains")).toBe("BodyContains")
  })
})

describe("draftIssues", () => {
  it("names the field, the variant and a readable text for each problem", () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = "Scan"
    draft.Variants[0].Tasks[0].Check = formTask({ flag: ["ICE{x}"] }).Check
    const issues = draftIssues(draft)
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(issue.path[0]).toBe("Variants")
      expect(issue.message).not.toBe("")
      expect(issue.text).not.toBe("")
      expect(issue.variant).toBe(0)
    }
    expect(issues.some((issue) => issue.path.includes("Description"))).toBe(true)
  })
})

describe("answers and variables never reach participants", () => {
  it("reads the text of a rich document and of a plain hint", () => {
    expect(richTextPlain(lexical("a {{task.x}}\nb"))).toBe("a {{task.x}} b")
    expect(hasSubstitution(lexical("see {{task.secret}}"))).toBe(true)
    expect(hasSubstitution(lexical("the address is {{ph_srv}}"))).toBe(false)
    expect(hasSubstitution("{{var.admin_password}}")).toBe(true)
  })

  it("lists a description, a hint and a weight of zero as problems of their fields", () => {
    const draft = emptyDraft()
    const task = draft.Variants[0].Tasks[0]
    task.Name = "Scan"
    task.Description = lexical("The flag is {{task.scan}}") as never
    task.Hints = [{ ID: "", Level: "nudge", Text: JSON.stringify(lexical("use {{var.x}}")) }]
    draft.Variants[0].Weight = 0
    const paths = draftIssues(draft).map((issue) => issue.path.join("."))
    expect(paths).toContain("Variants.0.Tasks.0.Description")
    expect(paths).toContain("Variants.0.Tasks.0.Hints.0.Text")
    expect(paths).toContain("Variants.0.Weight")
  })
})

describe("deviceErrorPath", () => {
  it("puts 23105 (persistence on microvm/vm) at the launch profile field", () => {
    expect(deviceErrorPath(23105, "persistence")).toEqual(["Profile"])
  })
  it("falls back to the field path for other codes", () => {
    expect(deviceErrorPath(23506, "image")).toEqual(["Image"])
    expect(deviceErrorPath(23506, "nonsense")).toBeNull()
  })
})
