// The four majors offered via PPDB at SMK Islam 2 Wlingi.
export const PPDB_JURUSAN = ['TKJ', 'TKR', 'TPM', 'TSM'] as const
export type PpdbJurusan = (typeof PPDB_JURUSAN)[number]

export const PPDB_STATUS: Record<string, { label: string; color: string }> = {
  baru: { label: 'Baru', color: 'blue' },
  diterima: { label: 'Diterima', color: 'green' },
  ditolak: { label: 'Ditolak', color: 'red' },
}
