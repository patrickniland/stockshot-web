// StockShot — Admin route guard + layout shell

import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import PinEntryModal from './PinEntryModal'

const ADMIN_NAV = [
  { to: '/admin/clients',   label: 'Clients' },
  { to: '/admin/operators', label: 'Operators' },
  { to: '/admin/bulk',      label: 'Bulk Status Change' },
  { to: '/admin/trash',     label: 'Trash' },
  { to: '/admin/settings',  label: 'Settings' },
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
    <div className="bg-[var(--color-brand)] text-neutral-400 text-[11px] px-4 py-1.5 flex items-center gap-3 border-b border-neutral-800">
      <span>Admin mode — {minsLeft} min remaining</span>
      <div className="flex-1" />
      <button
        onClick={handleLock}
        className="bg-transparent border border-neutral-600 rounded-md text-neutral-400 text-[11px] px-2.5 py-1 cursor-pointer hover:border-neutral-400 transition-colors"
      >
        Lock now
      </button>
    </div>
  )
}

function AdminSubNav() {
  return (
    <div className="bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] px-6 flex gap-0.5">
      {ADMIN_NAV.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `px-3.5 py-2.5 text-[13px] no-underline border-b-2 -mb-px transition-colors ${
              isActive
                ? 'font-semibold text-[var(--color-brand)] border-[var(--color-brand)]'
                : 'font-normal text-neutral-400 border-transparent'
            }`
          }
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
    <div className="flex flex-col h-full">
      <AdminBanner />
      <AdminSubNav />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
