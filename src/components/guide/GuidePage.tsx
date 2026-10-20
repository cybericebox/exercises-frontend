"use client"

import { Sparkles } from "lucide-react"
import type { GuidePageSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"
import { CopyButton } from "./CopyButton"
import { GuideNav } from "./GuideNav"
import { GuidePager } from "./GuidePager"
import { GuideProse } from "./GuideProse"
import "@/styles/guide.css"

/** One guide page inside the catalog shell: the secondary nav and the article. The overview adds «Скопіювати для LLM». */
export function GuidePage({ slug, html, lead, llmText }: { slug: GuidePageSlug; html: string; lead: string; llmText?: string }) {
  const overview = slug === "index"
  return <div className="frost-panel flex min-h-full min-w-0 flex-col rounded-lg p-3 sm:p-6">
    <div className="g-layout">
      <GuideNav active={slug} />
      <article className="min-w-0">
        <div className="g-head">
          <h1 className="min-w-0 break-words text-xl sm:text-2xl font-semibold text-foreground">{t(`exercises.guide.title.${slug}`)}</h1>
          {overview && llmText && <CopyButton text={llmText} label={t("exercises.guide.copyLlm")} icon={<Sparkles aria-hidden="true" />} />}
        </div>
        {lead && <p className="g-lead">{lead}</p>}
        <GuideProse html={html} />
        {!overview && <GuidePager slug={slug} />}
      </article>
    </div>
  </div>
}
