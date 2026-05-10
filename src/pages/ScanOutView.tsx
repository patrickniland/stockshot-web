// StockShot — Scan Out View

import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import { ScanFeedback } from '../types'
import CameraScanner from '../components/CameraScanner'

export default function ScanOutView() {
  const [scanInput, setScanInput] = useState('')
  const [dispatchTo, setDispatchTo] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const scanOut = useAppStore(s => s.scanOut)
  const getReceived = useAppStore(s => s.getReceived)
  const getDispatched = useAppStore(s => s.getDispatched)
  const getPending = useAppStore(s => s.getPending)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)

  const received = getReceived()
  const dispatched = getDispatched()
  const pending = getPending()

  useEffect(() => { inputRef.current?.focus() }, [])

  function triggerScanOut() {
    const sku = scanInput.trim()
    const to = dispatchTo.trim()
    if (!sku || !to) return
    scanOut(sku, to)
    setScanInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCameraScan(value: string) {
    const to = dispatchTo.trim()
    if (to) {
      scanOut(value, to)
    } else {
      setScanInput(value)
    }
    setShowCamera(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const recentDispatched = [...dispatched]
    .filter(i => i.dispatchedAt)
    .sort((a, b) => (b.dispatchedAt ?? '').localeCompare(a.dispatchedAt ?? ''))
    .slice(0, 8)

  const feedbackColor = (fb: ScanFeedback) => {
    switch (fb.type) {
      case 'success': return '#1565C0'
      case 'notFound': return '#B71C1C'
      case 'alreadyDispatched': return '#1565C0'
      case 'notYetReceived': return '#E65100'
      default: return '#E65100'
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '640px' }}>

      <div style={{ display: 'flex', background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', marginBottom: '1rem', overflow: 'hidden' }}>
        <StatPill value={received.length} label="In Studio" color="#2E7D32" />
        <div style={{ width: '1px', background: '#E0E0E0' }} />
        <StatPill value={dispatched.length} label="Dispatched" color="#1565C0" />
        <div style={{ width: '1px', background: '#E0E0E0' }} />
        <StatPill value={pending.length} label="Outstanding" color="#E65100" />
      </div>

      <div
        style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E0E0E0', padding: '1.5rem', marginBottom: '1rem' }}
        onClick={() => inputRef.current?.focus()}
      >
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111', textAlign: 'center', marginBottom: '16px' }}>Scan Out</p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
            Dispatch to (person / courier)
          </label>
          <input
            value={dispatchTo}
            onChange={e => setDispatchTo(e.target.value)}
            placeholder="Enter name before scanning…"
            style={{ width: '100%', padding: '10px', border: '1px solid #E0E0E0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {dispatchTo.trim() === '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontSize: '11px', color: '#E65100' }}>
            ⚠ Enter a dispatch recipient before scanning
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #F0F0F0', marginBottom: '16px' }} />

        <input
          ref={inputRef}
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && triggerScanOut()}
          placeholder="Scan or type SKU..."
          style={{
            width: '100%', padding: '12px', fontSize: '18px', fontFamily: 'monospace',
            textAlign: 'center', border: '1px solid #E0E0E0', borderRadius: '8px',
            boxSizing: 'border-box', marginBottom: '12px', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={triggerScanOut}
            disabled={!scanInput.trim() || !dispatchTo.trim()}
            style={{
              flex: 1, padding: '10px', fontSize: '14px', fontWeight: 600,
              background: (!scanInput.trim() || !dispatchTo.trim()) ? '#E0E0E0' : '#1565C0',
              color: (!scanInput.trim() || !dispatchTo.trim()) ? '#999' : '#fff',
              border: 'none', borderRadius: '8px',
              cursor: (scanInput.trim() && dispatchTo.trim()) ? 'pointer' : 'default',
            }}
          >
            📦 Dispatch Item
          </button>
          <button onClick={() => setShowCamera(true)} style={{
            padding: '10px 16px', background: '#1565C0', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#fff',
          }}>
            📷 Camera
          </button>
          <button onClick={() => setScanInput('')} style={{
            padding: '10px 16px', background: '#F5F5F5', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444',
          }}>
            Clear
          </button>
        </div>
      </div>

      {lastScanFeedback && (
        <div style={{
          background: feedbackColor(lastScanFeedback), borderRadius: '10px',
          padding: '14px 16px', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px', color: '#fff' }}>📦</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{lastScanFeedback.message}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace' }}>{lastScanFeedback.scannedValue}</div>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: '#F5F5F5', fontSize: '12px', fontWeight: 600, color: '#666' }}>
          Recent dispatches
        </div>
        {recentDispatched.length === 0 ? (
          <p style={{ padding: '14px', fontSize: '12px', color: '#888' }}>No items dispatched yet.</p>
        ) : recentDispatched.map((item, i) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: i % 2 === 0 ? '#fff' : '#F9F9F9' }}>
            <span style={{ color: '#1565C0', fontSize: '14px' }}>📦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{item.styleNumber}</div>
              <div style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>{item.sku}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: '#1565C0' }}>{item.dispatchedTo}</div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                {item.dispatchedAt ? new Date(item.dispatchedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCamera && (
        <CameraScanner
          onScan={handleCameraScan}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: '26px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
    </div>
  )
}
