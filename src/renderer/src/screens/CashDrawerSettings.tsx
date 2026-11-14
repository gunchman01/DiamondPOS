import { useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { drawerConfig, type CashDrawerConfig } from '../../../shared/drawer'
export default function CashDrawerSettings({ boot, onChange }: { boot: BootInfo; onChange: (boot: BootInfo) => void }) {
  const [draft, setDraft] = useState<CashDrawerConfig>(() => drawerConfig(boot.config.cashDrawer))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(drawerConfig(boot.config.cashDrawer))
  async function save() {
    setBusy(true); setMessage('')
    try { const normalized = drawerConfig(draft); const saved = await window.pos.saveConfig({ cashDrawer: normalized }); setDraft(normalized); onChange(saved); setMessage('Drawer settings saved for this PC') }
    catch (e) { setMessage((e as Error).message) }
    finally { setBusy(false) }
  }
  async function test() {
    setBusy(true); setMessage('')
    try { await window.pos.openCashDrawer(); setMessage('Drawer signal sent. Confirm the drawer physically opened.') }
    catch (e) { setMessage((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="card form">
    <h3>Cash drawer · this PC</h3>
    <p className="small muted">Uses your existing COM-port trigger: echo hello&gt;COM3 by default. Save changes before testing. Opening is manual; a completed cash sale does not automatically open the drawer.</p>
    <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Enable Cash Drawer button</label>
    <div className="row gap"><label>COM port<input value={draft.port} onChange={(e) => setDraft({ ...draft, port: e.target.value })} placeholder="COM3" /></label>
      <label>Trigger text<input value={draft.triggerText} maxLength={80} onChange={(e) => setDraft({ ...draft, triggerText: e.target.value })} /></label>
      <label>Shortcut<select value={draft.shortcut} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value as CashDrawerConfig['shortcut'] })}>{['none','F1','F10','F11','F12'].map((key) => <option key={key} value={key}>{key === 'none' ? 'Button only' : key}</option>)}</select></label></div>
    <p className="small muted">Shortcuts work while DiamondPOS is focused. If you choose F1, remove F1 from the old Windows shortcut to avoid sending two signals. F1 then opens the drawer instead of Help; the Help button remains available.</p>
    <div className="row gap"><button disabled={busy} onClick={() => void save()}>Save drawer settings</button><button disabled={busy || dirty || !draft.enabled} onClick={() => void test()}>Test saved drawer setup</button></div>
    {message && <div role="status">{message}</div>}
  </section>
}
