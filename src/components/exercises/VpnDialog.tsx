"use client"

import { useState } from "react"
import { ArrowUpRight, ChevronDown, Download, Shield, ShieldCheck, ShieldEllipsis, X } from "lucide-react"

import { VpnCommand } from "./VpnCommand"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { downloadBlob } from "@/lib/downloadBlob"
import { TEST_VPN_FILE } from "@/lib/wireguard"
import "@/styles/vpn-dialog.css"

const WIREGUARD_INSTALL_URL = "https://www.wireguard.com/install/"

function VpnIcon({ ready, connected }: { ready: boolean; connected: boolean | null }) {
  return ready && connected === true ? <ShieldCheck aria-hidden="true" /> : ready ? <Shield aria-hidden="true" /> : <ShieldEllipsis aria-hidden="true" />
}

/**
 * The VPN window of a test lab: the same structure, order and copy as the event site's (EventVpn.tsx, VpnModal and
 * VpnConnectionStatus), in its test-configuration mode. Nothing else is added: no web access, no device addresses and no
 * line about reverse connections.
 */
export function VpnDialog({ open, ready, config, connected, probeUrl, onClose }: {
  open: boolean
  /** The configuration can be downloaded (the lab is ready and its VPN is up). */
  ready: boolean
  config: string
  /** null: the connection status is not known. */
  connected: boolean | null
  probeUrl?: string
  onClose: () => void
}) {
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState("")
  const gateway = probeUrl && URL.canParse(probeUrl) ? new URL(probeUrl).hostname : ""
  const download = async () => {
    if (!ready || issuing) return
    setIssuing(true)
    setError("")
    try {
      if (!config) throw new Error("empty")
      downloadBlob(new Blob([config], { type: "text/plain;charset=utf-8" }), TEST_VPN_FILE)
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "empty" ? t("ed.d.vpn.error.notReady") : t("ed.d.vpn.error.failed"))
    } finally {
      setIssuing(false)
    }
  }
  const state = !ready ? "pending" : connected === true ? "connected" : "available"
  return <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(""); onClose() } }}>
    <DialogContent className="vpn-dialog" aria-describedby={undefined}>
      <header className="vpn-dialog__head">
        <DialogTitle className="vpn-dialog__title">{t("ed.d.vpn.modal.title")}</DialogTitle>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="vpn-dialog__close" aria-label={t("ed.d.close")}><X aria-hidden="true" /></Button></DialogClose>
      </header>
      <div className="vpn-dialog__body">
        <div role="status" data-vpn={state} className="vpn-dialog__status">
          <VpnIcon ready={ready} connected={connected} />
          <strong>{t(!ready ? "ed.d.vpn.group.pending" : connected === true ? "ed.d.vpn.connection.connected" : connected === false ? "ed.d.vpn.group.ready" : "ed.d.vpn.group.available")}</strong>
        </div>
        <p className="vpn-dialog__note">{t("ed.d.vpn.preview.testConfig")}</p>
        {!ready && <div className="vpn-dialog__wait"><p>{t("ed.d.vpn.group.previewWait")}</p><p className="vpn-dialog__note">{t("ed.d.vpn.group.waitNext")}</p></div>}
        {ready && <>
          {connected === null && <p className="vpn-dialog__note">{t("ed.d.vpn.connection.unknown")}</p>}
          <details className="vpn-dialog__instructions" open={connected !== true}>
            <summary>{t("ed.d.vpn.instructions")}<ChevronDown aria-hidden="true" /></summary>
            <div className="vpn-dialog__instructions-body">
              <ol className="vpn-dialog__steps">
                <li>{tRich("ed.d.vpn.steps.install", { link: <a href={WIREGUARD_INSTALL_URL} target="_blank" rel="noopener noreferrer">{t("ed.d.vpn.software")}</a> })}</li>
                <li>{t("ed.d.vpn.steps.download")}</li>
                <li><div className="vpn-dialog__methods">
                  <div><strong>{t("ed.d.vpn.steps.app")}</strong><p>{t("ed.d.vpn.steps.import")}</p></div>
                  <div><strong>{t("ed.d.vpn.steps.terminal")}</strong><p>{t("ed.d.vpn.steps.terminalFolder")}</p>
                    <p className="vpn-dialog__note">{t("ed.d.vpn.steps.up")}</p>
                    <VpnCommand value={t("ed.d.vpn.steps.command", { filename: TEST_VPN_FILE })} />
                    <p className="vpn-dialog__note">{t("ed.d.vpn.steps.down")}</p>
                    <VpnCommand value={t("ed.d.vpn.steps.downCommand", { filename: TEST_VPN_FILE })} />
                  </div>
                </div></li>
                {probeUrl && <li>{tRich("ed.d.vpn.steps.checkProbe", {
                  link: <a href={probeUrl} target="_blank" rel="noopener noreferrer">{t("ed.d.vpn.steps.probePage")} <ArrowUpRight aria-hidden="true" /></a>,
                  ping: gateway ? <VpnCommand value={t("ed.d.vpn.steps.pingCommand", { gateway })} inline /> : null,
                })}</li>}
              </ol>
              <p className="vpn-dialog__note">{t("ed.d.vpn.file.private")}</p>
              <p className="vpn-dialog__note">{t("ed.d.vpn.steps.reminder")}</p>
            </div>
          </details>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <footer className="vpn-dialog__foot">
        {ready
          ? <Button type="button" onClick={() => void download()} busy={issuing} busyLabel={t("ed.d.busy.preparing")}><Download aria-hidden="true" size={16} className="mr-1.5" />{t("ed.d.vpn.modal.download")}</Button>
          : <Button type="button" onClick={onClose}>{t("ed.d.vpn.modal.acknowledge")}</Button>}
      </footer>
    </DialogContent>
  </Dialog>
}
