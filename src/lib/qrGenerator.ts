// StockShot — QR Generator
// Generates QR code data URLs using qrcode library

export async function generateQRDataURL(value: string): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(value, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}
