// StockShot — Reusable shoot picker select
// Real shoots first (alphabetical), divider, Unassigned shoots at bottom.

import { Shoot } from '../types'

interface Props {
  shoots: Shoot[]            // pass only the shoots the user should be able to pick
  value: string
  onChange: (id: string) => void
  placeholder?: string       // renders as first disabled/empty option when set
  style?: React.CSSProperties
}

export default function ShootPicker({ shoots, value, onChange, placeholder, style }: Props) {
  const regular    = shoots.filter(s => !s.isUnassigned).sort((a, b) => a.name.localeCompare(b.name))
  const unassigned = shoots.filter(s => s.isUnassigned).sort((a, b) => a.name.localeCompare(b.name))

  const base: React.CSSProperties = {
    width: '100%', padding: '6px 8px', fontSize: '13px',
    border: '1px solid #E0E0E0', borderRadius: '6px',
    background: '#fff', color: '#111', cursor: 'pointer',
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...base, ...style }}>
      {placeholder && <option value="">{placeholder}</option>}
      {shoots.length === 0 && !placeholder && <option value="">No shoots</option>}

      {regular.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}

      {regular.length > 0 && unassigned.length > 0 && (
        <option disabled>──────────</option>
      )}

      {unassigned.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  )
}
