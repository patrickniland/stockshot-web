// StockShot — Camera Barcode Scanner
// Uses ZXing for barcode detection with direct getUserMedia stream management

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

interface Props {
  onScan: (value: string) => void
  onClose: () => void
}

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        // Request permission first
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        tempStream.getTracks().forEach(t => t.stop())

        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(d => d.kind === 'videoinput')
        setCameras(videoDevices)

        const rear = videoDevices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        )
        setSelectedCamera(rear?.deviceId || videoDevices[0]?.deviceId || '')
      } catch {
        setError('Camera permission denied. Please allow camera access and try again.')
      }
    }
    init()
    return () => stopAll()
  }, [])

  useEffect(() => {
    if (!selectedCamera) return
    startCamera(selectedCamera)
    return () => stopAll()
  }, [selectedCamera])

  async function startCamera(deviceId: string) {
    stopAll()
    setError(null)
    setReady(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, facingMode: 'environment' }
      })
      streamRef.current = stream

      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      setReady(true)

      // Start ZXing decoding on the stream directly
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result, err) => {
          if (result) {
            onScan(result.getText())
            stopAll()
            onClose()
          }
        }
      )
      controlsRef.current = controls
    } catch (e: any) {
      setError(`Could not start camera: ${e.message || 'Unknown error'}`)
    }
  }

  function stopAll() {
    try { controlsRef.current?.stop() } catch {}
    controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: '480px', marginBottom: '12px' }}>
        <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, flex: 1 }}>
          📷 Point camera at barcode
        </span>
        <button onClick={() => { stopAll(); onClose() }} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
          borderRadius: '6px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
        }}>
          Close
        </button>
      </div>

      {cameras.length > 1 && (
        <select value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)}
          style={{ marginBottom: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '12px', width: '100%', maxWidth: '480px' }}>
          {cameras.map(c => (
            <option key={c.deviceId} value={c.deviceId}>
              {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}

      <div style={{
        position: 'relative', width: '100%', maxWidth: '480px',
        borderRadius: '12px', overflow: 'hidden', background: '#111',
        minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <video ref={videoRef} muted playsInline autoPlay
          style={{ width: '100%', display: 'block' }} />

        {!ready && !error && (
          <div style={{ position: 'absolute', color: '#fff', fontSize: '13px', opacity: 0.7 }}>
            Starting camera...
          </div>
        )}

        {ready && (
          <>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                width: '220px', height: '140px',
                border: '2px solid rgba(255,255,255,0.8)',
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              }} />
            </div>
            <style>{`
              @keyframes scan {
                0% { top: 30%; } 50% { top: 65%; } 100% { top: 30%; }
              }
              .scan-line {
                position: absolute;
                left: calc(50% - 110px);
                width: 220px; height: 2px;
                background: #2E7D32;
                animation: scan 1.8s ease-in-out infinite;
                border-radius: 1px;
                box-shadow: 0 0 6px #2E7D32;
              }
            `}</style>
            <div className="scan-line" />
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '12px', background: '#FFEBEE', color: '#B71C1C', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', maxWidth: '480px', width: '100%' }}>
          ⚠ {error}
        </div>
      )}

      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '12px', textAlign: 'center' }}>
        {ready ? 'Scanning automatically — hold barcode steady in the box' : 'Requesting camera access...'}
      </p>
    </div>
  )
}
