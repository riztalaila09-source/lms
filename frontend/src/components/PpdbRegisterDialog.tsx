import { useEffect, useState } from 'react'
import { Box, Button, Dialog, Field, Flex, Icon, IconButton, Input, NativeSelect, SimpleGrid, Stack, Text, Textarea } from '@chakra-ui/react'
import { LuUserPlus, LuPlus, LuX, LuCircleCheck, LuPhone, LuExternalLink, LuFileText, LuUpload, LuLink, LuSend } from 'react-icons/lu'
import { ConnectError } from '@connectrpc/connect'
import { schoolClient } from '@/lib/client'
import { PPDB_JURUSAN } from '@/lib/ppdb'
import { fileToDataUrlRaw } from '@/lib/image'
import { COLORS, UDEMY } from '@/theme/tokens'

const errMsg = (e: unknown) => (e instanceof ConnectError ? e.rawMessage : e instanceof Error ? e.message : 'Terjadi kesalahan')
const EMPTY = { nama: '', tempatLahir: '', tanggalLahir: '', jenisKelamin: '', asalSekolah: '', jurusan: '', namaOrtu: '', alamat: '', email: '', nisn: '', noKk: '' }
const DEFAULT_PHONES = [{ label: 'No. Calon Murid', number: '' }, { label: 'No. Orang Tua', number: '' }]

export interface PpdbBatchInfo { driveLink?: string; panduan?: string; requiredDocs?: string[] }

/** Public PPDB admission form for prospective students (no login required). */
export default function PpdbRegisterDialog({ open, onClose, batch }: { open: boolean; onClose: () => void; batch?: PpdbBatchInfo }) {
  const [f, setF] = useState(EMPTY)
  const [phones, setPhones] = useState(DEFAULT_PHONES)
  const [saving, setSaving] = useState(false)
  const [no, setNo] = useState('')
  const [regId, setRegId] = useState('')
  const [err, setErr] = useState('')
  const done = !!no
  // documents (success screen): Drive link + uploaded files
  const [docLink, setDocLink] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [docBusy, setDocBusy] = useState(false)
  const [docMsg, setDocMsg] = useState('')
  const [docErr, setDocErr] = useState('')

  useEffect(() => { if (open) { setF(EMPTY); setPhones(DEFAULT_PHONES); setNo(''); setRegId(''); setErr(''); setDocLink(''); setFiles([]); setDocMsg(''); setDocErr('') } }, [open])

  const upd = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }))
  const setPhone = (i: number, patch: Partial<{ label: string; number: string }>) =>
    setPhones((arr) => arr.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const submit = async () => {
    if (!f.nama.trim()) { setErr('Nama calon murid wajib diisi.'); return }
    if (!f.jurusan) { setErr('Pilih jurusan yang diminati.'); return }
    setSaving(true); setErr('')
    try {
      const res = await schoolClient.submitPpdbRegistration({ ...f, phones: phones.filter((p) => p.number.trim()) })
      setNo(res.noPendaftaran || '-'); setRegId(res.id)
    } catch (e) { setErr(errMsg(e)) }
    finally { setSaving(false) }
  }

  const kirimDokumen = async () => {
    if (!docLink.trim() && files.length === 0) { setDocErr('Tempel link dokumen atau pilih file dulu.'); return }
    setDocBusy(true); setDocErr(''); setDocMsg('')
    try {
      const payload = await Promise.all(files.map(async (file) => ({ name: file.name, data: await fileToDataUrlRaw(file, 4 * 1024 * 1024) })))
      const res = await schoolClient.submitPpdbDocuments({ registrationId: regId, docLink: docLink.trim(), files: payload })
      setDocMsg(`Berhasil dikirim${res.uploaded ? ` (${res.uploaded} file terunggah)` : ''}. Terima kasih!`)
      setFiles([])
    } catch (e) { setDocErr(errMsg(e)) }
    finally { setDocBusy(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside" size="full"
      closeOnInteractOutside={!done} closeOnEscape={!done}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title><Icon as={LuUserPlus} color={UDEMY.accent} /> Formulir Pendaftaran PPDB</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            {done ? (
              <Stack gap="12px" py="10px" maxW="760px" mx="auto" w="full">
                <Stack gap="6px" textAlign="center" align="center">
                  <Icon as={LuCircleCheck} boxSize="56px" color={COLORS.success} />
                  <Text fontSize="20px" fontWeight="800">Pendaftaran Terkirim!</Text>
                </Stack>
                <Box bg={UDEMY.accentTint} border="1px solid" borderColor={UDEMY.accent} borderRadius="12px" p="14px" textAlign="center">
                  <Text fontSize="12px" color={COLORS.muted}>Nomor Pendaftaran Anda</Text>
                  <Text fontSize="26px" fontWeight="900" letterSpacing="2px" color={UDEMY.accent}>{no}</Text>
                  <Text fontSize="12px" color={COLORS.muted} mt="4px">Simpan/foto nomor ini. Password ujian dibagikan panitia saat jadwal ujian.</Text>
                </Box>
                <Box>
                  <Text fontSize="13px" fontWeight="700" mb="6px"><Icon as={LuFileText} /> Langkah berikutnya — unggah dokumen</Text>
                  {(batch?.requiredDocs?.length ?? 0) > 0 && (
                    <Stack gap="2px" mb="8px">
                      {batch!.requiredDocs!.map((d, i) => <Text key={i} fontSize="13px" color={COLORS.text}>• {d}</Text>)}
                    </Stack>
                  )}
                  {batch?.panduan && <Text fontSize="12px" color={COLORS.muted} whiteSpace="pre-wrap" mb="8px">{batch.panduan}</Text>}
                  {batch?.driveLink && (
                    <Button as="a" size="sm" bg={UDEMY.accent} color="white" _hover={{ bg: UDEMY.accentDark }} {...{ href: batch.driveLink, target: '_blank', rel: 'noopener' }}>
                      <Icon as={LuExternalLink} /> Buka Google Drive Sekolah
                    </Button>
                  )}
                </Box>

                <Box bg={COLORS.surface} border="1px solid" borderColor={UDEMY.accent} borderRadius="12px" p="16px">
                  <Text fontSize="14px" fontWeight="800" mb="4px"><Icon as={LuSend} color={UDEMY.accent} /> Kirim Dokumen Anda</Text>
                  <Text fontSize="12px" color={COLORS.muted} mb="10px">
                    Setelah dokumen diunggah ke Google Drive Anda, salin link folder-nya dan tempel di bawah, ATAU langsung unggah file di sini. Cara mendapatkan link:
                    buka folder Drive → klik kanan → <b>Bagikan</b> → ubah akses ke <b>“Siapa saja yang memiliki link”</b> → <b>Salin link</b>.
                  </Text>
                  <Field.Root mb="10px">
                    <Field.Label fontSize="12px"><Icon as={LuLink} /> Link Google Drive Dokumen</Field.Label>
                    <Input value={docLink} onChange={(e) => setDocLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
                  </Field.Root>
                  <Flex align="center" gap="8px" mb="8px" wrap="wrap">
                    <Button as="label" size="sm" variant="outline" cursor="pointer"><Icon as={LuUpload} /> Pilih File (gambar/PDF)
                      <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.currentTarget.value = '' }} />
                    </Button>
                    <Text fontSize="11px" color={COLORS.muted}>maks 4MB / file</Text>
                  </Flex>
                  {files.length > 0 && (
                    <Stack gap="4px" mb="8px">
                      {files.map((file, i) => (
                        <Flex key={i} align="center" gap="8px" fontSize="12px">
                          <Icon as={LuFileText} color={UDEMY.accent} /><Text flex="1" lineClamp={1}>{file.name}</Text>
                          <IconButton aria-label="hapus" size="2xs" variant="ghost" colorPalette="red" onClick={() => setFiles((a) => a.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton>
                        </Flex>
                      ))}
                    </Stack>
                  )}
                  {docErr && <Text color={COLORS.danger} fontSize="12px" mb="6px">{docErr}</Text>}
                  {docMsg && <Text color={COLORS.success} fontSize="13px" fontWeight="600" mb="6px">{docMsg}</Text>}
                  <Button size="sm" loading={docBusy} onClick={kirimDokumen} bg={UDEMY.accent} color="white" _hover={{ bg: UDEMY.accentDark }}>
                    <Icon as={LuSend} /> Kirim Dokumen
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Stack gap="14px" maxW="760px" mx="auto" w="full">
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
                  <Field.Root required><Field.Label>Nama Calon Murid</Field.Label>
                    <Input value={f.nama} onChange={(e) => upd('nama', e.target.value)} placeholder="Nama lengkap" /></Field.Root>
                  <Field.Root><Field.Label>Asal Sekolah</Field.Label>
                    <Input value={f.asalSekolah} onChange={(e) => upd('asalSekolah', e.target.value)} placeholder="mis. SMP Negeri 1" /></Field.Root>
                  <Field.Root><Field.Label>Tempat Lahir</Field.Label>
                    <Input value={f.tempatLahir} onChange={(e) => upd('tempatLahir', e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label>Tanggal Lahir</Field.Label>
                    <Input type="date" value={f.tanggalLahir} onChange={(e) => upd('tanggalLahir', e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label>Jenis Kelamin</Field.Label>
                    <NativeSelect.Root><NativeSelect.Field value={f.jenisKelamin} onChange={(e) => upd('jenisKelamin', e.target.value)}>
                      <option value="">— Pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                    </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
                  <Field.Root required><Field.Label>Pilihan Jurusan</Field.Label>
                    <NativeSelect.Root><NativeSelect.Field value={f.jurusan} onChange={(e) => upd('jurusan', e.target.value)}>
                      <option value="">— Pilih —</option>{PPDB_JURUSAN.map((j) => <option key={j} value={j}>{j}</option>)}
                    </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
                  </Field.Root>
                  <Field.Root><Field.Label>Nama Orang Tua / Wali</Field.Label>
                    <Input value={f.namaOrtu} onChange={(e) => upd('namaOrtu', e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label>Email</Field.Label>
                    <Input type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} placeholder="opsional" /></Field.Root>
                  <Field.Root><Field.Label>NISN</Field.Label>
                    <Input value={f.nisn} onChange={(e) => upd('nisn', e.target.value)} placeholder="Nomor Induk Siswa Nasional" /></Field.Root>
                  <Field.Root><Field.Label>No. Kartu Keluarga</Field.Label>
                    <Input value={f.noKk} onChange={(e) => upd('noKk', e.target.value)} /></Field.Root>
                </SimpleGrid>
                <Field.Root><Field.Label>Alamat</Field.Label>
                  <Textarea rows={2} value={f.alamat} onChange={(e) => upd('alamat', e.target.value)} placeholder="Alamat domisili" /></Field.Root>

                <Box>
                  <Flex align="center" gap="6px" mb="6px"><Icon as={LuPhone} boxSize="14px" color={UDEMY.accent} /><Text fontSize="13px" fontWeight="700">Nomor Telepon / WhatsApp</Text></Flex>
                  <Stack gap="8px">
                    {phones.map((p, i) => (
                      <Flex key={i} gap="6px" align="center">
                        <Input size="sm" flex="0 0 40%" value={p.label} onChange={(e) => setPhone(i, { label: e.target.value })} placeholder="Label (mis. No. Wali)" />
                        <Input size="sm" flex="1" value={p.number} onChange={(e) => setPhone(i, { number: e.target.value })} placeholder="08…" />
                        <IconButton aria-label="hapus" size="sm" variant="ghost" colorPalette="red" onClick={() => setPhones((arr) => arr.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton>
                      </Flex>
                    ))}
                    <Button size="xs" variant="outline" alignSelf="flex-start" onClick={() => setPhones((arr) => [...arr, { label: 'No. Wali', number: '' }])}>
                      <Icon as={LuPlus} /> Tambah nomor
                    </Button>
                  </Stack>
                </Box>

                {err && <Text color={COLORS.danger} fontSize="13px">{err}</Text>}
              </Stack>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            {done ? (
              <Button onClick={onClose} bg={UDEMY.accent} color="white" _hover={{ bg: UDEMY.accentDark }}>Tutup</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Batal</Button>
                <Button loading={saving} onClick={submit} bg={UDEMY.accent} color="white" _hover={{ bg: UDEMY.accentDark }}>
                  <Icon as={LuUserPlus} /> Kirim Pendaftaran
                </Button>
              </>
            )}
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
