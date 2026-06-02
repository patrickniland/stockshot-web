import { useState, useEffect } from 'react'
import { version } from '../../package.json'
import { syncNow } from '../hooks/useSupabaseSync'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  DownloadSimple,
  FolderOpen,
  Barcode,
  ClipboardText,
  FilmSlate,
  Package,
  Warning,
  ChartBar,
  SlidersHorizontal,
  SignOut,
  User,
} from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { Session } from '@supabase/supabase-js'
import { useMediaQuery } from '../hooks/useMediaQuery'

const NAV = [
  { to: '/import',    Icon: DownloadSimple,     label: 'Import Stock' },
  { to: '/jobs',      Icon: FolderOpen,          label: 'Shoots' },
  { to: '/scan-in',   Icon: Barcode,             label: 'Scan In' },
  { to: '/stock',     Icon: ClipboardText,       label: 'Stock List' },
  { to: '/shot-list', Icon: FilmSlate,           label: 'Shot List' },
  { to: '/scan-out',  Icon: Package,             label: 'Scan Out' },
  { to: '/pending',   Icon: Warning,             label: 'Missing' },
  { to: '/dashboard', Icon: ChartBar,            label: 'Dashboard' },
  { to: '/admin',     Icon: SlidersHorizontal,   label: 'Admin' },
]

const PHONE_TABS = [
  { to: '/scan-in',  Icon: Barcode,      label: 'Scan In' },
  { to: '/scan-out', Icon: Package,      label: 'Scan Out' },
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

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const isSyncing = syncStatus === 'syncing'

  let text = ''
  let dotClass = 'bg-slate-500'
  let textClass = 'text-slate-500'
  let tooltip = 'Sync now'

  if (isSyncing) {
    text = 'Syncing…'
    dotClass = 'bg-blue-400'
    textClass = 'text-blue-400'
    tooltip = 'Syncing…'
  } else if (syncStatus === 'error') {
    text = 'Sync failed — retry'
    dotClass = 'bg-[var(--color-danger)]'
    textClass = 'text-[var(--color-danger)]'
    tooltip = 'Retry sync'
  } else if (lastSyncedAt) {
    text = `Synced ${formatAgo(lastSyncedAt)}`
  }

  if (!text) return null

  return (
    <button
      onClick={() => syncNow()}
      disabled={isSyncing}
      title={tooltip}
      className="w-full bg-transparent border-none cursor-pointer disabled:cursor-default group px-2 py-1.5 min-h-[32px]"
    >
      <div className={`block lg:hidden w-2 h-2 rounded-full mx-auto ${dotClass} group-hover:opacity-70 transition-opacity`} />
      <div className={`hidden lg:block text-[10px] text-center ${textClass} group-hover:underline`}>
        {text}
      </div>
    </button>
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

  const isPhone = useMediaQuery('(max-width: 767px)')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (isPhone && location.pathname !== '/scan-in' && location.pathname !== '/scan-out') {
      navigate('/scan-in', { replace: true })
    }
  }, [isPhone, location.pathname, navigate])

  return (
    <div className="flex h-screen overflow-hidden">

      {/* Sidebar — hidden on phone, icon rail on iPad, full labels on desktop */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-16 lg:w-[210px] bg-[var(--color-brand)] h-screen">

        {/* Brand */}
        <div className="px-3 lg:px-4 py-4 lg:py-[18px] border-b border-white/10">
          <div className="flex justify-center lg:justify-start items-center gap-[10px] lg:mb-2">
            <div className="flex w-[30px] h-[30px] flex-shrink-0">
              <div className="flex-1 bg-black flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">E</span>
              </div>
              <div className="flex-1 bg-white flex items-center justify-center">
                <span className="text-black text-[11px] font-bold">R</span>
              </div>
            </div>
            <span className="hidden lg:block text-white text-[17px] font-bold">StockShot</span>
          </div>
          <div className="hidden lg:flex items-center justify-between text-[9px] tracking-[1.2px] font-medium">
            <span className="text-slate-500">BY ENHANCE RETAIL</span>
            <span className="text-slate-600 font-mono">v{version}</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map(({ to, Icon, label }) => {
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
                title={label}
                onClick={(e) => {
                  if (location.pathname === to || (to === '/admin' && location.pathname.startsWith('/admin'))) {
                    e.preventDefault()
                    syncNow()
                  }
                }}
                className={({ isActive }) =>
                  [
                    'flex items-center justify-center lg:justify-start gap-[10px]',
                    'py-2 px-2 lg:px-3 mx-1 lg:mx-2 my-0.5',
                    'rounded-[var(--radius-md)] no-underline text-[var(--text-sm)] transition-colors',
                    isActive
                      ? 'bg-white text-[var(--color-brand)] font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/10',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={20} weight={isActive ? 'fill' : 'bold'} className="flex-shrink-0" />
                    <span className="hidden lg:block flex-1">{label}</span>
                    {badge !== null && (
                      <span className={[
                        'hidden lg:flex items-center justify-center',
                        'text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px]',
                        label === 'Shot List' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-warning)]',
                      ].join(' ')}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Sync indicator */}
        <SyncIndicator />

        {/* Active shoot strip */}
        {activeShoot && (
          <NavLink
            to="/jobs"
            title={activeShoot.name}
            className="flex items-center justify-center lg:justify-start gap-[6px] px-2 lg:px-3 py-2.5 bg-blue-50/5 border-t border-white/10 no-underline"
          >
            <FolderOpen size={14} className="flex-shrink-0 text-slate-400" />
            <span className="hidden lg:block text-[11px] text-slate-400 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {activeShoot.name}
            </span>
            <span className="hidden lg:block text-[10px] text-slate-600">›</span>
          </NavLink>
        )}

        {/* User strip */}
        {session && (
          <div className="flex items-center justify-center lg:justify-start gap-2 px-2 lg:px-3 py-2 border-t border-white/10">
            {session.user.user_metadata?.avatar_url ? (
              <img
                src={session.user.user_metadata.avatar_url}
                className="w-[22px] h-[22px] rounded-full flex-shrink-0"
                alt=""
              />
            ) : (
              <User size={18} className="text-slate-400 flex-shrink-0" />
            )}
            <span className="hidden lg:block text-[10px] text-slate-500 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {session.user.user_metadata?.full_name || session.user.email}
            </span>
            <button
              onClick={onSignOut}
              title="Sign out"
              className="text-slate-500 hover:text-white bg-transparent border-none p-1 rounded cursor-pointer flex-shrink-0"
            >
              <SignOut size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[var(--color-surface-muted)] pb-20 md:pb-0">
        {children}
      </main>

      {/* Bottom tab bar — phone only */}
      <nav className="flex md:hidden fixed inset-x-0 bottom-0 pb-safe border-t border-[var(--color-border)] bg-white z-50">
        {PHONE_TABS.map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex-1 flex flex-col items-center justify-center gap-1 py-3',
                'touch-target no-underline text-[var(--text-xs)]',
                isActive
                  ? 'text-[var(--color-brand)] bg-slate-50'
                  : 'text-slate-500',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={24} weight={isActive ? 'fill' : 'bold'} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
