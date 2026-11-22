import { t } from "@/i18n/t"
import type { ConditionFormValues } from "@/lib/editor/schemas/task"

const join = (parts: (string | false | "")[]) => parts.filter(Boolean).join(", ")
const quoted = (value: string) => `«${value}»`

/** One line for a closed condition (the collapsed row). The command's own text is shown as typed. */
export function conditionSummary(c: ConditionFormValues): string {
  switch (c.Kind) {
    case "custom": return t("ed.b.sum.custom", { run: c.Custom.Run.trim().split("\n")[0] || t("ed.b.sum.notSet") })
    case "directory": {
      const o = c.Directory
      const parts = join([o.Exists === false && t("ed.b.sum.absent"), !!o.Mode && t("ed.b.sum.mode", { v: o.Mode }), !!o.Owner && t("ed.b.sum.owner", { v: o.Owner }), !!o.Group && t("ed.b.sum.group", { v: o.Group }),
        o.HasEntries.length > 0 && t("ed.b.sum.has", { v: o.HasEntries.join(", ") }), o.LacksEntries.length > 0 && t("ed.b.sum.lacks", { v: o.LacksEntries.join(", ") })])
      return `${t("ed.b.sum.directory", { path: o.Path || t("ed.b.sum.noPath") })}: ${parts || t("ed.b.sum.exists")}`
    }
    case "process": {
      const o = c.Process
      return t("ed.b.sum.process", { name: o.Name || o.Matches || t("ed.b.sum.noName"), state: o.Running === false ? t("ed.b.sum.notRunning") : t("ed.b.sum.running") })
        + (o.Name && o.Matches ? `, ${t("ed.b.sum.cmdline", { v: o.Matches })}` : "") + (o.User ? `, ${t("ed.b.sum.user", { v: o.User })}` : "")
    }
    case "port": {
      const o = c.Port
      return t("ed.b.sum.port", { port: o.Port || t("ed.b.sum.noNumber"), protocol: o.Protocol || "tcp", state: o.Listening === false ? t("ed.b.sum.notListening") : t("ed.b.sum.listening") })
        + (o.Address ? ` ${t("ed.b.sum.on", { v: o.Address })}` : "") + (o.Process ? `, ${t("ed.b.sum.processOf", { v: o.Process })}` : "")
    }
    case "kernelParam": {
      const o = c.KernelParam
      return t("ed.b.sum.kernel", { name: o.Name || t("ed.b.sum.noName") }) + (o.Equals ? ` = ${o.Equals}` : "") + (o.Matches ? `, ${t("ed.b.sum.valueMatches", { v: o.Matches })}` : "")
    }
    case "request": {
      const o = c.Request
      if (o.Protocol === "tcp") return t("ed.b.sum.tcp", { host: o.Host || "127.0.0.1", port: o.Port || "?" })
      return t("ed.b.sum.http", { method: o.Method || "GET", protocol: o.Protocol, host: o.Host || "127.0.0.1", port: o.Port || "?", path: o.Path || "/", status: o.Status || "200" })
        + (o.BodyContains ? `, ${t("ed.b.sum.bodyHas", { v: o.BodyContains })}` : "") + (o.BodyMatches ? `, ${t("ed.b.sum.bodyMatches", { v: o.BodyMatches })}` : "")
    }
    case "permission": {
      const o = c.Permission
      const word = (key: "Read" | "Write" | "Execute", stem: string) => (o[key] === null ? "" : `${t(`ed.b.sum.${stem}`)} ${o[key] ? t("ed.b.sum.allowed") : t("ed.b.sum.denied")}`)
      const actions = join([word("Read", "read"), word("Write", "write"), word("Execute", "execute")])
      return `${t("ed.b.sum.permission", { user: o.User || t("ed.b.sum.noUser"), path: o.Path || t("ed.b.sum.noPath") })}${actions ? `: ${actions}` : ""}`
    }
    case "file": {
      const o = c.File
      const parts = join([o.Exists === false ? t("ed.b.sum.absent") : o.Exists === true ? t("ed.b.sum.exists") : "", !!o.Type && t("ed.b.sum.type", { v: o.Type }), !!o.Contains && t("ed.b.sum.contains", { v: quoted(o.Contains) }),
        !!o.Matches && t("ed.b.sum.matches", { v: o.Matches }), !!o.Checksum && t("ed.b.sum.checksum", { v: o.Checksum }), !!o.Mode && t("ed.b.sum.mode", { v: o.Mode }), !!o.Owner && t("ed.b.sum.owner", { v: o.Owner }), !!o.Group && t("ed.b.sum.group", { v: o.Group })])
      return `${t("ed.b.sum.file", { path: o.Path || t("ed.b.sum.noPath") })}${parts ? `: ${parts}` : ""}`
    }
  }
}
