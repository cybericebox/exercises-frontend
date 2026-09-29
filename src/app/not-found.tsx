import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wordmark } from "@/components/brand/Wordmark"
import { t } from "@/i18n/t"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col">
        <div className="mb-6 flex justify-center"><Wordmark size="lg" /></div>
        <Card className="frost-panel frost-in w-full text-center">
          <CardHeader><CardTitle>{t("error.notFound")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("error.notFoundDescription")}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">{t("error.goHome")}</Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
