// StockShot — Jobs / Shoots View

import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import { Shoot } from '../types'

export default function JobsView() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedDrops, setExpandedDrops] = useState<string | null>(null)

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const switchToShoot = useAppStore(s => s.switchToShoot)
  const navigate = useNavigate()
  const softDeleteShoot = useAppStore(s => s.softDeleteShoot)
  const restoreShoot = useAppStore(s => s.restoreShoot)
  const permanentlyDeleteShoot = useAppStore(s => s.permanentlyDeleteShoot)
  const getTrashedShoots = useAppStore(s => s.getTrashedShoots)
  const getActiveShoots = useAppStore(s => s.getActiveShoots)
  const renameActiveShoot = useAppStore(s => s.renameActiveShoot)
  const clientName = useAppStore(s => s.clientName)
  
  const activeShoots = getActiveShoots()
  const trashedShoots = getTrashedShoots()

  // Group by client
  const grouped: Record<string, Shoot[]> = {}
  for (const shoot of activeShoots) {
    const name = clientName(shoot.clientId) ?? 'No Client'
    if (!grouped[name]) grouped[name] = []
    grouped[name].push(shoot)
  }

  if (activeShoots.length === 0 && trashedShoots.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>📁</p>
        <p style={{ fontWeight: 500, color: '#111', marginBottom: '6px' }}>No shoots yet</p>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Import a stock file to create your first shoot.</p>
        <button onClick={() => navigate('/import')} style={{
          padding: '10px 20px', background: '#1C1C1E', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
        }}>
          Go to Import
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#111', margin: 0 }}>Shoots</h1>
        <span style={{ fontSize: '13px', color: '#666' }}>({activeShoots.length})</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/import')} style={{
          padding: '8px 16px', background: '#1C1C1E', color: '#fff',
          border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
        }}>
          + New Import
        </button>
      </div>

      {Object.entries(grouped).map(([client, shoots]) => (
        <div key={client} style={{ marginBottom: '1.5rem' }}>
          {/* Client header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingLeft: '4px' }}>
            <span style={{ fontSize: '11px' }}>🏢</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1565C0' }}>{client}</span>
            <span style={{ fontSize: '11px', color: '#888' }}>· {shoots.length} shoot{shoots.length !== 1 ? 's' : ''}</span>
          </div>

          {shoots.map(shoot => {
            const isActive = shoot.id === activeShootId
            const canSwitch = !isActive
            const showDrops = expandedDrops === shoot.id
            const itemCount = shoot.items.length
            const receivedCount = shoot.items.filter(i => i.status === 'received').length
            const dispatchedCount = shoot.items.filter(i => i.status === 'dispatched').length
            const pendingCount = shoot.items.filter(i => i.status === 'pending').length
            const shotCount = shoot.items.filter(i => i.shotStatus === 'shot').length

            return (
              <div key={shoot.id}
                onClick={() => { if (!isActive) switchToShoot(shoot) }}
                style={{
                  background: '#fff',
                  border: `${isActive ? 1.5 : 1}px solid ${isActive ? '#2E7D32' : '#E0E0E0'}`,
                  borderRadius: '10px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '16px', gap: '12px' }}>
                  {/* Active indicator */}
                  <div style={{ width: '4px', alignSelf: 'stretch', background: isActive ? '#2E7D32' : '#E0E0E0', borderRadius: '2px', flexShrink: 0 }} />

                  <div style={{ flex: 1 }}>
                    {/* Name row */}
                    {editingId === shoot.id ? (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input value={editingName} onChange={e => setEditingName(e.target.value)}
                          style={{ flex: 1, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '14px' }} />
                        <button onClick={() => { renameActiveShoot(editingName); setEditingId(null) }}
                          style={{ padding: '6px 12px', background: '#2E7D32', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '6px 12px', background: '#F5F5F5', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#666' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{shoot.name}</span>
                        {isActive && (
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', padding: '2px 6px', borderRadius: '4px' }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px' }}>
                      Created {new Date(shoot.createdAt).toLocaleDateString('en-ZA')} · Updated {new Date(shoot.updatedAt).toLocaleDateString('en-ZA')}
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: shoot.drops.length > 0 ? '8px' : 0 }}>
                      <StatChip value={itemCount} label="Items" color="#1C1C1E" />
                      <StatChip value={receivedCount} label="Received" color="#2E7D32" />
                      <StatChip value={dispatchedCount} label="Dispatched" color="#1565C0" />
                      {shoot.hasMeaningfulPending && <StatChip value={pendingCount} label="Outstanding" color="#E65100" />}
                      <StatChip value={`${shotCount}/${itemCount}`} label="Shot" color="#7B1FA2" />
                      <StatChip value={shoot.drops.length} label={`Drop${shoot.drops.length !== 1 ? 's' : ''}`} color="#666" />
                    </div>

                    {/* Drops toggle */}
                    {shoot.drops.length > 0 && (
                      <button onClick={() => setExpandedDrops(showDrops ? null : shoot.id)}
                        style={{ background: 'none', border: 'none', fontSize: '10px', color: '#1565C0', cursor: 'pointer', padding: 0, marginBottom: showDrops ? '8px' : 0 }}>
                        {showDrops ? '▾ Hide drops' : `▸ Show ${shoot.drops.length} drop${shoot.drops.length !== 1 ? 's' : ''}`}
                      </button>
                    )}

                    {/* Drops list */}
                    {showDrops && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {shoot.drops.map(drop => (
                          <div key={drop.id} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#F8F8F8', borderRadius: '5px', padding: '5px 8px',
                            fontSize: '10px', color: '#666',
                          }}>
                            <span>⬇</span>
                            <span style={{ fontWeight: 500, color: '#444' }}>{drop.name}</span>
                            <span>·</span>
                            <span style={{
                              background: drop.importMode === 'jobList' ? '#E8F5E9' : '#E3F2FD',
                              color: drop.importMode === 'jobList' ? '#2E7D32' : '#1565C0',
                              padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 700,
                            }}>
                              {drop.importMode === 'jobList' ? 'Job List' : 'Reference'}
                            </span>
                            <span>·</span>
                            <span>{drop.itemCount} items</span>
                            <span>·</span>
                            <span>{new Date(drop.importedAt).toLocaleDateString('en-ZA')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    {!isActive && (
                      <button onClick={() => switchToShoot(shoot)}
                        style={{ padding: '6px 12px', background: '#1565C0', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                        Switch
                      </button>
                    )}
                    <button onClick={() => { setEditingId(shoot.id); setEditingName(shoot.name) }}
                      style={{ padding: '6px 12px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#444' }}>
                      Rename
                    </button>
                    <button onClick={() => { if (confirm(`Move "${shoot.name}" to trash?\n\n${shoot.items.length} items will be recoverable for 30 days.`)) softDeleteShoot(shoot) }}
                      style={{ padding: '6px 12px', background: '#fff', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#B71C1C' }}>
                      🗑 Trash
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Trash section */}
      {trashedShoots.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingLeft: '4px' }}>
            <span style={{ fontSize: '14px' }}>🗑</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#B71C1C' }}>Recently Deleted</span>
            <span style={{ fontSize: '11px', color: '#888' }}>· Auto-deleted after 30 days</span>
          </div>
          {trashedShoots.map(shoot => {
            const daysLeft = Math.ceil((new Date(shoot.deletedAt!).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
            return (
              <div key={shoot.id} style={{
                background: '#FFF5F5', border: '1px solid #FFCDD2',
                borderRadius: '10px', padding: '14px 16px',
                marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#444' }}>{shoot.name}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                    {shoot.items.length} items · Deleted {new Date(shoot.deletedAt!).toLocaleDateString('en-ZA')} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} until permanent deletion
                  </div>
                </div>
                <button onClick={() => restoreShoot(shoot)} style={{
                  padding: '6px 14px', background: '#E8F5E9', color: '#2E7D32',
                  border: '1px solid #A5D6A7', borderRadius: '6px', fontSize: '12px',
                  cursor: 'pointer', fontWeight: 500,
                }}>
                  ↩ Restore
                </button>
                <button onClick={() => { if (confirm(`Permanently delete "${shoot.name}"?\n\nThis CANNOT be undone. All ${shoot.items.length} items will be lost forever.`)) permanentlyDeleteShoot(shoot) }} style={{
                  padding: '6px 12px', background: '#fff', border: '1px solid #FFCDD2',
                  borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#B71C1C',
                }}>
                  Delete Forever
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Extend Shoot type locally for hasMeaningfulPending
declare module '../types' {
  interface Shoot {
    hasMeaningfulPending: boolean
  }
}

// Patch computed property
Object.defineProperty(Object.prototype, 'hasMeaningfulPending', {
  get() { return this.drops?.some?.((d: any) => d.importMode === 'jobList') ?? false },
  configurable: true,
})

function StatChip({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '9px', color: '#888' }}>{label}</div>
    </div>
  )
}
