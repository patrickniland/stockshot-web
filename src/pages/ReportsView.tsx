// StockShot — Dashboard / Reports View

import { useState } from 'react'
import useAppStore from '../store/useAppStore'

export default function ReportsView() {
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const getActiveShoot = useAppStore(s => s.getActiveShoot)
  const getItems = useAppStore(s => s.getItems)
  const getReceived = useAppStore(s => s.getReceived)
  const getDispatched = useAppStore(s => s.getDispatched)
  const getPending = useAppStore(s => s.getPending)
  const getShot = useAppStore(s => s.getShot)
  const getNotShot = useAppStore(s => s.getNotShot)
  const pendingIsMeaningful = useAppStore(s => s.pendingIsMeaningful)
  const clearActiveShoot = useAppStore(s => s.clearActiveShoot)
  const clientName = useAppStore(s => s.clientName)

  const shoot = getActiveShoot()
  const items = getItems()
  const received = getReceived()
  const dispatched = getDispatched()
  const pending = getPending()
  const shot = getShot()
  const notShot = getNotShot()
  const meaningful = pendingIsMeaningful()
  const total = items.length
  const notRequired = items.filter(i => i.shotStatus === 'notRequired').length

  // Angle completion stats
  const itemsWithAngles = items.filter(i => i.requiredAngles.length > 0)
  const fullyShot = itemsWithAngles.filter(i =>
    i.requiredAngles.every(a => i.completedAngles.includes(a))
  ).length
  const partiallyShot = itemsWithAngles.filter(i =>
    i.completedAngles.length > 0 &&
    !i.requiredAngles.every(a => i.completedAngles.includes(a))
  ).length

  function pct(val: number) {
    return total > 0 ? Math.round((val / total) * 100) : 0
  }

  if (!shoot) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>📊</p>
        <p style={{ fontWeight: 500 }}>No active shoot</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '860px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#111', margin: 0 }}>Dashboard</h1>
        <span style={{ fontSize: '14px', color: '#666' }}>— {shoot.name}</span>
        {clientName(shoot.clientId) && (
          <span style={{ fontSize: '12px', color: '#888' }}>({clientName(shoot.clientId)})</span>
        )}
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
        <KpiTile value={total} label="Total Imported" color="#1C1C1E" />
        <KpiTile value={received.length} label="Received" color="#2E7D32" />
        <KpiTile value={dispatched.length} label="Dispatched" color="#1565C0" />
        <KpiTile value={meaningful ? pending.length : 'N/A'} label={meaningful ? 'Missing' : 'Pending (N/A)'} color="#E65100" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '1.5rem' }}>
        <KpiTile value={shot.length} label="Shot" color="#7B1FA2" />
        <KpiTile value={notShot.length} label="Not Shot" color="#E65100" />
        <KpiTile value={notRequired} label="Shot N/A" color="#999" />
        {itemsWithAngles.length > 0 && <KpiTile value={`${fullyShot}/${itemsWithAngles.length}`} label="All Angles Done" color="#7B1FA2" />}
      </div>

      {/* Progress bars */}
      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#666', marginBottom: '14px' }}>Progress</p>
        <ProgressBar label="Received (in studio + dispatched)" value={received.length + dispatched.length} total={total} color="#2E7D32" />
        <ProgressBar label="Dispatched" value={dispatched.length} total={total} color="#1565C0" />
        <ProgressBar label="In Studio (not dispatched)" value={received.length} total={total} color="#7B1FA2" />
        {meaningful && <ProgressBar label="Missing" value={pending.length} total={total} color="#E65100" />}
        <ProgressBar label="Shot" value={shot.length} total={total} color="#7B1FA2" />
        {itemsWithAngles.length > 0 && (
          <>
            <ProgressBar label="All angles complete" value={fullyShot} total={itemsWithAngles.length} color="#7B1FA2" />
            <ProgressBar label="Partially shot" value={partiallyShot} total={itemsWithAngles.length} color="#E65100" />
          </>
        )}
      </div>

      {/* Drop breakdown */}
      {shoot.drops.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#666', marginBottom: '12px' }}>Drops / Batches</p>
          {shoot.drops.map(drop => (
            <div key={drop.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}>
              <span style={{ fontSize: '12px', color: '#444', flex: 1 }}>{drop.name}</span>
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px',
                background: drop.importMode === 'jobList' ? '#E8F5E9' : '#E3F2FD',
                color: drop.importMode === 'jobList' ? '#2E7D32' : '#1565C0',
              }}>
                {drop.importMode === 'jobList' ? 'Job List' : 'Reference'}
              </span>
              <span style={{ fontSize: '11px', color: '#888' }}>{drop.itemCount} items</span>
              <span style={{ fontSize: '10px', color: '#aaa' }}>{new Date(drop.importedAt).toLocaleDateString('en-ZA')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Danger zone */}
      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '1.25rem' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#666', marginBottom: '10px' }}>Data Management</p>
        <div style={{ background: '#FFEBEE', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
              Removes all {total} imported items. Cannot be undone.
            </div>
          </div>
          {showClearConfirm ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { clearActiveShoot(); setShowClearConfirm(false) }}
                style={{ padding: '6px 14px', background: '#B71C1C', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                Yes, clear
              </button>
              <button onClick={() => setShowClearConfirm(false)}
                style={{ padding: '6px 14px', background: '#F5F5F5', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#666' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setShowClearConfirm(true)} disabled={total === 0}
              style={{ padding: '6px 14px', background: total === 0 ? '#E0E0E0' : '#fff', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '12px', cursor: total === 0 ? 'default' : 'pointer', color: total === 0 ? '#aaa' : '#B71C1C' }}>
              Clear All Data
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiTile({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${color}22`, borderRadius: '10px', padding: '20px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function ProgressBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const frac = total > 0 ? value / total : 0
  const pct = Math.round(frac * 100)
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#111' }}>{label}</span>
        <span style={{ fontSize: '11px', color: '#666' }}>{value} / {total} ({pct}%)</span>
      </div>
      <div style={{ background: '#E0E0E0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}
