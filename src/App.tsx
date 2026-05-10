// StockShot — App Entry Point with Full Routing

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ImportView from './pages/ImportView'
import ScanInView from './pages/ScanInView'
import ScanOutView from './pages/ScanOutView'
import StockListView from './pages/StockListView'
import ShotListView from './pages/ShotListView'
import PendingView from './pages/PendingView'
import JobsView from './pages/JobsView'
import ReportsView from './pages/ReportsView'
import ClientsView from './pages/ClientsView'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
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
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
