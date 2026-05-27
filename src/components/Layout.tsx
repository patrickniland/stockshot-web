// StockShot — Layout with Sidebar Navigation

import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { Session } from '@supabase/supabase-js'

const NAV = [
  { to: '/import',    icon: '⬇', label: 'Import Stock' },
  { to: '/jobs',      icon: '📁', label: 'Shoots' },
  { to: '/scan-in',   icon: '📷', label: 'Scan In' },
  { to: '/stock',     icon: '📋', label: 'Stock List' },
  { to: '/shot-list', icon: '🎬', label: 'Shot List' },
  { to: '/scan-out',  icon: '📦', label: 'Scan Out' },
  { to: '/pending',   icon: '⚠', label: 'Missing' },
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/admin',     icon: '⚙', label: 'Admin' },
]

function formatAgo(ts: string | null): string {
  if (!ts) return ''
  const secs = (Date.now() - new Date(ts).getTime()) / 1000
  if (secs < 10) return 'just now'
  if (secs < 60) return `${Math.round(secs)}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`
  return `${Math.round(secs / 3600)}h ago`
}

function SyncIndicator() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const lastSyncedAt = useAppStore(s => s.lastSyncedAt)
  const [, tick] = useState(0)

  // Refresh "X ago" display every 30s
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  let text = ''
  let color = '#555'

  if (syncStatus === 'syncing') {
    text = 'Syncing…'
    color = '#7BB8F0'
  } else if (syncStatus === 'error') {
    text = 'Sync failed — retrying'
    color = '#ff6b6b'
  } else if (lastSyncedAt) {
    text = `Synced ${formatAgo(lastSyncedAt)}`
    color = '#555'
  }

  if (!text) return null

  return (
    <div style={{ padding: '4px 12px 8px', fontSize: '10px', color, textAlign: 'center' }}>
      {text}
    </div>
  )
}

function useAdminSessionWatchdog() {
  const adminSessionExpiresAt = useAppStore(s => s.adminSessionExpiresAt)
  const lockAdminNow = useAppStore(s => s.lockAdminNow)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const id = setInterval(() => {
      if (adminSessionExpiresAt && adminSessionExpiresAt <= Date.now()) {
        lockAdminNow()
        if (location.pathname.startsWith('/admin')) {
          navigate('/admin', { replace: true })
        }
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [adminSessionExpiresAt, lockAdminNow, navigate, location.pathname])
}

export default function Layout({ children, session, onSignOut }: {
  children: React.ReactNode
  session?: Session | null
  onSignOut?: () => void
}) {
  useAdminSessionWatchdog()
  const getActiveShoot = useAppStore(s => s.getActiveShoot)
  const getStudioQueue = useAppStore(s => s.getStudioQueue)
  const getPending = useAppStore(s => s.getPending)
  const pendingIsMeaningful = useAppStore(s => s.pendingIsMeaningful)
  const savedShoots = useAppStore(s => s.savedShoots)

  const activeShoot = getActiveShoot()
  const studioQueueCount = getStudioQueue().length
  const pendingCount = getPending().length
  const meaningful = pendingIsMeaningful()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: '210px',
        flexShrink: 0,
        background: '#1C1C1E',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}>
        {/* Brand */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '0.5px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', width: '30px', height: '30px', flexShrink: 0 }}>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>E</span>
              </div>
              <div style={{ flex: 1, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#000', fontSize: '11px', fontWeight: 700 }}>R</span>
              </div>
            </div>
            <span style={{ color: '#fff', fontSize: '17px', fontWeight: 700 }}>StockShot</span>
          </div>
          <div style={{ color: '#555', fontSize: '9px', letterSpacing: '1.2px', fontWeight: 500 }}>
            BY ENHANCE RETAIL
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV.map(({ to, icon, label }) => {
            const badge =
              label === 'Shot List' && studioQueueCount > 0 ? studioQueueCount :
              label === 'Missing' && meaningful && pendingCount > 0 ? pendingCount :
              label === 'Shoots' && savedShoots.length > 1 ? savedShoots.length :
              null

            return (
              <NavLink
                key={to}
                to={to}
                end={to !== '/admin'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  margin: '1px 8px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  background: isActive ? '#fff' : 'transparent',
                  color: isActive ? '#1C1C1E' : '#aaa',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 0.15s',
                })}
              >
                <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {badge !== null && (
                  <span style={{
                    background: label === 'Shot List' ? '#7B1FA2' : '#E65100',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '99px',
                    minWidth: '18px',
                    textAlign: 'center',
                  }}>
                    {badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Sync indicator */}
        <SyncIndicator />

        {/* Active shoot strip */}
        {activeShoot && (
          <NavLink to="/jobs" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 12px',
            background: '#E3F2FD22',
            borderTop: '0.5px solid #333',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '10px' }}>📁</span>
            <span style={{ fontSize: '11px', color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeShoot.name}
            </span>
            <span style={{ fontSize: '10px', color: '#555' }}>›</span>
          </NavLink>
        )}

        {/* User strip */}
        {session && (
          <div style={{ padding: '8px 12px', borderTop: '0.5px solid #333', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {session.user.user_metadata?.avatar_url && (
              <img src={session.user.user_metadata.avatar_url} style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0 }} alt="" />
            )}
            <span style={{ fontSize: '10px', color: '#666', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.user.user_metadata?.full_name || session.user.email}
            </span>
            <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '12px', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}
              title="Sign out">
              ↪
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#F5F5F5' }}>
        {children}
      </div>
    </div>
  )
}
