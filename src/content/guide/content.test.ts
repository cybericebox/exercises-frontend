import { describe, expect, it } from "vitest"
import { llmDigest } from "./llm"
import { GUIDE_LOADERS, GUIDE_ORDER } from "./registry"

describe("LLM digest", () => {
  it("covers every section of the guide", () => {
    for (const term of ["Завдання", "Варіант", "Підзавдання", "ПРАПОРИ", "ПІДКАЗКИ", "ДОКУМЕНТ", "ОБРАЗИ", "АРХІВ", "РЕКОМЕНДАЦІЇ", "НОТАТКИ", "Топологія", "devices[]", "помилк"]) {
      expect(llmDigest, term).toContain(term)
    }
    for (const term of ["exercise.yaml", "template", "flag", "hints", "admin_note", "image"]) expect(llmDigest, term).toContain(term)
  })
})

// The guide speaks of «завдання» and «автор/адміністратор»; the participant/team/event vocabulary belongs to other sites.
const FORBIDDEN = [/учасник\p{L}*/giu, /команд(?!н)\p{L}*/giu, /захід\p{L}*|заход(?:у|ом|и|ів|ам)\b/giu]

// Legitimate matches: «команда» is the console command (a docker/zip command line to run) on these pages.
const CONSOLE_COMMAND = /^команд[аиу]?$|^командою$/i
const COMMAND_PAGES = new Set(["arkhiv", "obrazy"])

describe("guide content vocabulary", () => {
  it.each(GUIDE_ORDER)("%s has no forbidden words", async (slug) => {
    const { html, lead } = await GUIDE_LOADERS[slug]()
    const text = `${lead} ${html.replace(/<[^>]+>/g, " ")}`
    const hits = FORBIDDEN.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]))
      .filter((word) => !(COMMAND_PAGES.has(slug) && CONSOLE_COMMAND.test(word)))
    expect(hits, `forbidden words in ${slug}`).toEqual([])
  })
})
