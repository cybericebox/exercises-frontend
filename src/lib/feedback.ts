// «Надіслати відгук»: a plain mailto link to the support mailbox. The subject names the app and the page path
// (no personal data); the address comes from the deployment env, a missing value fails the build.

/** Subject text without no-break spaces (the brand is written with them, a mail subject should not carry them). */
function plain(text: string): string {
  return text.replace(/\u00A0/g, " ")
}

/** mailto: URL to the support mailbox with the prefilled subject «Відгук: <app> <path>». */
export function feedbackHref(subject: string, body?: string): string {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
  if (!email) throw new Error("Missing required env: NEXT_PUBLIC_SUPPORT_EMAIL")
  return `mailto:${email}?subject=${encodeURIComponent(plain(subject))}${body ? `&body=${encodeURIComponent(plain(body))}` : ""}`
}
