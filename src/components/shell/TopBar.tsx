"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Logo } from "@/components/brand/Logo"
import { useRole } from "@/lib/useRole"
import { apiPost, mediaUrl } from "@/api/client"
import { t } from "@/i18n/t"
import { BookingsMenu } from "./BookingsMenu"
import { RunningTestsMenu } from "./RunningTestsMenu"
import { ThemeSwitch } from "./ThemeSwitch"
import { InboxButton } from "./InboxButton"
import { useEffect, useRef, useState } from "react"
import { openConsentSettings } from "@/lib/consent"
import { COOKIE_POLICY_HREF } from "@/components/consent/cookiePolicyHref"
import { adminOrigin, idOrigin } from "@/lib/origins"
import { ACCOUNT_MENU_ICON_PROPS, ACCOUNT_MENU_ICONS, ACCOUNT_MENU_LABELS, accountMenu } from "@/lib/accountMenu"
import { initials } from "@/lib/initials"
import { BACK_LABELS } from "@/lib/backLink"
import { useBackLink } from "@/lib/useBackLink"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { ArrowLeft } from "lucide-react"
import { useExerciseAccess } from "./AccessContext"

// Unified account menu (lib/accountMenu): same entries, labels and icons in every app.
const ICON_CLASS = "shrink-0 text-muted-foreground group-focus:text-accent-foreground"

// Sign out from this origin so the API clears the session, then go straight to
// the id sign-in page (same flow as the admin app).
async function signOutAndRedirect(): Promise<void> {
  try {
    await apiPost("/api/auth/sign-out", {}, undefined, { required: false })
  } catch {
    // Even if the call fails, fall through to sign-in.
  }
  if (typeof window !== "undefined") window.location.href = `${idOrigin}/sign-in/`
}

// Back to the app that opened the catalog: only admin and event sites (lib/backLink). The same
// compact arrow as the id profile, named by its destination.
function BackArrow() {
  const pathname = usePathname()
  const [returnTo, setReturnTo] = useState<string | null>(null)
  // Event pages opened the catalog with ?return=; newer callers send ?return_to=.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const next = search.get("return_to") ?? search.get("return")
    queueMicrotask(() => setReturnTo(next))
  }, [pathname])
  const back = useBackLink(returnTo)
  if (!back || (back.kind !== "admin" && back.kind !== "event")) return null
  const label = t(BACK_LABELS[back.kind])
  return (
    <HoverTooltip text={label}>
      <a href={back.href} aria-label={label} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <ArrowLeft size={18} aria-hidden="true" />
      </a>
    </HoverTooltip>
  )
}

function AppNav() {
  const pathname = usePathname()
  const { access } = useExerciseAccess()
  const items = [
    { href: "/", label: t("exercises.nav.catalog"), active: pathname === "/" || pathname.startsWith("/detail") || pathname.startsWith("/new") },
    ...(access?.IsAdmin ? [{ href: "/proposals", label: t("exercises.nav.proposals"), active: pathname.startsWith("/proposals") }] : []),
  ]
  if (items.length < 2) return null
  return (
    <nav aria-label={t("exercises.nav.label")} className="hidden items-center gap-1 sm:flex">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm ${item.active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function TopBar() {
  const { me } = useRole()
  // Set by the cookie item: on menu close, focus goes back to the trigger first, then the
  // banner opens (it remembers the trigger and returns focus there).
  const openConsentRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { access } = useExerciseAccess()
  const returnTo = typeof window !== "undefined" ? window.location.href : ""
  const entries = accountMenu(
    "exercises",
    { adminTier: Boolean(access?.IsAdmin), catalog: true, returnTo },
    { id: idOrigin, admin: adminOrigin, exercises: "" },
  )
  const avatarInitials = initials(me?.FirstName, me?.LastName, me?.Email)
  const fullName = me ? `${me.FirstName} ${me.LastName}`.trim() || me.Email : ""
  return (
    <header className="sticky top-0 z-40 flex min-h-[56px] items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <span className="flex min-w-0 items-center gap-3">
          <BackArrow />
          <Logo size={28} />
          <Link href="/" className="truncate text-sm font-semibold text-foreground">{t("exercises.app.title")}</Link>
        </span>
        <AppNav />
      </div>
      <div className="flex items-center gap-3">
        <RunningTestsMenu />
        <BookingsMenu />
        <ThemeSwitch />
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <InboxButton defaultTab="requestsIfOpen" />
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={triggerRef}
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
              avatarInitials
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(e) => {
              if (!openConsentRef.current) return
              openConsentRef.current = false
              e.preventDefault()
              triggerRef.current?.focus()
              openConsentSettings()
            }}
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-medium">{fullName}</span>
              <span className="text-xs font-normal text-muted-foreground">{me?.Email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {entries.map((entry, i) => {
              if (entry.kind === "divider") return <DropdownMenuSeparator key={i} />
              if (entry.kind === "cookies") {
                const Icon = ACCOUNT_MENU_ICONS.cookies
                // A link to the cookie policy, always shown. With JS only the navigation is cancelled
                // (on the native event, so the menu still sees the select).
                return (
                  <DropdownMenuItem key={i} asChild className="group gap-2" onSelect={() => { openConsentRef.current = true }}>
                    <a href={COOKIE_POLICY_HREF} aria-label={t(ACCOUNT_MENU_LABELS.cookiesAria)} onClick={(e) => e.nativeEvent.preventDefault()}>
                      <Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} />{t(ACCOUNT_MENU_LABELS.cookies)}
                    </a>
                  </DropdownMenuItem>
                )
              }
              if (entry.kind === "signOut") {
                const Icon = ACCOUNT_MENU_ICONS.signOut
                return (
                  <DropdownMenuItem key={i} className="group gap-2" onSelect={(e) => { e.preventDefault(); void signOutAndRedirect() }}>
                    <Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} />{t(ACCOUNT_MENU_LABELS.signOut)}
                  </DropdownMenuItem>
                )
              }
              const Icon = ACCOUNT_MENU_ICONS[entry.key]
              return (
                <DropdownMenuItem key={entry.key} asChild className="group gap-2">
                  <a href={entry.href}><Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} />{t(ACCOUNT_MENU_LABELS[entry.key])}</a>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
