"use client"
import { useEffect } from "react"
import { t } from "@/i18n/t"
import { PageLoader } from "@/components/ui/spinner"
import { signInURL } from "@/lib/origins"

// A page that needs a session (401): no card, no button. The address is replaced with
// the ID sign-in (return_to = this page), so Back does not bounce, and the crest loader
// shows meanwhile.
export function SignInRedirect() {
  useEffect(() => {
    const target = signInURL(window.location.href)
    if (target) window.location.replace(target)
  }, [])
  return <PageLoader label={t("auth.redirecting")} />
}
