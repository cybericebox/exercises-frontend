"use client"
import "@/styles/account-menu.css"
import { usePathname } from "next/navigation"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRole } from "@/lib/useRole"
import { apiPost, mediaUrl } from "@/api/client"
import { t } from "@/i18n/t"
import { RunningTestsMenu } from "./RunningTestsMenu"
import { THEME_OPTIONS, useThemeChoice } from "./ThemeSwitch"
import { InboxButton } from "./InboxButton"
import { Fragment, useId, useRef, useState, type Ref } from "react"
import { FeedbackMenuItem } from "@/components/FeedbackMenuItem"
import { openConsentSettings } from "@/lib/consent"
import { COOKIE_POLICY_HREF } from "@/components/consent/cookiePolicyHref"
import { adminOrigin, idOrigin } from "@/lib/origins"
import { ACCOUNT_MENU_ICON_PROPS, ACCOUNT_MENU_ICONS, ACCOUNT_MENU_LABELS, accountMenu } from "@/lib/accountMenu"
import { initials } from "@/lib/initials"
import { Menu, ChevronDown } from "lucide-react"
import type { ThemeChoice } from "@/lib/theme"
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

export function TopBar({ onMenuClick, menuButtonRef }: { onMenuClick?: () => void; menuButtonRef?: Ref<HTMLButtonElement> }) {
  const pathname = usePathname()
  const section = pathname.startsWith("/proposals") ? "exercises.nav.proposals" : "exercises.nav.catalog"
  const { me } = useRole()
  const [themeChoice, selectTheme] = useThemeChoice()
  const [themeExpanded, setThemeExpanded] = useState(false)
  const themeChoicesID = useId()
  const themeTrigger = useRef<HTMLDivElement>(null)
  const currentTheme = THEME_OPTIONS.find((option) => option.value === themeChoice)!
  const ThemeIcon = currentTheme.icon
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
    <header className="ib-topbar sticky top-0 z-(--ib-z-header) justify-between max-md:px-4!">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button ref={menuButtonRef} type="button" aria-label={t("exercises.shell.openMenu")} onClick={onMenuClick} className="ib-hit shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden"><Menu className="h-5 w-5" /></button>
        <span className="truncate text-sm font-semibold text-foreground">{t(section)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <RunningTestsMenu />
        <InboxButton defaultTab="requestsIfOpen" />
        <DropdownMenu onOpenChange={(open) => { if (!open) setThemeExpanded(false) }}>
          <DropdownMenuTrigger
            ref={triggerRef}
            aria-label={t("admin.accountMenu")}
            className="ib-hit flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ib-brand)] text-sm font-medium text-[var(--ib-on-brand)]"
          >
            {me?.Picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized images
              <img
                src={mediaUrl(me.Picture)}
                alt={fullName}
                referrerPolicy="no-referrer"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              avatarInitials
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="account-menu" collisionPadding={16}
            onCloseAutoFocus={(e) => {
              if (!openConsentRef.current) return
              openConsentRef.current = false
              e.preventDefault()
              triggerRef.current?.focus()
              openConsentSettings()
            }}
          >
            <DropdownMenuLabel className="account-menu__identity">
              <span className="truncate font-medium" title={fullName}>{fullName}</span>
              <span className="truncate text-xs font-normal text-muted-foreground" title={me?.Email}>{me?.Email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {entries.filter((entry) => entry.kind === "link").map((entry) => {
              const Icon = ACCOUNT_MENU_ICONS[entry.key]
              return (
                <DropdownMenuItem key={entry.key} asChild className="group gap-2">
                  <a href={entry.href}><Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} /><span className="min-w-0 truncate">{t(ACCOUNT_MENU_LABELS[entry.key])}</span></a>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem ref={themeTrigger} className="gap-2" aria-expanded={themeExpanded} aria-controls={themeChoicesID}
              onSelect={(event) => { event.preventDefault(); setThemeExpanded((expanded) => !expanded) }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") { event.preventDefault(); setThemeExpanded(true) }
                if (event.key === "ArrowLeft") { event.preventDefault(); setThemeExpanded(false) }
              }}>
              <ThemeIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{t("theme.label")}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t(currentTheme.label)}</span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${themeExpanded ? "rotate-180" : ""}`} />
            </DropdownMenuItem>
            {themeExpanded && <DropdownMenuRadioGroup id={themeChoicesID} aria-label={t("theme.label")} value={themeChoice}
              onValueChange={(value) => selectTheme(value as ThemeChoice)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); setThemeExpanded(false); themeTrigger.current?.focus() }
              }}>
              {THEME_OPTIONS.map(({ value, icon: Icon, label }) => <DropdownMenuRadioItem key={value} value={value} className="gap-2"><Icon aria-hidden="true" className="h-4 w-4" />{t(label)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>}
            {entries.filter((entry) => entry.kind !== "link").map((entry, i) => {
              if (entry.kind === "divider") return <DropdownMenuSeparator key={i} />
              if (entry.kind === "cookies") {
                const Icon = ACCOUNT_MENU_ICONS.cookies
                // A link to the cookie policy, always shown. With JS only the navigation is cancelled
                // (on the native event, so the menu still sees the select).
                return (
                  <Fragment key={i}>
                    <FeedbackMenuItem />
                    <DropdownMenuItem asChild className="group gap-2" onSelect={() => { openConsentRef.current = true }}>
                      <a href={COOKIE_POLICY_HREF} aria-label={t(ACCOUNT_MENU_LABELS.cookiesAria)} onClick={(e) => e.nativeEvent.preventDefault()}>
                        <Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} /><span className="account-menu__label">{t(ACCOUNT_MENU_LABELS.cookies)}</span>
                      </a>
                    </DropdownMenuItem>
                  </Fragment>
                )
              }
              if (entry.kind === "signOut") {
                const Icon = ACCOUNT_MENU_ICONS.signOut
                return (
                  <DropdownMenuItem key={i} className="group gap-2" onSelect={(e) => { e.preventDefault(); void signOutAndRedirect() }}>
                    <Icon {...ACCOUNT_MENU_ICON_PROPS} className={ICON_CLASS} /><span className="account-menu__label">{t(ACCOUNT_MENU_LABELS.signOut)}</span>
                  </DropdownMenuItem>
                )
              }
              return null
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
