/** QR code as a PNG data URL. The `qrcode` library is lazy-loaded so it stays out of the main bundle. */
export async function qrDataUrl(text: string, width = 640): Promise<string> {
  const QR = await import('qrcode');
  return QR.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b2a5bff', light: '#ffffffff' } });
}
