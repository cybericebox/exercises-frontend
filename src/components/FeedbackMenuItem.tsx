"use client"

import { MessageSquare } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { FeedbackLink } from "@/components/FeedbackLink"
import { t } from "@/i18n/t"
import { ACCOUNT_MENU_ICON_PROPS } from "@/lib/accountMenu"

// «Надіслати відгук» as a normal item of the account menu: the panel has no footer to carry it.
export function FeedbackMenuItem() {
  return (
    <DropdownMenuItem asChild className="group gap-2">
      <FeedbackLink>
        <MessageSquare {...ACCOUNT_MENU_ICON_PROPS} className="shrink-0 text-muted-foreground group-focus:text-accent-foreground" />
        {t("feedback.link")}
      </FeedbackLink>
    </DropdownMenuItem>
  )
}
