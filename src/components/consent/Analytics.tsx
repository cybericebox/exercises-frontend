import Script from "next/script"
import { gtagBootScript } from "@/lib/consent"
import { ConsentBanner } from "./ConsentBanner"
import { COOKIE_POLICY_HREF } from "./cookiePolicyHref"

// Google Analytics (gtag) under Consent Mode v2. The inline boot sets the denied defaults and the
// stored choice before gtag.js runs (see lib/consent). The cookie policy lives on the main site.
// Without a GA id only the consent panel is mounted, so «Налаштування файлів cookie» still works.
export function Analytics({ gaId }: { gaId?: string }) {
  if (!gaId) return <ConsentBanner policyHref={COOKIE_POLICY_HREF} />
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {gtagBootScript(gaId)}
      </Script>
      <Script id="ga" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} />
      <ConsentBanner gaId={gaId} policyHref={COOKIE_POLICY_HREF} />
    </>
  )
}
