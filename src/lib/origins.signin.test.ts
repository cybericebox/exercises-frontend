import { describe, expect, it } from "vitest"
import { signInURL } from "./origins"

describe("signInURL", () => {
  it("points at the ID app and never nests a sign-in return_to", () => {
    const url = new URL(signInURL("https://exercises.localhost/sign-in?return_to=x"))
    expect(url.origin).toBe("https://id.localhost")
    expect(url.pathname).toBe("/sign-in")
    expect(url.searchParams.get("return_to")).toBe("https://exercises.localhost/")
  })

  it("uses the backend-advertised sign-in URL when given", () => {
    const url = new URL(signInURL("https://exercises.localhost/a", "https://sso.example/sign-in"))
    expect(url.origin).toBe("https://sso.example")
  })
})
