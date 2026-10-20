import type { Metadata } from "next"
import { GuidePage } from "@/components/guide/GuidePage"
import { llmDigest } from "@/content/guide/llm"
import { GUIDE_LOADERS } from "@/content/guide/registry"
import { t } from "@/i18n/t"

export function generateMetadata(): Metadata {
  return { title: t("exercises.guide.title.index") }
}

export default async function Page() {
  const { html, lead } = await GUIDE_LOADERS.index()
  return <GuidePage slug="index" html={html} lead={lead} llmText={llmDigest} />
}
