// StockShot — App Entry with Auth + Nav-based Auto Sync

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getOrCreateOrg, signOut } from './lib/auth'
import { useSupabaseSync, pushDirty } from './hooks/useSupabaseSync'
import useAppStore from './store/useAppStore'
import Layout from './components/Layout'
import LoginView from './pages/LoginView'
import ImportView from './pages/ImportView'
import ScanInView from './pages/ScanInView'
import ScanOutView from './pages/ScanOutView'
import StockListView from './pages/StockListView'
import ShotListView from './pages/ShotListView'
import PendingView from './pages/PendingView'
import JobsView from './pages/JobsView'
import ReportsView from './pages/ReportsView'
import ClientsView from './pages/ClientsView'
import ManagementView from './pages/ManagementView'
import { Session } from '@supabase/supabase-js'

function AppWithSync({ session }: { session: Session }) {
  const orgId = useAppStore(s => s.orgId)
  const setOrgId = useAppStore(s => s.setOrgId)
  const migrateLocations = useAppStore(s => s.migrateLocations)
  useSupabaseSync(orgId)

  useEffect(() => { migrateLocations() }, [])

  useEffect(() => {
    async function initOrg() {
      try {
        const id = await getOrCreateOrg(
          session.user.id,
          session.user.user_metadata?.full_name
            ? `${session.user.user_metadata.full_name}'s Studio`
            : 'My Studio'
        )
        setOrgId(id)
      } catch (e) {
        console.error('Failed to init org:', e)
      }
    }
    initOrg()
  }, [session.user.id])

  // Best-effort push of dirty items on tab close
  useEffect(() => {
    function handleBeforeUnload() {
      const { dirtyItemIds } = useAppStore.getState()
      if (dirtyItemIds.length > 0) {
        pushDirty().catch(() => {/* best-effort */})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return (
    <BrowserRouter>
      <Layout session={session} onSignOut={signOut}>
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/import" element={<ImportView />} />
          <Route path="/jobs" element={<JobsView />} />
          <Route path="/scan-in" element={<ScanInView />} />
          <Route path="/stock" element={<StockListView />} />
          <Route path="/shot-list" element={<ShotListView />} />
          <Route path="/scan-out" element={<ScanOutView />} />
          <Route path="/pending" element={<PendingView />} />
          <Route path="/dashboard" element={<ReportsView />} />
          <Route path="/clients" element={<ClientsView />} />
          <Route path="/management" element={<ManagementView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const resetStore = useAppStore(s => s.resetStore)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') resetStore()
      setSession(session)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F5' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📷</div>
        <p style={{ fontSize: '14px', color: '#888' }}>Loading StockShot...</p>
      </div>
    </div>
  )

  if (!session) return <LoginView />
  return <AppWithSync session={session} />
}
