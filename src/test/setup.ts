import "@testing-library/jest-dom/vitest"
import { configure } from "@testing-library/react"

// Waiting helpers (findBy*, waitFor) poll up to this long. The default (1 s) is shorter than a busy CI runner or a
// machine running several test suites needs to start a render; the value is only a ceiling, a passing test never waits for it.
configure({ asyncUtilTimeout: 4000 })
