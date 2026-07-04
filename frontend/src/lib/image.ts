// Read an image file and return a downscaled data URL (base64) so it stays
// small enough to store in the database / embed in HTML content.
export function fileToDataUrl(file: File, maxW = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(reader.result as string) // fallback: original
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        // PNG keeps transparency; otherwise JPEG is much smaller.
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        resolve(canvas.toDataURL(type, quality))
      }
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}
