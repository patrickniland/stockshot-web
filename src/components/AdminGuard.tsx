// StockShot — Admin route guard + layout shell

import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import PinEntryModal from './PinEntryModal'

const ADMIN_NAV = [
  { to: '/admin/clients',  label: 'Clients' },
  { to: '/admin/bulk',     label: 'Bulk Status Change' },
  { to: '/admin/trash',    label: 'Trash' },
  { to: '/admin/settings', label: 'Settings' },
]

function AdminBanner() {
  const adminSessionExpiresAt = useAppStore(s => s.adminSessionExpiresAt)
  const lockAdminNow = useAppStore(s => s.lockAdminNow)
  const navigate = useNavigate()
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  if (!adminSessionExpiresAt) return null

  const msLeft = adminSessionExpiresAt - Date.now()
  const minsLeft = Math.max(0, Math.ceil(msLeft / 60_000))

  function handleLock() {
    lockAdminNow()
    navigate('/jobs')
  }

  return (
    <div style={{
      background: '#1C1C1E', color: '#aaa',
      fontSize: '11px', padding: '6px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
      borderBottom: '1px solid #333',
    }}>
      <span style={{ color: '#888' }}>Admin mode — {minsLeft} min remaining</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={handleLock}
        style={{
          background: 'none', border: '1px solid #444', borderRadius: '5px',
          color: '#888', fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
        }}
      >
        Lock now
      </button>
    </div>
  )
}

function AdminSubNav() {
  return (
    <div style={{
      background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
      padding: '0 24px', display: 'flex', gap: '2px',
    }}>
      {ADMIN_NAV.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#1C1C1E' : '#888',
            textDecoration: 'none',
            borderBottom: isActive ? '2px solid #1C1C1E' : '2px solid transparent',
            marginBottom: '-1px',
          })}
        >
          {label}
        </NavLink>
      ))}
    </div>
  )
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const isAdminElevated = useAppStore(s => s.isAdminElevated)
  const hasPinSet = useAppStore(s => s.hasPinSet)
  const checkHasPin = useAppStore(s => s.checkHasPin)
  const navigate = useNavigate()
  const [elevated, setElevated] = useState(isAdminElevated())

  useEffect(() => {
    if (hasPinSet === null) checkHasPin()
  }, [])

  // Keep local elevated state in sync (for when session expires)
  useEffect(() => {
    const id = setInterval(() => setElevated(isAdminElevated()), 5_000)
    return () => clearInterval(id)
  }, [isAdminElevated])

  if (hasPinSet === null) {
    // Still loading — blank while checking
    return null
  }

  if (!elevated) {
    return (
      <PinEntryModal
        mode={hasPinSet ? 'verify' : 'setup'}
        onSuccess={() => setElevated(true)}
        onCancel={() => navigate('/jobs')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AdminBanner />
      <AdminSubNav />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
