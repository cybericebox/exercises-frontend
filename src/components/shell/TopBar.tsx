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
import { ThemeSwitch } from "./ThemeSwitch"
import { House, LogOut, Settings, UserRound, type LucideIcon, Puzzle } from "lucide-react"
import { adminOrigin, idOrigin, mainOrigin } from "@/lib/origins"
import { accountLinks, type AccountLinkKey } from "@/lib/accountMenu"
import { useExerciseAccess } from "./AccessContext"

// Unified account menu (lib/accountMenu): same labels and icons in every app.
const ACCOUNT_ITEMS: Record<AccountLinkKey, { label: string; icon: LucideIcon }> = {
  profile: { label: "admin.profile", icon: UserRound },
  admin: { label: "admin.account.admin", icon: Settings },
  exercises: { label: "admin.account.exercises", icon: Puzzle },
  main: { label: "admin.account.home", icon: House },
}

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
  const { access } = useExerciseAccess()
  const returnTo = typeof window !== "undefined" ? window.location.href : ""
  const links = accountLinks(
    "exercises",
    { adminTier: Boolean(access?.IsAdmin), catalog: true, returnTo },
    { id: idOrigin, admin: adminOrigin, exercises: "", main: mainOrigin },
  )
  const initials = me ? `${me.FirstName?.[0] ?? ""}${me.LastName?.[0] ?? ""}` : ""
  const fullName = me ? `${me.FirstName} ${me.LastName}`.trim() || me.Email : ""
  return (
    <header className="sticky top-0 z-40 flex min-h-[56px] items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <span className="flex min-w-0 items-center gap-3">
          <Logo size={28} />
          <Link href="/" className="truncate text-sm font-semibold text-foreground">{t("exercises.app.title")}</Link>
        </span>
        <AppNav />
      </div>
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
            {links.map(({ key, href }) => {
              const { label, icon: Icon } = ACCOUNT_ITEMS[key]
              return (
                <DropdownMenuItem key={key} asChild className="gap-2">
                  <a href={href}><Icon className="h-4 w-4" aria-hidden="true" />{t(label)}</a>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={(e) => { e.preventDefault(); void signOutAndRedirect() }}>
              <LogOut className="h-4 w-4" aria-hidden="true" />{t("admin.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
