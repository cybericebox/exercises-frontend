"use client"
import Link from "next/link"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Logo } from "@/components/brand/Logo"
import { useRole } from "@/lib/useRole"
import { apiPost, mediaUrl } from "@/api/client"
import { t } from "@/i18n/t"
import { ThemeSwitch } from "./ThemeSwitch"
import { idOrigin } from "@/lib/origins"

// Sign out from this origin so the API clears the session, then go straight to
// the id sign-in page (same flow as the admin app).
async function signOutAndRedirect(): Promise<void> {
  try {
    await apiPost("/api/auth/sign-out", {}, undefined, { required: false })
  } catch {
    // Even if the call fails, fall through to sign-in.
  }
  if (typeof window !== "undefined") window.location.href = `${idOrigin}/sign-in`
}

export function TopBar() {
  const { me } = useRole()
  const returnTo = typeof window !== "undefined" ? window.location.href : ""
  const initials = me ? `${me.FirstName?.[0] ?? ""}${me.LastName?.[0] ?? ""}` : ""
  const fullName = me ? `${me.FirstName} ${me.LastName}`.trim() || me.Email : ""
  return (
    <header className="sticky top-0 z-40 flex min-h-[56px] items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <Logo size={28} />
        <span className="truncate text-sm font-semibold text-foreground">{t("exercises.app.title")}</span>
      </Link>
      <div className="flex items-center gap-3">
        <ThemeSwitch />
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("admin.accountMenu")}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--ib-brand)] text-sm font-medium text-[var(--ib-on-brand)]"
          >
            {me?.Picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized images
              <img
                src={mediaUrl(me.Picture)}
                alt={fullName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              initials || "?"
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-medium">{fullName}</span>
              <span className="text-xs font-normal text-muted-foreground">{me?.Email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={`${idOrigin}/profile?return_to=${encodeURIComponent(returnTo)}`}>{t("admin.profile")}</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void signOutAndRedirect() }}>
              {t("admin.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
