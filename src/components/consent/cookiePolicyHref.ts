// The Cookie Policy link (NEXT_PUBLIC_COOKIES_URL; empty = none). The settings links that use it open the consent panel on click, so with the
// setting empty they stay links and only lose their target. Read by its literal name and only assigned (src/lib/settings.ts says why).
export const COOKIE_POLICY_HREF = process.env.NEXT_PUBLIC_COOKIES_URL
