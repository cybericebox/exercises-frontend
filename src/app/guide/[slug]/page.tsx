import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GuidePage } from "@/components/guide/GuidePage"
import { GUIDE_LOADERS, GUIDE_SLUGS, type GuideSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"

// Static export: only the listed pages exist.
export const dynamicParams = false

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }))
}

const isSlug = (slug: string): slug is GuideSlug => (GUIDE_SLUGS as readonly string[]).includes(slug)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return isSlug(slug) ? { title: t(`exercises.guide.title.${slug}`) } : {}
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isSlug(slug)) notFound()
  const { html, lead } = await GUIDE_LOADERS[slug]()
  return <GuidePage slug={slug} html={html} lead={lead} />
}
