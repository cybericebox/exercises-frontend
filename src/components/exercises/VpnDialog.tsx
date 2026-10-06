"use client"

import { useState } from "react"
import { Download, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { downloadBlob } from "@/lib/downloadBlob"

const WIREGUARD_INSTALL_URL = "https://www.wireguard.com/install/"

/** Short connection steps for the author's test lab; the config download lives here, not in the bar. */
export function VpnDialog({ open, config, connected = false, probeUrl, onClose }: { open: boolean; config: string; connected?: boolean; probeUrl?: string; onClose: () => void }) {
  const [error, setError] = useState("")
  const download = () => {
    setError("")
    try {
      downloadBlob(new Blob([config], { type: "text/plain" }), "cybericebox.conf")
    } catch {
      setError(t("admin.exTest.vpnHelp.failed"))
    }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(""); onClose() } }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t("admin.exTest.vpnHelp.title")}</DialogTitle>
        <DialogDescription>{t("admin.exTest.vpnHelp.description")}</DialogDescription>
      </DialogHeader>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>{tRich("admin.exTest.vpnHelp.installLink", { link: <a className="underline" href={WIREGUARD_INSTALL_URL} target="_blank" rel="noopener noreferrer">{WIREGUARD_INSTALL_URL.replace(/^https:\/\//, "")}</a> })}</li>
        <li>{t("admin.exTest.vpnHelp.download")}</li>
        <li>{t("admin.exTest.vpnHelp.import")}</li>
        <li>{t("admin.exTest.vpnHelp.open")}</li>
      </ol>
      <p className="text-xs text-muted-foreground">{t("admin.exTest.vpnHelp.note")}</p>
      <div aria-live="polite" data-vpn={connected ? "connected" : "waiting"} className="flex items-center gap-2 text-sm">
        {connected
          ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("admin.exTest.vpnHelp.connected")}</span>
          : <><Spinner size="sm" label={t("admin.exTest.vpnHelp.waiting")} /><span className="text-muted-foreground" aria-hidden="true">{t("admin.exTest.vpnHelp.waiting")}</span></>}
      </div>
      {probeUrl && <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={probeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" size={16} className="mr-1.5" />{t("admin.exTest.vpnHelp.check")}</a>
        </Button>
        <p className="text-xs text-muted-foreground">{t("admin.exTest.vpnHelp.checkHint")}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t("admin.exTest.vpnHelp.close")}</Button>
        <Button type="button" onClick={download}><Download aria-hidden="true" size={16} className="mr-1.5" />{t("admin.exTest.vpnHelp.downloadButton")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
