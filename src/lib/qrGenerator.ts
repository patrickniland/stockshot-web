// StockShot — QR Generator

export async function generateQRDataURL(value: string): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(value, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
}

// Synchronous canvas-based QR for inline display
export async function generateQRCanvas(value: string, size = 120): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(value, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}
