// StockShot — Inline QR Code Component

import { useEffect, useState } from 'react'
import { generateQRCanvas } from '../lib/qrGenerator'

interface Props {
  value: string
  size?: number
}

export default function QRCode({ value, size = 80 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    generateQRCanvas(value, size * 2).then(setDataUrl)
  }, [value, size])

  if (!dataUrl) return (
    <div style={{ width: size, height: size, background: '#F5F5F5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '10px', color: '#aaa' }}>QR</span>
    </div>
  )

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      style={{ display: 'block', borderRadius: '4px' }}
      alt={`QR: ${value}`}
    />
  )
}
