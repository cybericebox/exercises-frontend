import { describe, expect, it } from "vitest"
import { llmDigest } from "./llm"
import { GUIDE_LOADERS, GUIDE_ORDER, GUIDE_SLUGS } from "./registry"

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ")

describe("LLM digest", () => {
  it("covers every section of the guide", () => {
    for (const term of ["ТЕРМІНИ", "ПІДЗАВДАННЯ", "ПРАПОРИ", "ПЕРЕВІРКА СТАНУ", "ПІДКАЗКИ", "ДОКУМЕНТ", "ОБРАЗИ", "АРХІВ", "ПУБЛІКАЦІЯ", "РЕКОМЕНДАЦІЇ", "НОТАТКИ", "ТОПОЛОГІЯ", "ПРАВИЛА ГЕНЕРАТОРА", "ПОМИЛКИ", "devices[]"]) {
      expect(llmDigest, term).toContain(term)
    }
    for (const term of ["cib-exercise/1.0", "check", "answer", "state", "bootstrap", "access", "requires", "template", "hints", "admin_note", "image", "reverse_connections"]) expect(llmDigest, term).toContain(term)
    for (const kind of ["file", "directory", "process", "port", "kernel_param", "request", "permission", "custom"]) expect(llmDigest, kind).toContain(kind)
  })

  it("lists the generator rules 1 to 17", () => {
    const rules = llmDigest.split("=== ПРАВИЛА ГЕНЕРАТОРА ===")[1].split("===")[0]
    for (let n = 1; n <= 17; n++) expect(rules, `rule ${n}`).toContain(`${n} `)
  })
})

// Terms and keys that must not appear anywhere in the guide: the old editor, the old keys and the wrong words.
const STALE = [
  /env_vars/, /device_flag_var/, /linked_device/, /\bexternal:/, /\bterminal:\s*(true|false)/, /cib-exercise\/1(?![.\d])/,
  /вкладк[аиу] «Варіанти»/i, /«Запуск»/, /Топологія/, /Зовнішній доступ/, /Передача прапора/,
]
// The terminology of the project: «захід», not «подія»; «завдання», not «задача» or «набір».
const WRONG_WORDS = [/задач\p{L}*/giu, /\bподі(?:я|ї|ю|єю)\b/giu, /\bнабір(?!\p{L})/giu, /адмінк\p{L}*/giu]

describe("guide content", () => {
  it("has a loader and a page for every slug", () => {
    expect(GUIDE_ORDER).toEqual(["index", ...GUIDE_SLUGS])
    expect(new Set(GUIDE_SLUGS).size).toBe(GUIDE_SLUGS.length)
    expect(Object.keys(GUIDE_LOADERS).sort()).toEqual([...GUIDE_ORDER].sort())
  })

  it.each(GUIDE_ORDER)("%s is not empty and has no stale keys or wrong words", async (slug) => {
    const { html, lead } = await GUIDE_LOADERS[slug]()
    expect(lead.length).toBeGreaterThan(10)
    expect(html.length).toBeGreaterThan(200)
    const text = `${lead} ${textOf(html)}`
    for (const re of STALE) expect(text, `${slug}: ${re}`).not.toMatch(re)
    const hits = WRONG_WORDS.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]))
    expect(hits, `wrong words in ${slug}`).toEqual([])
  })

  it.each(GUIDE_ORDER)("%s links only to existing guide pages", async (slug) => {
    const { html } = await GUIDE_LOADERS[slug]()
    const known = new Set<string>(GUIDE_ORDER.map((s) => (s === "index" ? "/guide/" : `/guide/${s}/`)))
    for (const m of html.matchAll(/href="(\/guide\/[^"#]*)(#[^"]*)?"/g)) expect(known.has(m[1]), `${slug}: ${m[1]}`).toBe(true)
  })

  it("keeps the brand name unbroken", async () => {
    for (const slug of GUIDE_ORDER) {
      const { html } = await GUIDE_LOADERS[slug]()
      expect(html, slug).not.toMatch(/Cyber ICE Box/)
    }
  })
})

describe("answer and state pages", () => {
  it("name all eight condition kinds and the Academy-only rule", async () => {
    const { html } = await GUIDE_LOADERS.stan()
    for (const kind of ["Файл", "Каталог", "Процес", "Порт", "Параметр ядра", "Запит до сервісу", "Права доступу", "Команда"]) expect(html, kind).toContain(kind)
    expect(html).toContain("Лише для Академії")
    expect(html).toContain("nobody")
    expect(html).toContain("права root")
  })

  it("keeps the flag format and the delivery rule", async () => {
    const { html } = await GUIDE_LOADERS.prapory()
    expect(html).toContain("ICE{...}")
    expect(html).toContain("Куди передається відповідь")
  })
})

describe("device and archive pages", () => {
  it("describe the five device sections", async () => {
    const { html } = await GUIDE_LOADERS.prystroi()
    for (const section of ["Основне", "Мережа", "Ініціалізація", "Сервіс", "Доступ"]) expect(html, section).toContain(section)
    expect(html).toContain("/run/ready")
  })

  it("explains full replacement, password-less export and keeps the examples slot", async () => {
    const { html } = await GUIDE_LOADERS.arkhiv()
    expect(html).toContain("повністю замінює робочий вміст")
    expect(html).toContain("не публікує")
    expect(html).toContain("Експорт без пароля")
    expect(html).toContain("<div data-guide-examples></div>")
  })
})
