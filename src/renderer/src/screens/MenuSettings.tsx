import { useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { DEFAULT_MENUS, MENU_ENTRIES, menuEntries, type MenuConfig } from '../menus'
import { Icons } from '../icons'

/** Settings → Menus: what the "I want to…" menu and the Home screen buttons show on this computer, and in what order. */
export default function MenuSettings({ boot, onChange }: { boot: BootInfo; onChange: (b: BootInfo) => void }) {
  const [menus, setMenus] = useState<MenuConfig>(() => ({
    top: menuEntries(boot.config.menus?.top, 'top').map((e) => e.id),
    home: menuEntries(boot.config.menus?.home, 'home').map((e) => e.id)
  }))
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (which: keyof MenuConfig, ids: string[]) => {
    setMenus({ ...menus, [which]: ids })
    setDirty(true)
  }
  async function save() {
    try {
      onChange(await window.pos.saveConfig({ menus }))
      setDirty(false)
      setMsg({ ok: true, text: 'Menus saved for this computer' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  const List = ({ which, title, text }: { which: keyof MenuConfig; title: string; text: string }) => {
    const ids = menus[which]
    const move = (id: string, d: -1 | 1) => {
      const i = ids.indexOf(id)
      const j = i + d
      if (i < 0 || j < 0 || j >= ids.length) return
      const next = [...ids]
      ;[next[i], next[j]] = [next[j], next[i]]
      set(which, next)
    }
    const unused = MENU_ENTRIES.filter((e) => !ids.includes(e.id))
    return (
      <div className="card form menu-list">
        <h3>{title}</h3>
        <p className="muted small">{text}</p>
        {ids.map((id, i) => {
          const e = MENU_ENTRIES.find((x) => x.id === id)!
          return (
            <div key={id} className="menu-row">
              <span className="mr-icon">{Icons[e.icon]}</span>
              <span className="mr-label">{e.label}</span>
              <button className="link small" disabled={i === 0} onClick={() => move(id, -1)} title="Move up">
                ▲
              </button>
              <button className="link small" disabled={i === ids.length - 1} onClick={() => move(id, 1)} title="Move down">
                ▼
              </button>
              <button className="link danger-text" onClick={() => set(which, ids.filter((x) => x !== id))} title="Take it off this menu">
                ✕
              </button>
            </div>
          )
        })}
        {unused.length > 0 && (
          <select
            value=""
            onChange={(ev) => {
              if (ev.target.value) set(which, [...ids, ev.target.value])
            }}
          >
            <option value="">+ Add…</option>
            {unused.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        )}
        <div>
          <button className="link small" onClick={() => set(which, DEFAULT_MENUS[which])}>
            Reset to the standard list
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="menu-settings">
      <p className="muted">
        Choose what <b>this computer</b> ({boot.config.tillName}) shows. For example, the service desk can put "Check in a repair" at the
        top, and the front counter "Make a sale" and "Return items".
      </p>
      <div className="menu-cols">
        <List which="top" title='"I want to…" menu (top left)' text="The drop-down at the top of every screen." />
        <List which="home" title="Left menu buttons" text="Always visible on the left of every screen. Home, Settings and Updates remain available automatically." />
      </div>
      {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
      <div className="row gap">
        <button className="primary" disabled={!dirty} onClick={save}>
          Save menus
        </button>
        {dirty && <span className="muted small">Not saved yet</span>}
      </div>
    </div>
  )
}
