import { useEffect, useState, useCallback } from 'react'
import {
  Badge, Box, Button, Card, Dialog, Field, Flex, Heading, Icon, IconButton, Image, Input, SimpleGrid, Stack, Table, Text, Textarea,
} from '@chakra-ui/react'
import {
  LuBriefcase, LuMapPin, LuMessageCircle, LuPlus, LuPencil, LuTrash2, LuUsers, LuX, LuCircleCheck, LuLocate,
} from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { ConnectError } from '@connectrpc/connect'
import { pklClient } from '@/lib/client'
import { Role } from '@/gen/user/v1/user_pb'
import type { Partner, Applicant } from '@/gen/pkl/v1/pkl_pb'
import { useAuth } from '@/hooks/useAuth'
import { fileToDataUrl } from '@/lib/image'
import AppLayout from '@/components/AppLayout'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import { toaster } from '@/components/ui/toaster'
import { COLORS } from '@/theme/tokens'

const decodePoints = (s: string): string[] => (s || '').split('\n').map((p) => p.trim()).filter(Boolean)
const encodePoints = (arr: string[]): string => arr.map((p) => p.trim()).filter(Boolean).join('\n')
const errMsg = (e: unknown) => (e instanceof ConnectError ? e.rawMessage : e instanceof Error ? e.message : 'Terjadi kesalahan')
const waLink = (no: string) => {
  let n = (no || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n ? `https://wa.me/${n}` : ''
}
const mapsLink = (p: Partner) => p.mapsUrl || ((p.lat || p.lng) ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : '')

// Editable list of bullet points.
function PointsEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Stack gap="6px" w="full">
        {value.map((p, i) => (
          <Flex key={i} gap="6px">
            <Input size="sm" value={p} placeholder={`${label} ${i + 1}`}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
            <IconButton aria-label="hapus" size="sm" variant="ghost" colorPalette="red"
              onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton>
          </Flex>
        ))}
        <Button size="xs" variant="outline" alignSelf="flex-start" onClick={() => onChange([...value, ''])}>
          <Icon as={LuPlus} /> Tambah poin
        </Button>
      </Stack>
    </Field.Root>
  )
}

// Small partner logo (falls back to a briefcase icon).
function PartnerLogo({ src, size = 44 }: { src?: string; size?: number }) {
  return src
    ? <Image src={src} alt="logo" w={`${size}px`} h={`${size}px`} borderRadius="8px" objectFit="cover" flexShrink={0} border="1px solid" borderColor={COLORS.border} />
    : <Flex w={`${size}px`} h={`${size}px`} borderRadius="8px" bg={COLORS.primaryTint} align="center" justify="center" flexShrink={0}><Icon as={LuBriefcase} color={COLORS.primary} boxSize="20px" /></Flex>
}

const emptyForm = { id: '', name: '', alamat: '', deskripsi: '', mapsUrl: '', lat: 0, lng: 0, kontakWa: '', bidang: [] as string[], job: [] as string[], kuota: 1, logo: '' }

// ───────────────────────── Guru ─────────────────────────
function GuruPkl({ partners, reload }: { partners: Partner[]; reload: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [applicantsOf, setApplicantsOf] = useState<Partner | null>(null)
  const [applicants, setApplicants] = useState<Applicant[]>([])

  const openCreate = () => { setForm(emptyForm); setOpen(true) }
  const openEdit = (p: Partner) => {
    setForm({ id: p.id, name: p.name, alamat: p.alamat, deskripsi: p.deskripsi, mapsUrl: p.mapsUrl, lat: p.lat, lng: p.lng, kontakWa: p.kontakWa, bidang: decodePoints(p.bidangUsaha), job: decodePoints(p.jobRequirement), kuota: p.kuota || 1, logo: p.logo })
    setOpen(true)
  }
  const useMyLocation = () => {
    if (!navigator.geolocation) { toaster.create({ description: 'GPS tidak tersedia di browser ini.', type: 'warning' }); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) })),
      () => toaster.create({ description: 'Gagal mengambil lokasi (izin ditolak / butuh HTTPS).', type: 'error' }),
    )
  }
  const save = async () => {
    if (!form.name.trim()) { toaster.create({ description: 'Nama tempat PKL wajib.', type: 'warning' }); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name, alamat: form.alamat, deskripsi: form.deskripsi, mapsUrl: form.mapsUrl,
        lat: form.lat, lng: form.lng, kontakWa: form.kontakWa,
        bidangUsaha: encodePoints(form.bidang), jobRequirement: encodePoints(form.job), kuota: form.kuota, logo: form.logo,
      }
      if (form.id) await pklClient.updatePartner({ id: form.id, ...payload })
      else await pklClient.createPartner(payload)
      setOpen(false); reload()
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setSaving(false) }
  }
  const askDelete = (p: Partner) => setConfirm({
    title: 'Hapus Mitra PKL', message: `Hapus "${p.name}"? Data pelamar ikut terhapus.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await pklClient.deletePartner({ id: p.id }); reload() } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) } },
  })
  const showApplicants = async (p: Partner) => {
    setApplicantsOf(p)
    try { const r = await pklClient.getApplicants({ partnerId: p.id }); setApplicants(r.applicants) } catch { setApplicants([]) }
  }

  return (
    <>
      <Flex justify="flex-end" mb="12px">
        <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={openCreate}>
          <Icon as={LuPlus} /> Tambah Mitra PKL
        </Button>
      </Flex>
      {partners.length === 0 ? (
        <Text color={COLORS.muted} fontSize="14px">Belum ada mitra PKL.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="16px">
          {partners.map((p) => (
            <Card.Root key={p.id}><Card.Body>
              <Flex align="flex-start" gap="8px" mb="6px">
                <PartnerLogo src={p.logo} />
                <Box flex="1" minW={0}>
                  <Heading size="sm" lineClamp={2}>{p.name}</Heading>
                  {p.alamat && <Text fontSize="12px" color={COLORS.muted} lineClamp={2}>{p.alamat}</Text>}
                </Box>
                <Badge colorPalette={p.isFull ? 'red' : 'green'}>{p.terisi}/{p.kuota}</Badge>
              </Flex>
              {p.deskripsi && <Text fontSize="13px" color={COLORS.text} lineClamp={3} mb="8px">{p.deskripsi}</Text>}
              <Flex gap="6px" wrap="wrap">
                <Button size="xs" variant="outline" onClick={() => showApplicants(p)}><Icon as={LuUsers} /> Pelamar ({p.terisi})</Button>
                <IconButton aria-label="Edit" size="xs" variant="outline" colorPalette="blue" onClick={() => openEdit(p)}><Icon as={LuPencil} /></IconButton>
                <IconButton aria-label="Hapus" size="xs" variant="outline" colorPalette="red" onClick={() => askDelete(p)}><Icon as={LuTrash2} /></IconButton>
              </Flex>
            </Card.Body></Card.Root>
          ))}
        </SimpleGrid>
      )}

      {/* Form dialog */}
      <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) setOpen(false) }} scrollBehavior="inside">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="560px">
            <Dialog.Header><Dialog.Title>{form.id ? 'Edit' : 'Tambah'} Mitra PKL</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Stack gap="12px">
                <Field.Root required><Field.Label>Nama Tempat PKL</Field.Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. PT Teknologi Nusantara" /></Field.Root>
                <Field.Root><Field.Label>Logo</Field.Label>
                  <Flex gap="10px" align="center">
                    <PartnerLogo src={form.logo} size={56} />
                    <Box as="label" cursor="pointer" fontSize="12px" color={COLORS.primary} display="inline-flex" alignItems="center" gap="4px">
                      <Icon as={LuPlus} /> {form.logo ? 'Ganti logo' : 'Unggah logo'}
                      <input type="file" accept="image/*" hidden onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (f) { try { const logo = await fileToDataUrl(f, 96, 0.6); setForm((s) => ({ ...s, logo })) } catch { toaster.create({ description: 'Gagal memuat gambar', type: 'error' }) } }
                      }} />
                    </Box>
                    {form.logo && <Button size="2xs" variant="ghost" colorPalette="red" onClick={() => setForm({ ...form, logo: '' })}><Icon as={LuX} /> Hapus</Button>}
                  </Flex>
                </Field.Root>
                <Field.Root><Field.Label>Alamat</Field.Label>
                  <Input value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></Field.Root>
                <Field.Root><Field.Label>Deskripsi Perusahaan / Instansi</Field.Label>
                  <Textarea value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} rows={3} /></Field.Root>
                <Field.Root><Field.Label>Lokasi Maps (link Google Maps atau koordinat)</Field.Label>
                  <Input value={form.mapsUrl} onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })} placeholder="tempel link Google Maps (opsional)" mb="6px" />
                  <Flex gap="6px" align="center">
                    <Input size="sm" type="number" value={form.lat || ''} onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })} placeholder="Lat" />
                    <Input size="sm" type="number" value={form.lng || ''} onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })} placeholder="Lng" />
                    <Button size="sm" variant="outline" flexShrink={0} onClick={useMyLocation}><Icon as={LuLocate} /> Lokasi saya</Button>
                  </Flex>
                </Field.Root>
                <Field.Root><Field.Label>Kontak WhatsApp</Field.Label>
                  <Input value={form.kontakWa} onChange={(e) => setForm({ ...form, kontakWa: e.target.value })} placeholder="mis. 08123456789" /></Field.Root>
                <PointsEditor label="Bidang Usaha" value={form.bidang} onChange={(v) => setForm({ ...form, bidang: v })} />
                <PointsEditor label="Job Requirement" value={form.job} onChange={(v) => setForm({ ...form, job: v })} />
                <Field.Root maxW="140px"><Field.Label>Kuota (using)</Field.Label>
                  <Input type="number" min={1} value={form.kuota} onChange={(e) => setForm({ ...form, kuota: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={saving} onClick={save}>Simpan</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Applicants dialog */}
      <Dialog.Root open={!!applicantsOf} onOpenChange={(e) => { if (!e.open) setApplicantsOf(null) }} scrollBehavior="inside">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="480px">
            <Dialog.Header><Dialog.Title>Pelamar — {applicantsOf?.name}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              {applicants.length === 0 ? <Text fontSize="13px" color={COLORS.muted}>Belum ada pelamar.</Text> : (
                <Table.Root size="sm">
                  <Table.Header><Table.Row>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader><Table.ColumnHeader>Kelas</Table.ColumnHeader><Table.ColumnHeader>Tanggal</Table.ColumnHeader>
                  </Table.Row></Table.Header>
                  <Table.Body>
                    {applicants.map((a) => (
                      <Table.Row key={a.studentId}>
                        <Table.Cell fontWeight="medium">{a.name}</Table.Cell>
                        <Table.Cell>{a.kelas || '—'}</Table.Cell>
                        <Table.Cell fontSize="12px" color={COLORS.muted}>{a.appliedAt ? timestampDate(a.appliedAt).toLocaleDateString('id-ID') : '—'}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              )}
            </Dialog.Body>
            <Dialog.Footer><Button variant="outline" onClick={() => setApplicantsOf(null)}>Tutup</Button></Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

// ───────────────────────── Siswa ─────────────────────────
function SiswaPkl({ partners, reload }: { partners: Partner[]; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const applied = partners.find((p) => p.appliedByMe)

  const apply = async (p: Partner) => {
    setBusy(true)
    try { await pklClient.apply({ partnerId: p.id }); toaster.create({ description: `Berhasil apply ke ${p.name}`, type: 'success' }); reload() }
    catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    setBusy(true)
    try { await pklClient.cancelApply({}); toaster.create({ description: 'Apply dibatalkan', type: 'info' }); reload() }
    catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <Stack gap="16px">
      {applied && (
        <Box bg={COLORS.primaryTint} border="1px solid" borderColor={COLORS.primary} borderRadius="10px" p="12px">
          <Flex align="center" gap="8px" wrap="wrap">
            <Icon as={LuCircleCheck} color={COLORS.success} />
            <Text fontSize="14px" fontWeight="700">PKL kamu: {applied.name}</Text>
            <Text fontSize="12px" color={COLORS.muted}>· batalkan dulu untuk pindah tempat</Text>
            <Button size="xs" variant="outline" colorPalette="red" ml="auto" loading={busy} onClick={cancel}>Batal Apply</Button>
          </Flex>
        </Box>
      )}
      {partners.length === 0 ? (
        <Text color={COLORS.muted} fontSize="14px">Belum ada mitra PKL.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="16px">
          {partners.map((p) => {
            const bidang = decodePoints(p.bidangUsaha)
            const job = decodePoints(p.jobRequirement)
            const maps = mapsLink(p)
            const wa = waLink(p.kontakWa)
            const mine = p.appliedByMe
            return (
              <Card.Root key={p.id} borderColor={mine ? COLORS.primary : undefined} borderWidth={mine ? '2px' : '1px'}>
                <Card.Body>
                  <Flex align="flex-start" gap="8px" mb="6px">
                    <PartnerLogo src={p.logo} />
                    <Box flex="1" minW={0}>
                      <Heading size="sm" lineClamp={2}>{p.name}</Heading>
                      {p.alamat && <Text fontSize="12px" color={COLORS.muted} lineClamp={2}>{p.alamat}</Text>}
                    </Box>
                    <Badge colorPalette={p.isFull ? 'red' : 'green'}>{p.terisi}/{p.kuota}</Badge>
                  </Flex>
                  {p.deskripsi && <Text fontSize="13px" mb="8px" lineClamp={3}>{p.deskripsi}</Text>}
                  {bidang.length > 0 && (
                    <Box mb="6px">
                      <Text fontSize="11px" fontWeight="700" color={COLORS.muted} mb="2px">BIDANG USAHA</Text>
                      <Flex gap="4px" wrap="wrap">{bidang.map((b, i) => <Badge key={i} colorPalette="purple" variant="subtle">{b}</Badge>)}</Flex>
                    </Box>
                  )}
                  {job.length > 0 && (
                    <Box mb="8px">
                      <Text fontSize="11px" fontWeight="700" color={COLORS.muted} mb="2px">JOB REQUIREMENT</Text>
                      <Flex gap="4px" wrap="wrap">{job.map((j, i) => <Badge key={i} colorPalette="orange" variant="subtle">{j}</Badge>)}</Flex>
                    </Box>
                  )}
                  <Flex gap="6px" wrap="wrap" mb="8px">
                    {maps && <Button as="a" size="xs" variant="outline" {...{ href: maps, target: '_blank', rel: 'noopener' }}><Icon as={LuMapPin} /> Buka di Maps</Button>}
                    {wa && <Button as="a" size="xs" variant="outline" colorPalette="green" {...{ href: wa, target: '_blank', rel: 'noopener' }}><Icon as={LuMessageCircle} /> WhatsApp</Button>}
                  </Flex>
                  {mine ? (
                    <Button size="sm" w="full" variant="outline" colorPalette="red" loading={busy} onClick={cancel}>Batal Apply</Button>
                  ) : (
                    <Button size="sm" w="full" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                      loading={busy} disabled={p.isFull || !!applied}
                      onClick={() => apply(p)}>
                      {p.isFull ? 'Penuh' : applied ? 'Sudah apply tempat lain' : 'Apply'}
                    </Button>
                  )}
                </Card.Body>
              </Card.Root>
            )
          })}
        </SimpleGrid>
      )}
    </Stack>
  )
}

export default function MitraPklPage() {
  const { user } = useAuth()
  const isTeacher = user?.role === Role.TEACHER || user?.role === Role.ADMIN
  const [partners, setPartners] = useState<Partner[]>([])
  const reload = useCallback(() => { pklClient.listPartners({}).then((r) => setPartners(r.partners)).catch(() => setPartners([])) }, [])
  useEffect(() => { reload() }, [reload])

  return (
    <AppLayout title="Mitra PKL">
      <Flex align="center" gap="10px" mb="16px">
        <Icon as={LuBriefcase} boxSize="24px" color={COLORS.primary} />
        <Heading size="lg">Mitra PKL</Heading>
      </Flex>
      {isTeacher ? <GuruPkl partners={partners} reload={reload} /> : <SiswaPkl partners={partners} reload={reload} />}
    </AppLayout>
  )
}
