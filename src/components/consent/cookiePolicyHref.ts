import { mainOrigin } from "@/lib/origins"

// The Cookie Policy lives on the main site.
export const COOKIE_POLICY_HREF = `${mainOrigin.replace(/\/$/, "")}/cookies`
