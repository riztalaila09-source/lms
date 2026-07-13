import mammoth from 'mammoth/mammoth.browser'

/**
 * Konversi file Word (.docx) menjadi HTML semantik yang kompatibel dengan editor
 * tiptap LMS (heading, tebal/miring, daftar, tabel). Gambar diabaikan (tidak
 * ditanam) agar materi tetap ringan — sesuai pilihan guru.
 */
export async function importDocxToHtml(file: File): Promise<{ html: string; warnings: string[] }> {
  const arrayBuffer = await file.arrayBuffer()
  const res = await mammoth.convertToHtml(
    { arrayBuffer },
    { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) },
  )
  // Buang <img> yang tersisa (src kosong) supaya tidak ada gambar rusak.
  const html = (res.value || '').replace(/<img[^>]*>/gi, '').trim()
  const warnings = (res.messages || []).map((m) => m.message)
  return { html, warnings }
}
