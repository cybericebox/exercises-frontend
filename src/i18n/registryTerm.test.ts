import {describe, expect, it} from "vitest"
import uk from "../../messages/uk.json"
import errorsUk from "../../messages/errors.uk.json"

// The image registry is «реєстр образів»; «сховище» stays only for other meanings (files, secrets, physical storage).
describe("image registry wording", () => {
  const texts = [...Object.values(uk), ...Object.values(errorsUk)] as string[]

  it("never calls the image registry a storage", () => {
    expect(texts.filter(text => /сховищ\p{L}* образ/iu.test(text))).toEqual([])
  })

  it("names the registry in the uk messages", () => {
    expect(texts.some(text => /реєстр\p{L}* образів/iu.test(text))).toBe(true)
  })
})
