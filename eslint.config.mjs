import js from "@eslint/js"
import eslintReact from "@eslint-react/eslint-plugin"
import nextPlugin from "@next/eslint-plugin-next"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

// TypeScript 7 runs the build check; the TypeScript 6 API powers typescript-eslint.
const eslintConfig = tseslint.config(
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      ".claude/worktrees/**",
      ".worktrees/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    ...eslintReact.configs["recommended-typescript"],
  },
  nextPlugin.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      // These are React 19 modernization suggestions for existing components,
      // not regressions introduced by the dependency upgrade.
      "@eslint-react/no-forward-ref": "off",
      "@eslint-react/naming-convention-ref-name": "off",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/no-use-context": "off",
      "@eslint-react/use-state": "off",
      "@eslint-react/no-context-provider": "off",
      "@eslint-react/naming-convention-id-name": "off",
      "@eslint-react/exhaustive-deps": "off", // Covered by react-hooks/exhaustive-deps above.
    },
  },
  {
    // HTML is either the fixed theme bootstrap or sanitized with DOMPurify.
    files: [
      "src/app/layout.tsx",
      "src/components/shell/BannerStack.tsx",
    ],
    rules: { "@eslint-react/dom-no-dangerously-set-innerhtml": "off" },
  },
  {
    // These two redirects intentionally cross to the separate ID frontend.
    files: ["src/components/shell/ExercisesShell.tsx", "src/components/shell/TopBar.tsx"],
    rules: { "@next/next/no-location-assign-relative-destination": "off" },
  },
)

export default eslintConfig
