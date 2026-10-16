"use client"

import { useState } from "react"
import { ArrowUpRight, ChevronDown, Download, Shield, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { downloadBlob } from "@/lib/downloadBlob"
import "@/styles/vpn-dialog.css"

const WIREGUARD_INSTALL_URL = "https://www.wireguard.com/install/"
const VPN_CONFIG_FILENAME = "cybericebox.conf"

/** The same short connection guide used by participants on event sites. */
export function VpnDialog({ open, config, connected = null, probeUrl, onClose }: { open: boolean; config: string; connected?: boolean | null; probeUrl?: string; onClose: () => void }) {
  const [error, setError] = useState("")
  const gateway = probeUrl && URL.canParse(probeUrl) ? new URL(probeUrl).hostname : ""
  const download = () => {
    setError("")
    try {
      downloadBlob(new Blob([config], { type: "text/plain" }), VPN_CONFIG_FILENAME)
    } catch {
      setError(t("admin.exTest.vpnHelp.failed"))
    }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(""); onClose() } }}>
    <DialogContent className="vpn-dialog" aria-describedby={undefined}>
      <header className="vpn-dialog__head">
        <DialogTitle className="vpn-dialog__title">{t("admin.exTest.vpnHelp.title")}</DialogTitle>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="vpn-dialog__close" aria-label={t("admin.exTest.vpnHelp.close")}><X aria-hidden="true" /></Button></DialogClose>
      </header>
      <div className="vpn-dialog__body">
        <div role="status" data-vpn={connected === true ? "connected" : "available"} className="vpn-dialog__status">
          {connected === true ? <ShieldCheck aria-hidden="true" /> : <Shield aria-hidden="true" />}
          <strong>{t(connected === true ? "admin.exTest.vpnHelp.connected" : connected === false ? "admin.exTest.vpnHelp.ready" : "admin.exTest.vpnHelp.available")}</strong>
        </div>
        {connected === null && <p className="vpn-dialog__note">{t("admin.exTest.vpnHelp.unknown")}</p>}
        <details className="vpn-dialog__instructions" open={connected !== true}>
          <summary>{t("admin.exTest.vpnHelp.instructions")}<ChevronDown aria-hidden="true" /></summary>
          <div className="vpn-dialog__instructions-body">
            <ol className="vpn-dialog__steps">
              <li>{tRich("admin.exTest.vpnHelp.installLink", { link: <a href={WIREGUARD_INSTALL_URL} target="_blank" rel="noopener noreferrer">{t("admin.exTest.vpnHelp.software")}</a> })}</li>
              <li>{t("admin.exTest.vpnHelp.download")}</li>
              <li><div className="vpn-dialog__methods">
                <div><strong>{t("admin.exTest.vpnHelp.app")}</strong><p>{t("admin.exTest.vpnHelp.import")}</p></div>
                <div><strong>{t("admin.exTest.vpnHelp.terminal")}</strong><p>{t("admin.exTest.vpnHelp.terminalFolder")}</p>
                  <pre className="vpn-dialog__command"><code>{t("admin.exTest.vpnHelp.command", { filename: VPN_CONFIG_FILENAME })}</code></pre>
                </div>
              </div></li>
              {probeUrl && <li>{tRich("admin.exTest.vpnHelp.checkProbe", {
                link: <a href={probeUrl} target="_blank" rel="noopener noreferrer">{t("admin.exTest.vpnHelp.check")} <ArrowUpRight aria-hidden="true" /></a>,
                ping: gateway ? <code>{t("admin.exTest.vpnHelp.pingCommand", { gateway })}</code> : null,
              })}</li>}
            </ol>
            <p className="vpn-dialog__note">{t("admin.exTest.vpnHelp.note")}</p>
          </div>
        </details>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <footer className="vpn-dialog__foot">
        <Button type="button" onClick={download}><Download aria-hidden="true" size={16} className="mr-1.5" />{t("admin.exTest.vpnHelp.downloadButton")}</Button>
      </footer>
    </DialogContent>
  </Dialog>
}
