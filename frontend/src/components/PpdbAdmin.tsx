import { useCallback, useEffect, useState } from 'react'
import {
  Badge, Box, Button, Checkbox, Dialog, Field, Flex, Icon, IconButton, Image, Input, NativeSelect, SimpleGrid, Stack, Switch, Table, Tabs, Text, Textarea,
} from '@chakra-ui/react'
import {
  LuPlus, LuTrash2, LuDownload, LuPrinter, LuEye, LuRefreshCw, LuSave, LuStar, LuUpload, LuLayers, LuClipboardList, LuUsers, LuX, LuExternalLink, LuCheck, LuBan,
} from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { schoolClient } from '@/lib/client'
import type { School } from '@/gen/school/v1/school_pb'
import { PPDB_JURUSAN, PPDB_STATUS } from '@/lib/ppdb'
import { fileToDataUrl } from '@/lib/image'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import RowActionsMenu from '@/components/RowActionsMenu'
import Pagination, { usePaged } from '@/components/Pagination'
import { toaster } from '@/components/ui/toaster'
import { COLORS } from '@/theme/tokens'

type Batch = Awaited<ReturnType<typeof schoolClient.listPpdbBatches>>['batches'][number]
type Reg = Awaited<ReturnType<typeof schoolClient.listPpdbRegistrations>>['items'][number]
type Q = { question: string; options: string[]; correctIndex: number }

const errShow = (e: unknown) => toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' })
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export default function PpdbAdmin() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchId, setBatchId] = useState('')
  const batch = batches.find((b) => b.id === batchId)

  const loadBatches = useCallback(async () => {
    try {
      const r = await schoolClient.listPpdbBatches({})
      setBatches(r.batches)
      setBatchId((cur) => cur || r.batches.find((b) => b.isActive)?.id || r.batches[0]?.id || '')
    } catch (e) { errShow(e) }
  }, [])
  useEffect(() => { loadBatches() }, [loadBatches])

  return (
    <Box mt="20px">
      <BatchBar batches={batches} batchId={batchId} onSelect={setBatchId} reload={loadBatches} />
      {batch ? (
        <Tabs.Root defaultValue="pendaftar" mt="14px">
          <Tabs.List>
            <Tabs.Trigger value="pendaftar"><Icon as={LuUsers} /> Pendaftar & Ranking</Tabs.Trigger>
            <Tabs.Trigger value="soal"><Icon as={LuClipboardList} /> Bank Soal</Tabs.Trigger>
            <Tabs.Trigger value="setting"><Icon as={LuLayers} /> Pengaturan Gelombang</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="pendaftar"><RegistrantTable batch={batch} /></Tabs.Content>
          <Tabs.Content value="soal"><QuestionEditor batch={batch} /></Tabs.Content>
          <Tabs.Content value="setting"><BatchSettings batch={batch} reload={loadBatches} /></Tabs.Content>
        </Tabs.Root>
      ) : (
        <Text mt="16px" fontSize="14px" color={COLORS.muted}>Belum ada gelombang. Buat gelombang baru untuk memulai PPDB.</Text>
      )}
    </Box>
  )
}

// ── batch selector + create/activate/delete ──
function BatchBar({ batches, batchId, onSelect, reload }: { batches: Batch[]; batchId: string; onSelect: (id: string) => void; reload: () => void }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [tahun, setTahun] = useState('')
  const [gel, setGel] = useState(1)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const batch = batches.find((b) => b.id === batchId)

  const create = async () => {
    if (!tahun.trim()) { toaster.create({ description: 'Isi tahun ajaran (mis. 2026/2027).', type: 'warning' }); return }
    setBusy(true)
    try { const b = await schoolClient.createPpdbBatch({ tahunAjaran: tahun.trim(), gelombang: gel }); setCreateOpen(false); setTahun(''); await reload(); onSelect(b.id) }
    catch (e) { errShow(e) } finally { setBusy(false) }
  }
  const activate = async () => { if (!batch) return; try { await schoolClient.setActivePpdbBatch({ id: batch.id }); await reload(); toaster.create({ description: `${batch.nama} diaktifkan.`, type: 'success' }) } catch (e) { errShow(e) } }
  const del = () => batch && setConfirm({
    title: 'Hapus Gelombang', message: `Hapus ${batch.nama} TA ${batch.tahunAjaran}? Semua pendaftar & soal gelombang ini ikut terhapus.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus', onConfirm: async () => { try { await schoolClient.deletePpdbBatch({ id: batch.id }); onSelect(''); await reload() } catch (e) { errShow(e) } },
  })

  return (
    <Flex gap="8px" align="center" wrap="wrap" bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="10px">
      <Icon as={LuLayers} color={COLORS.primary} />
      <Box minW="240px">
        <NativeSelect.Root size="sm">
          <NativeSelect.Field value={batchId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">— Pilih Gelombang —</option>
            {batches.map((b) => <option key={b.id} value={b.id}>TA {b.tahunAjaran} — {b.nama}{b.isActive ? ' (aktif)' : ''} · {b.pendaftarCount} pendaftar</option>)}
          </NativeSelect.Field><NativeSelect.Indicator />
        </NativeSelect.Root>
      </Box>
      {batch && !batch.isActive && <Button size="sm" variant="outline" colorPalette="green" onClick={activate}><Icon as={LuStar} /> Aktifkan</Button>}
      {batch?.isActive && <Badge colorPalette="green">Aktif</Badge>}
      <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={() => setCreateOpen(true)}><Icon as={LuPlus} /> Gelombang Baru</Button>
      {batch && <IconButton aria-label="Hapus gelombang" size="sm" variant="outline" colorPalette="red" onClick={del}><Icon as={LuTrash2} /></IconButton>}

      <Dialog.Root open={createOpen} onOpenChange={(e) => { if (!e.open) setCreateOpen(false) }}>
        <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content maxW="380px">
          <Dialog.Header><Dialog.Title>Gelombang Baru</Dialog.Title></Dialog.Header>
          <Dialog.Body><Stack gap="12px">
            <Field.Root required><Field.Label>Tahun Ajaran</Field.Label><Input value={tahun} onChange={(e) => setTahun(e.target.value)} placeholder="2026/2027" /></Field.Root>
            <Field.Root><Field.Label>Gelombang</Field.Label>
              <NativeSelect.Root><NativeSelect.Field value={gel} onChange={(e) => setGel(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Gelombang {n}</option>)}
              </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
          </Stack></Dialog.Body>
          <Dialog.Footer><Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button><Button loading={busy} onClick={create} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>Buat</Button></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner>
      </Dialog.Root>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Flex>
  )
}

// ── batch settings (dates, brosur, drive, panduan, docs, kuota, exam toggle) ──
const DEFAULT_DOCS = ['Pas Foto', 'Ijazah / SKL', 'Kartu Keluarga', 'Akta Kelahiran']
function BatchSettings({ batch, reload }: { batch: Batch; reload: () => void }) {
  const [buka, setBuka] = useState(batch.buka)
  const [tutup, setTutup] = useState(batch.tutup)
  const [driveLink, setDriveLink] = useState(batch.driveLink)
  const [panduan, setPanduan] = useState(batch.panduan)
  const [docs, setDocs] = useState<string[]>(batch.requiredDocs.length ? batch.requiredDocs : DEFAULT_DOCS)
  const [kuota, setKuota] = useState<Record<string, number>>(() => Object.fromEntries(PPDB_JURUSAN.map((j) => [j, batch.kuota[j] || 0])))
  const [testActive, setTestActive] = useState(batch.testActive)
  const [durasi, setDurasi] = useState(batch.testDurationMinutes || 60)
  const [brosur, setBrosur] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setBuka(batch.buka); setTutup(batch.tutup); setDriveLink(batch.driveLink); setPanduan(batch.panduan)
    setDocs(batch.requiredDocs.length ? batch.requiredDocs : DEFAULT_DOCS)
    setKuota(Object.fromEntries(PPDB_JURUSAN.map((j) => [j, batch.kuota[j] || 0])))
    setTestActive(batch.testActive); setDurasi(batch.testDurationMinutes || 60); setBrosur(undefined)
  }, [batch])

  const save = async () => {
    setSaving(true)
    try {
      await schoolClient.updatePpdbBatch({
        id: batch.id, buka, tutup, driveLink, panduan, requiredDocs: docs.filter((d) => d.trim()),
        kuota: Object.fromEntries(PPDB_JURUSAN.map((j) => [j, kuota[j] || 0])), testActive, testDurationMinutes: durasi,
        ...(brosur !== undefined ? { brosur } : {}),
      })
      toaster.create({ description: 'Pengaturan gelombang disimpan.', type: 'success' }); reload()
    } catch (e) { errShow(e) } finally { setSaving(false) }
  }
  const pickBrosur = async (f?: File) => { if (!f) return; try { setBrosur(await fileToDataUrl(f, 1000, 0.8)) } catch { toaster.create({ description: 'Gagal memuat gambar', type: 'error' }) } }

  return (
    <Stack gap="14px" maxW="720px" mt="14px">
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
        <Field.Root><Field.Label fontSize="12px">Buka Pendaftaran</Field.Label><Input type="date" value={buka} onChange={(e) => setBuka(e.target.value)} /></Field.Root>
        <Field.Root><Field.Label fontSize="12px">Tutup Pendaftaran</Field.Label><Input type="date" value={tutup} onChange={(e) => setTutup(e.target.value)} /></Field.Root>
      </SimpleGrid>
      <Field.Root><Field.Label fontSize="12px">Link Google Drive (unggah dokumen)</Field.Label><Input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Panduan Upload Dokumen</Field.Label><Textarea rows={3} value={panduan} onChange={(e) => setPanduan(e.target.value)} placeholder="Contoh: beri nama file 'Nama_NoPendaftaran_JenisDokumen', dst." /></Field.Root>

      <Box>
        <Text fontSize="12px" fontWeight="600" mb="4px">Checklist Dokumen</Text>
        <Stack gap="6px">
          {docs.map((d, i) => (
            <Flex key={i} gap="6px"><Input size="sm" value={d} onChange={(e) => setDocs((a) => a.map((x, j) => j === i ? e.target.value : x))} />
              <IconButton aria-label="hapus" size="sm" variant="ghost" colorPalette="red" onClick={() => setDocs((a) => a.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton></Flex>
          ))}
          <Button size="xs" variant="outline" alignSelf="flex-start" onClick={() => setDocs((a) => [...a, ''])}><Icon as={LuPlus} /> Tambah dokumen</Button>
        </Stack>
      </Box>

      <Box>
        <Text fontSize="12px" fontWeight="600" mb="4px">Kuota per Jurusan (info)</Text>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap="8px">
          {PPDB_JURUSAN.map((j) => (
            <Field.Root key={j}><Field.Label fontSize="11px">{j}</Field.Label>
              <Input type="number" min={0} size="sm" value={kuota[j]} onChange={(e) => setKuota((k) => ({ ...k, [j]: Number(e.target.value) }))} /></Field.Root>
          ))}
        </SimpleGrid>
      </Box>

      <Field.Root><Field.Label fontSize="12px">Brosur (gambar)</Field.Label>
        <Flex gap="10px" align="center">
          {(brosur || batch.hasBrosur) && <Image src={brosur || `/ppdb-brosur?batch=${batch.id}&t=${Date.now()}`} alt="brosur" maxH="80px" borderRadius="8px" border="1px solid" borderColor={COLORS.border} />}
          <Button as="label" size="sm" variant="outline" cursor="pointer"><Icon as={LuUpload} /> Pilih Gambar
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickBrosur(f); e.currentTarget.value = '' }} /></Button>
          {(brosur || batch.hasBrosur) && <Button size="sm" variant="ghost" colorPalette="red" onClick={() => setBrosur('')}><Icon as={LuX} /> Hapus</Button>}
        </Flex>
      </Field.Root>

      <Flex align="center" gap="10px" borderTop="1px solid" borderColor={COLORS.border} pt="12px" wrap="wrap">
        <Switch.Root checked={testActive} onCheckedChange={(e) => setTestActive(e.checked)}>
          <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Label>Buka Ujian Online</Switch.Label>
        </Switch.Root>
        <Field.Root maxW="160px"><Field.Label fontSize="12px">Durasi (menit)</Field.Label><Input type="number" min={1} size="sm" value={durasi} onChange={(e) => setDurasi(Number(e.target.value))} /></Field.Root>
      </Flex>

      <Button alignSelf="flex-start" loading={saving} onClick={save} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan Pengaturan</Button>
    </Stack>
  )
}

// ── question bank editor ──
function QuestionEditor({ batch }: { batch: Batch }) {
  const [qs, setQs] = useState<Q[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await schoolClient.listPpdbQuestions({ batchId: batch.id })
      setQs(r.questions.map((q) => ({ question: q.question, options: q.options.length ? q.options : ['', '', '', ''], correctIndex: q.correctIndex < 0 ? 0 : q.correctIndex })))
    } catch (e) { errShow(e) } finally { setLoading(false) }
  }, [batch.id])
  useEffect(() => { load() }, [load])

  const addQ = () => setQs((a) => [...a, { question: '', options: ['', '', '', ''], correctIndex: 0 }])
  const setQ = (i: number, patch: Partial<Q>) => setQs((a) => a.map((q, j) => j === i ? { ...q, ...patch } : q))
  const setOpt = (i: number, oi: number, v: string) => setQs((a) => a.map((q, j) => j === i ? { ...q, options: q.options.map((o, k) => k === oi ? v : o) } : q))
  const save = async () => {
    setSaving(true)
    try {
      await schoolClient.setPpdbQuestions({ batchId: batch.id, questions: qs.filter((q) => q.question.trim()).map((q) => ({ question: q.question, options: q.options.map((o) => o.trim()), correctIndex: q.correctIndex })) })
      toaster.create({ description: 'Bank soal disimpan.', type: 'success' }); load()
    } catch (e) { errShow(e) } finally { setSaving(false) }
  }

  return (
    <Stack gap="12px" maxW="760px" mt="14px">
      <Text fontSize="12px" color={COLORS.muted}>Soal pilihan ganda untuk ujian gelombang ini. Pilih satu jawaban benar per soal. {loading && '· memuat…'}</Text>
      {qs.map((q, i) => (
        <Box key={i} bg={COLORS.bg} borderRadius="10px" p="12px">
          <Flex gap="6px" mb="6px" align="center">
            <Text fontWeight="700" fontSize="13px">Soal {i + 1}</Text>
            <IconButton aria-label="hapus" size="2xs" variant="ghost" colorPalette="red" ml="auto" onClick={() => setQs((a) => a.filter((_, j) => j !== i))}><Icon as={LuTrash2} /></IconButton>
          </Flex>
          <Textarea size="sm" rows={2} value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} placeholder="Tulis pertanyaan…" mb="6px" />
          <Stack gap="4px">
            {q.options.map((o, oi) => (
              <Flex key={oi} gap="6px" align="center">
                <IconButton aria-label="benar" size="2xs" variant={q.correctIndex === oi ? 'solid' : 'outline'} colorPalette={q.correctIndex === oi ? 'green' : 'gray'} onClick={() => setQ(i, { correctIndex: oi })}><Text fontSize="11px" fontWeight="700">{String.fromCharCode(65 + oi)}</Text></IconButton>
                <Input size="sm" value={o} onChange={(e) => setOpt(i, oi, e.target.value)} placeholder={`Opsi ${String.fromCharCode(65 + oi)}`} />
              </Flex>
            ))}
          </Stack>
        </Box>
      ))}
      <Flex gap="8px">
        <Button size="sm" variant="outline" onClick={addQ}><Icon as={LuPlus} /> Tambah Soal</Button>
        <Button size="sm" loading={saving} onClick={save} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan Bank Soal ({qs.length})</Button>
      </Flex>
    </Stack>
  )
}

// ── registrant ranking table ──
function RegistrantTable({ batch }: { batch: Batch }) {
  const [rows, setRows] = useState<Reg[]>([])
  const [loading, setLoading] = useState(false)
  const [jurusan, setJurusan] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Reg | null>(null)
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([])
  const [status, setStatus] = useState('baru')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulking, setBulking] = useState(false)
  const [school, setSchool] = useState<School | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const paged = usePaged(rows, 15)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await schoolClient.listPpdbRegistrations({ batchId: batch.id, jurusan, search }); setRows(r.items); setSelected(new Set()) }
    catch (e) { errShow(e) } finally { setLoading(false) }
  }, [batch.id, jurusan, search])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { schoolClient.getSchool({}).then(setSchool).catch(() => {}) }, [])

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))
  const bulkStatus = (newStatus: string) => setConfirm({
    title: newStatus === 'diterima' ? 'Terima Pendaftar' : 'Tolak Pendaftar',
    message: `Ubah status ${selected.size} pendaftar terpilih menjadi "${PPDB_STATUS[newStatus]?.label}"?`,
    confirmLabel: 'Ya', variant: newStatus === 'ditolak' ? 'danger' : undefined,
    onConfirm: async () => {
      setBulking(true)
      try {
        for (const id of selected) {
          const row = rows.find((r) => r.id === id)
          await schoolClient.updatePpdbStatus({ id, status: newStatus, catatan: row?.catatan || '' })
        }
        load()
      } catch (e) { errShow(e) } finally { setBulking(false) }
    },
  })

  const fmtDate = (r: Reg) => (r.createdAt ? timestampDate(r.createdAt).toLocaleDateString('id-ID') : '—')
  const openDetail = (r: Reg) => {
    setDetail(r); setStatus(r.status || 'baru'); setCatatan(r.catatan || ''); setDocs([])
    schoolClient.listPpdbDocuments({ registrationId: r.id }).then((res) => setDocs(res.docs)).catch(() => {})
  }
  const saveStatus = async () => {
    if (!detail) return
    setSaving(true)
    try { await schoolClient.updatePpdbStatus({ id: detail.id, status, catatan }); setDetail(null); load() }
    catch (e) { errShow(e) } finally { setSaving(false) }
  }
  const askDelete = (r: Reg) => setConfirm({ title: 'Hapus Pendaftar', message: `Hapus "${r.nama}"?`, variant: 'danger', confirmLabel: 'Ya, Hapus', onConfirm: async () => { try { await schoolClient.deletePpdbRegistration({ id: r.id }); load() } catch (e) { errShow(e) } } })

  const exportCSV = () => {
    if (!rows.length) return
    const head = ['No. Pendaftaran', 'Nama', 'JK', 'Jurusan', 'Asal Sekolah', 'Nilai', 'Status', 'Password', 'Telepon', 'Tanggal']
    const body = rows.map((r) => [r.noPendaftaran, r.nama, r.jenisKelamin, r.jurusan, r.asalSekolah, r.testScore < 0 ? '' : r.testScore, PPDB_STATUS[r.status]?.label ?? r.status, r.password, r.phones.map((p) => `${p.label}:${p.number}`).join(' | '), fmtDate(r)])
    const csv = [head, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `pendaftar_${batch.tahunAjaran.replace('/', '-')}_G${batch.gelombang}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const printCards = () => {
    if (!rows.length) return
    const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c))
    const logo = school?.logo || ''
    const ttd = school?.kepalaSekolahTtd || ''
    const namaSekolah = school?.name || 'SMK Islam 2 Wlingi'
    const alamat = school?.address || ''
    const kepala = school?.kepalaSekolah || ''
    const cards = rows.map((r) => `
      <div class="card">
        <div class="hd">
          ${logo ? `<img class="logo" src="${logo}"/>` : '<div class="logo"></div>'}
          <div class="hdt"><div class="sn">${esc(namaSekolah)}</div><div class="al">${esc(alamat)}</div></div>
        </div>
        <div class="gel">KARTU UJIAN PPDB &middot; ${esc(batch.nama)} &middot; TA ${esc(batch.tahunAjaran)}</div>
        <table>
          <tr><td>Nama</td><td><b>${esc(r.nama)}</b></td></tr>
          <tr><td>No. Pendaftaran</td><td><b>${esc(r.noPendaftaran)}</b></td></tr>
          <tr><td>Jurusan</td><td><b>${esc(r.jurusan)}</b></td></tr>
          <tr><td>Password Ujian</td><td><b>${esc(r.password)}</b></td></tr>
        </table>
        <div class="sign">
          <div class="sl">Kepala Sekolah,</div>
          ${ttd ? `<img class="ttd" src="${ttd}"/>` : '<div class="ttd"></div>'}
          <div class="kn">${esc(kepala) || '&nbsp;'}</div>
        </div>
      </div>`).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>Kartu Ujian PPDB</title><style>
      body{font-family:Arial,sans-serif;margin:12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .card{border:1px solid #333;border-radius:8px;padding:12px 14px}
      .hd{display:flex;align-items:center;gap:10px}
      .logo{width:50px;height:50px;object-fit:contain;flex-shrink:0}
      .hdt{flex:1;text-align:center}
      .sn{font-size:15px;font-weight:800;line-height:1.2}.al{font-size:10px;color:#444}
      .gel{text-align:center;font-size:11px;font-weight:700;color:#7A2FB0;margin:8px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:4px 0}
      table{width:100%;font-size:12px;border-collapse:collapse}td{padding:2px 0}td:first-child{color:#555;width:40%}
      .sign{width:170px;margin:12px 0 0 auto;text-align:center}
      .sl{font-size:11px;color:#333}
      .ttd{height:46px;object-fit:contain;display:block;margin:2px auto}
      .kn{font-size:12px;font-weight:700;border-top:1px solid #333;padding-top:2px;min-height:16px}
      @media print{.card{page-break-inside:avoid}}
    </style></head><body><div class="grid">${cards}</div><script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  const Item = ({ label, value }: { label: string; value?: string }) => (<Box><Text fontSize="11px" color={COLORS.muted}>{label}</Text><Text fontSize="14px" fontWeight="500">{value || '—'}</Text></Box>)

  return (
    <Stack gap="12px" mt="14px">
      <Flex gap="8px" wrap="wrap" align="center">
        <Box minW="150px"><NativeSelect.Root size="sm"><NativeSelect.Field value={jurusan} onChange={(e) => setJurusan(e.target.value)}>
          <option value="">Semua Jurusan</option>{PPDB_JURUSAN.map((j) => <option key={j} value={j}>{j}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Box>
        <Input size="sm" maxW="240px" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama…" />
        <Text fontSize="12px" color={COLORS.muted}>{rows.length} pendaftar</Text>
        <Flex gap="6px" ml="auto">
          <Button size="sm" variant="outline" onClick={load} loading={loading}><Icon as={LuRefreshCw} /></Button>
          <Button size="sm" variant="outline" onClick={printCards} disabled={!rows.length}><Icon as={LuPrinter} /> Cetak Kartu</Button>
          <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={exportCSV} disabled={!rows.length}><Icon as={LuDownload} /> Export CSV</Button>
        </Flex>
      </Flex>

      {selected.size > 0 && (
        <Flex align="center" gap="8px" bg={COLORS.primaryTint} borderRadius="8px" px="12px" py="8px" wrap="wrap">
          <Text fontSize="13px" fontWeight="600">{selected.size} dipilih</Text>
          <Button size="xs" colorPalette="green" loading={bulking} onClick={() => bulkStatus('diterima')}><Icon as={LuCheck} /> Terima Semua</Button>
          <Button size="xs" variant="outline" colorPalette="red" loading={bulking} onClick={() => bulkStatus('ditolak')}><Icon as={LuBan} /> Tolak</Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Batal pilih</Button>
        </Flex>
      )}

      {rows.length === 0 ? <Text fontSize="13px" color={COLORS.muted}>{loading ? 'Memuat…' : 'Belum ada pendaftar.'}</Text> : (
        <>
        <Box overflowX="auto"><Table.Root size="sm">
          <Table.Header><Table.Row>
            <Table.ColumnHeader w="36px"><Checkbox.Root size="sm" checked={allChecked} onCheckedChange={toggleAll}><Checkbox.HiddenInput /><Checkbox.Control /></Checkbox.Root></Table.ColumnHeader>
            <Table.ColumnHeader>#</Table.ColumnHeader><Table.ColumnHeader>No. Daftar</Table.ColumnHeader><Table.ColumnHeader>Nama</Table.ColumnHeader>
            <Table.ColumnHeader>Jurusan</Table.ColumnHeader><Table.ColumnHeader>Nilai</Table.ColumnHeader><Table.ColumnHeader>Password</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader><Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>
            {paged.pageItems.map((r, i) => (
              <Table.Row key={r.id} bg={selected.has(r.id) ? COLORS.primaryTint : undefined}>
                <Table.Cell><Checkbox.Root size="sm" checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)}><Checkbox.HiddenInput /><Checkbox.Control /></Checkbox.Root></Table.Cell>
                <Table.Cell fontWeight="700">{(paged.page - 1) * paged.pageSize + i + 1}</Table.Cell>
                <Table.Cell fontSize="12px">{r.noPendaftaran}</Table.Cell>
                <Table.Cell fontWeight="medium">{r.nama}</Table.Cell>
                <Table.Cell><Badge colorPalette="purple" variant="subtle">{r.jurusan}</Badge></Table.Cell>
                <Table.Cell fontWeight="800">{r.testScore < 0 ? '—' : r.testScore}</Table.Cell>
                <Table.Cell fontFamily="mono" fontSize="12px">{r.password}</Table.Cell>
                <Table.Cell><Badge colorPalette={PPDB_STATUS[r.status]?.color ?? 'gray'}>{PPDB_STATUS[r.status]?.label ?? r.status}</Badge></Table.Cell>
                <Table.Cell textAlign="right">
                  <RowActionsMenu actions={[
                    { label: 'Detail', icon: LuEye, onClick: () => openDetail(r) },
                    { label: 'Terima', icon: LuCheck, onClick: () => schoolClient.updatePpdbStatus({ id: r.id, status: 'diterima', catatan: r.catatan || '' }).then(load).catch(errShow) },
                    { label: 'Tolak', icon: LuBan, onClick: () => schoolClient.updatePpdbStatus({ id: r.id, status: 'ditolak', catatan: r.catatan || '' }).then(load).catch(errShow) },
                    { label: 'Hapus', icon: LuTrash2, onClick: () => askDelete(r), danger: true },
                  ]} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root></Box>
        <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPageChange={paged.setPage} />
        </>
      )}

      <Dialog.Root open={!!detail} onOpenChange={(e) => { if (!e.open) setDetail(null) }} scrollBehavior="inside" size="lg">
        <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content maxW="640px">
          <Dialog.Header><Dialog.Title>Detail — {detail?.nama}</Dialog.Title></Dialog.Header>
          <Dialog.Body>{detail && (
            <Stack gap="14px">
              <SimpleGrid columns={{ base: 2, md: 3 }} gap="12px">
                <Item label="No. Pendaftaran" value={detail.noPendaftaran} />
                <Item label="Password Ujian" value={detail.password} />
                <Item label="Nilai Ujian" value={detail.testScore < 0 ? 'Belum ujian' : String(detail.testScore)} />
                <Item label="Jurusan" value={detail.jurusan} />
                <Item label="Tempat, Tgl Lahir" value={[detail.tempatLahir, detail.tanggalLahir].filter(Boolean).join(', ')} />
                <Item label="Jenis Kelamin" value={detail.jenisKelamin === 'L' ? 'Laki-laki' : detail.jenisKelamin === 'P' ? 'Perempuan' : ''} />
                <Item label="Asal Sekolah" value={detail.asalSekolah} />
                <Item label="Nama Ortu/Wali" value={detail.namaOrtu} />
                <Item label="Email" value={detail.email} />
                <Item label="NISN" value={detail.nisn} />
                <Item label="No. KK" value={detail.noKk} />
                <Item label="Tanggal Daftar" value={fmtDate(detail)} />
              </SimpleGrid>
              <Item label="Alamat" value={detail.alamat} />
              <Box><Text fontSize="11px" color={COLORS.muted} mb="4px">Telepon</Text><Stack gap="2px">{detail.phones.length ? detail.phones.map((p, i) => <Text key={i} fontSize="14px">{p.label}: <b>{p.number}</b></Text>) : <Text fontSize="14px">—</Text>}</Stack></Box>
              <Box>
                <Text fontSize="11px" color={COLORS.muted} mb="4px">Dokumen</Text>
                {detail.docLink ? <Text fontSize="13px"><Icon as={LuExternalLink} /> <a href={detail.docLink} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, textDecoration: 'underline', wordBreak: 'break-all' }}>{detail.docLink}</a></Text> : <Text fontSize="13px" color={COLORS.muted}>Belum ada link Drive.</Text>}
                {docs.length > 0 && (
                  <Flex gap="6px" wrap="wrap" mt="6px">
                    {docs.map((d) => <Button key={d.id} as="a" size="2xs" variant="outline" {...{ href: `/ppdb-doc?id=${d.id}`, target: '_blank', rel: 'noopener' }}><Icon as={LuDownload} /> {d.name}</Button>)}
                  </Flex>
                )}
              </Box>
              <Flex gap="12px" wrap="wrap" align="flex-end" borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                <Field.Root maxW="200px"><Field.Label fontSize="12px">Status Seleksi</Field.Label>
                  <NativeSelect.Root><NativeSelect.Field value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="baru">Baru</option><option value="diterima">Diterima</option><option value="ditolak">Ditolak</option>
                  </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
                <Field.Root flex={1} minW="220px"><Field.Label fontSize="12px">Catatan</Field.Label><Textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field.Root>
              </Flex>
            </Stack>
          )}</Dialog.Body>
          <Dialog.Footer><Button variant="outline" onClick={() => setDetail(null)}>Tutup</Button><Button loading={saving} onClick={saveStatus} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>Simpan Status</Button></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner>
      </Dialog.Root>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Stack>
  )
}
