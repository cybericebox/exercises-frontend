"use client"
import { useState } from "react"
import { Lock } from "lucide-react"
import { Wordmark } from "@/components/brand/Wordmark"
import { Button } from "@/components/ui/button"
import { apiPost } from "@/api/client"
import { useRole } from "@/lib/useRole"
import { t } from "@/i18n/t"
import { mainOrigin, signInURL } from "@/lib/origins"
import { SignInRedirect } from "./SignInRedirect"

// A page the signed-in account has no rights for (403): the error-screen frame with a
// Lock mark, the account, and two ways out: another account (sign out, then sign in
// back to this page) or home. mode="block" centers the same card inside the page area of the shell.
export function NoAccessScreen({ title = t("auth.noAccess.title"), mode = "page" }: { title?: string; mode?: "page" | "block" }) {
  const { me } = useRole()
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  async function switchAccount() {
    setWorking(true)
    setFailed(false)
    try {
      await apiPost("/api/auth/sign-out", {}, undefined, { required: false })
      const target = signInURL(window.location.href)
      window.location.replace(target || mainOrigin)
    } catch {
      setFailed(true)
      setWorking(false)
    }
  }

  // The session ended meanwhile: that is a 401 after all.
  if (!me) return <SignInRedirect />
  return (
    <div className={mode === "page" ? "flex min-h-screen items-center justify-center p-4" : "flex h-full min-h-[60dvh] items-center justify-center"}>
      <div className="flex w-full max-w-md flex-col">
        {mode === "page" && <div className="mb-6 flex justify-center"><Wordmark size="lg" /></div>}
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
          <Lock size={32} className="text-muted-foreground" aria-hidden />
          {mode === "page" ? <h1 className="text-lg font-semibold">{title}</h1> : <h2 className="text-lg font-semibold">{title}</h2>}
          <p className="text-sm text-muted-foreground">{t("auth.noAccess.body", { email: me.Email })}</p>
          {failed && <p role="alert" className="text-sm text-destructive">{t("auth.noAccess.failed")}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button busy={working} onClick={() => void switchAccount()}>{t("auth.noAccess.switch")}</Button>
            <Button variant="outline" asChild><a href={mainOrigin}>{t("auth.noAccess.home")}</a></Button>
          </div>
        </div>
      </div>
    </div>
  )
}
