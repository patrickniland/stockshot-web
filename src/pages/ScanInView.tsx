// StockShot — Scan In View (fixed look stepper UX)

import { useState, useRef, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import { ScanFeedback } from '../types'
import CameraScanner from '../components/CameraScanner'

export default function ScanInView() {
  const [scanInput, setScanInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const scanIn = useAppStore(s => s.scanIn)
  const getReceived = useAppStore(s => s.getReceived)
  const getDispatched = useAppStore(s => s.getDispatched)
  const getPending = useAppStore(s => s.getPending)
  const pendingIsMeaningful = useAppStore(s => s.pendingIsMeaningful)
  const lastScanFeedback = useAppStore(s => s.lastScanFeedback)
  const markShotOnScanIn = useAppStore(s => s.markShotOnScanIn)
  const setMarkShotOnScanIn = useAppStore(s => s.setMarkShotOnScanIn)
  const currentIntakeLook = useAppStore(s => s.currentIntakeLook)
  const setCurrentIntakeLook = useAppStore(s => s.setCurrentIntakeLook)
  const bumpLook = useAppStore(s => s.bumpLook)
  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)

  const received = getReceived()
  const dispatched = getDispatched()
  const pending = getPending()
  const meaningful = pendingIsMeaningful()

  const shoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const totalLooks = shoot ? Math.max(...shoot.lookOrder, currentIntakeLook) : currentIntakeLook

  useEffect(() => { inputRef.current?.focus() }, [])

  function triggerScanIn() {
    const sku = scanInput.trim()
    if (!sku) return
    scanIn(sku)
    setScanInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCameraScan(value: string) {
    scanIn(value)
    setShowCamera(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function goBack() {
    if (currentIntakeLook > 1) setCurrentIntakeLook(currentIntakeLook - 1)
  }

  function goForward() {
    if (currentIntakeLook < totalLooks) {
      setCurrentIntakeLook(currentIntakeLook + 1)
    }
  }

  function addNewLook() {
    bumpLook()
  }

  const recentItems = [...received]
    .filter(i => i.receivedAt)
    .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))
    .slice(0, 8)

  const feedbackColor = (fb: ScanFeedback) => {
    switch (fb.type) {
      case 'success': return markShotOnScanIn ? '#7B1FA2' : '#2E7D32'
      case 'notFound': return '#B71C1C'
      case 'alreadyReceived': return '#E65100'
      case 'alreadyDispatched': return '#1565C0'
      case 'notYetReceived': return '#E65100'
    }
  }

  const feedbackIcon = (fb: ScanFeedback) => {
    switch (fb.type) {
      case 'success': return markShotOnScanIn ? '📷' : '✓'
      case 'notFound': return '?'
      case 'alreadyReceived': return '↺'
      case 'alreadyDispatched': return '📦'
      case 'notYetReceived': return '⏱'
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '640px' }}>

      {/* Status banner */}
      <div style={{ display: 'flex', background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', marginBottom: '1rem', overflow: 'hidden' }}>
        {meaningful && (
          <>
            <StatPill value={pending.length} label="Pending" color="#E65100" />
            <div style={{ width: '1px', background: '#E0E0E0' }} />
          </>
        )}
        <StatPill value={received.length} label="Received" color="#2E7D32" />
        <div style={{ width: '1px', background: '#E0E0E0' }} />
        <StatPill value={dispatched.length} label="Dispatched" color="#1565C0" />
      </div>

      {/* Scan card */}
      <div
        style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem', border: `1.5px solid ${markShotOnScanIn ? '#7B1FA2' : '#E0E0E0'}` }}
        onClick={() => inputRef.current?.focus()}
      >
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111', textAlign: 'center', marginBottom: '16px' }}>Scan In</p>

        {/* Look stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          {/* Back */}
          <button
            onClick={e => { e.stopPropagation(); goBack() }}
            disabled={currentIntakeLook <= 1}
            style={{
              width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E0E0E0',
              background: currentIntakeLook > 1 ? '#F5F5F5' : '#FAFAFA',
              color: currentIntakeLook > 1 ? '#7B1FA2' : '#ccc',
              fontSize: '18px', cursor: currentIntakeLook > 1 ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            ‹
          </button>

          {/* Look indicator */}
          <div style={{ flex: 1, textAlign: 'center', background: '#7B1FA2', color: '#fff', padding: '6px 12px', borderRadius: '7px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Look {currentIntakeLook}</span>
            <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '6px' }}>of {totalLooks}</span>
          </div>

          {/* Forward — only if more looks exist */}
          <button
            onClick={e => { e.stopPropagation(); goForward() }}
            disabled={currentIntakeLook >= totalLooks}
            style={{
              width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #E0E0E0',
              background: currentIntakeLook < totalLooks ? '#F5F5F5' : '#FAFAFA',
              color: currentIntakeLook < totalLooks ? '#7B1FA2' : '#ccc',
              fontSize: '18px', cursor: currentIntakeLook < totalLooks ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            ›
          </button>

          {/* New look — always visible, separate */}
          <button
            onClick={e => { e.stopPropagation(); addNewLook() }}
            style={{
              background: '#EDE9FE', color: '#7B1FA2', border: 'none',
              padding: '6px 12px', borderRadius: '7px', fontSize: '12px',
              cursor: 'pointer', fontWeight: 600, flexShrink: 0,
            }}>
            + New Look
          </button>
        </div>

        {/* Mark as shot toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}
          onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={markShotOnScanIn} onChange={e => setMarkShotOnScanIn(e.target.checked)} />
          <span style={{ fontSize: '12px', color: markShotOnScanIn ? '#7B1FA2' : '#444', fontWeight: markShotOnScanIn ? 600 : 400 }}>
            📷 Mark as Shot on scan-in
          </span>
          {markShotOnScanIn && <span style={{ fontSize: '11px', color: '#7B1FA2' }}>· Received + Shot</span>}
        </label>

        <hr style={{ border: 'none', borderTop: '1px solid #F0F0F0', marginBottom: '16px' }} />

        <input
          ref={inputRef}
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && triggerScanIn()}
          onClick={e => e.stopPropagation()}
          placeholder="Scan or type SKU..."
          style={{
            width: '100%', padding: '12px', fontSize: '18px', fontFamily: 'monospace',
            textAlign: 'center', border: '1px solid #E0E0E0', borderRadius: '8px',
            boxSizing: 'border-box', marginBottom: '12px', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={e => { e.stopPropagation(); triggerScanIn() }} disabled={!scanInput.trim()} style={{
            flex: 1, padding: '10px', fontSize: '14px', fontWeight: 600,
            background: !scanInput.trim() ? '#E0E0E0' : markShotOnScanIn ? '#7B1FA2' : '#2E7D32',
            color: !scanInput.trim() ? '#999' : '#fff',
            border: 'none', borderRadius: '8px', cursor: scanInput.trim() ? 'pointer' : 'default',
          }}>
            ✓ Mark Received
          </button>
          <button onClick={e => { e.stopPropagation(); setShowCamera(true) }} style={{
            padding: '10px 16px', background: '#1565C0', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#fff',
          }}>
            📷 Camera
          </button>
          <button onClick={e => { e.stopPropagation(); setScanInput('') }} style={{
            padding: '10px 16px', background: '#F5F5F5', border: 'none',
            borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444',
          }}>
            Clear
          </button>
        </div>
      </div>

      {/* Feedback */}
      {lastScanFeedback && (
        <div style={{
          background: feedbackColor(lastScanFeedback), borderRadius: '10px',
          padding: '14px 16px', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px', color: '#fff' }}>{feedbackIcon(lastScanFeedback)}</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{lastScanFeedback.message}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'monospace' }}>{lastScanFeedback.scannedValue}</div>
          </div>
        </div>
      )}

      {/* Recent scans */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: '#F5F5F5', fontSize: '12px', fontWeight: 600, color: '#666' }}>
          Recent scans
        </div>
        {recentItems.length === 0 ? (
          <p style={{ padding: '14px', fontSize: '12px', color: '#888' }}>No items scanned in yet.</p>
        ) : recentItems.map((item, i) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: i % 2 === 0 ? '#fff' : '#F9F9F9' }}>
            <span style={{ color: item.shotStatus === 'shot' ? '#7B1FA2' : '#2E7D32', fontSize: '14px' }}>
              {item.shotStatus === 'shot' ? '📷' : '✓'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>{item.styleNumber}</div>
              {item.description && <div style={{ fontSize: '10px', color: '#888' }}>{item.description}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end', marginBottom: '2px' }}>
                {item.looks.map(l => (
                  <span key={l} style={{ fontSize: '9px', fontWeight: 700, background: '#EDE9FE', color: '#7B1FA2', padding: '1px 4px', borderRadius: '3px' }}>L{l}</span>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCamera && (
        <CameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
      )}
    </div>
  )
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: '26px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
    </div>
  )
}
