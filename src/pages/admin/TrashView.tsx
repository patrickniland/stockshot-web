// StockShot — Admin: Trash (restore + permanent delete)

import { useState } from 'react'
import useAppStore from '../../store/useAppStore'

export default function TrashView() {
  const getTrashedShoots = useAppStore(s => s.getTrashedShoots)
  const restoreShoot = useAppStore(s => s.restoreShoot)
  const permanentlyDeleteShoot = useAppStore(s => s.permanentlyDeleteShoot)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  const trashedShoots = getTrashedShoots()
  const confirmShoot = trashedShoots.find(s => s.id === confirmId)

  return (
    <div style={{ padding: '2rem', maxWidth: '700px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>Trash</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '2rem' }}>
        Shoots moved to trash are recoverable for 30 days. Permanent deletion cannot be undone.
      </p>

      {trashedShoots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#aaa' }}>
          <p style={{ fontSize: '32px', marginBottom: '10px' }}>🗑</p>
          <p style={{ fontSize: '14px' }}>Trash is empty</p>
        </div>
      ) : trashedShoots.map(shoot => {
        const deletedDate = new Date(shoot.deletedAt!)
        const expiresMs = deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000
        const daysLeft = Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24))

        return (
          <div key={shoot.id} style={{
            background: '#fff', border: '1px solid #FFCDD2', borderRadius: '10px',
            padding: '16px', marginBottom: '10px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>{shoot.name}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                {shoot.items.length} items · Deleted {deletedDate.toLocaleDateString('en-ZA')} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
              </div>
            </div>
            <button
              onClick={() => restoreShoot(shoot)}
              style={{
                padding: '7px 14px', background: '#E8F5E9', color: '#2E7D32',
                border: '1px solid #A5D6A7', borderRadius: '6px',
                fontSize: '12px', fontWeight: 500, cursor: 'pointer', flexShrink: 0,
              }}
            >
              ↩ Restore
            </button>
            <button
              onClick={() => { setConfirmId(shoot.id); setConfirmInput('') }}
              style={{
                padding: '7px 14px', background: '#fff', color: '#B71C1C',
                border: '1px solid #FFCDD2', borderRadius: '6px',
                fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              }}
            >
              Delete Forever
            </button>
          </div>
        )
      })}

      {/* Permanent delete confirmation */}
      {confirmShoot && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '28px 32px',
            width: '380px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#B71C1C', marginBottom: '10px' }}>
              Permanently delete shoot?
            </h3>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '16px' }}>
              This will permanently delete <strong>{confirmShoot.name}</strong> and all {confirmShoot.items.length} items. This cannot be undone.
            </p>
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              Type the shoot name to confirm:
            </p>
            <input
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={confirmShoot.name}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '13px',
                outline: 'none', marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  permanentlyDeleteShoot(confirmShoot)
                  setConfirmId(null)
                  setConfirmInput('')
                }}
                disabled={confirmInput !== confirmShoot.name}
                style={{
                  padding: '9px 20px', background: confirmInput === confirmShoot.name ? '#B71C1C' : '#E0E0E0',
                  color: confirmInput === confirmShoot.name ? '#fff' : '#999',
                  border: 'none', borderRadius: '8px', fontSize: '13px',
                  fontWeight: 600, cursor: confirmInput === confirmShoot.name ? 'pointer' : 'default',
                }}
              >
                Delete Forever
              </button>
              <button
                onClick={() => { setConfirmId(null); setConfirmInput('') }}
                style={{
                  padding: '9px 16px', background: 'transparent', border: '1px solid #E0E0E0',
                  borderRadius: '8px', fontSize: '13px', color: '#555', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
