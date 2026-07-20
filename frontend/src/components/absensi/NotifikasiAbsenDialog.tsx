import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Checkbox, Dialog, Flex, Icon, Stack, Text, Textarea } from '@chakra-ui/react'
import { LuMessageCircle, LuTriangleAlert, LuInfo } from 'react-icons/lu'
import { toaster } from '@/components/ui/toaster'
import { COLORS } from '@/theme/tokens'

export interface NotifTarget {
  studentId: string
  nama: string
  kelas: string
  statusLabel: string
  statusColor: string
  phone: string      // No. HP orang tua ('' = belum ada)
  namaOrtu: string   // '' = belum ada data ortu
  message: string
}

// MOCK: pengiriman WhatsApp nyata (gateway/backend) menyusul. Untuk sekarang
// hanya mensimulasikan proses kirim. Ini satu-satunya titik sambung ke backend.
async function kirimNotifWa(_targets: { phone: string; message: string }[]): Promise<void> {
  await new Promise((r) => setTimeout(r, 500))
}

export default function NotifikasiAbsenDialog({
  open, onClose, targets, judul,
}: {
  open: boolean
  onClose: () => void
  targets: NotifTarget[]
  judul: string
}) {
  const single = targets.length === 1
  const [busy, setBusy] = useState(false)
  // Single mode: teacher may tweak the message before sending.
  const [msg, setMsg] = useState('')
  // Bulk mode: which recipients are included (only those with a phone).
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    setMsg(targets[0]?.message ?? '')
    const init: Record<string, boolean> = {}
    targets.forEach((t) => { init[t.studentId] = t.phone !== '' })
    setSelected(init)
  }, [open, targets])

  const withPhone = useMemo(() => targets.filter((t) => t.phone !== ''), [targets])
  const chosen = useMemo(
    () => targets.filter((t) => t.phone !== '' && selected[t.studentId]),
    [targets, selected],
  )
  const canSend = single ? targets[0]?.phone !== '' : chosen.length > 0

  const doSend = async () => {
    setBusy(true)
    try {
      const payload = single
        ? [{ phone: targets[0].phone, message: msg }]
        : chosen.map((t) => ({ phone: t.phone, message: t.message }))
      await kirimNotifWa(payload)
      toaster.create({ description: `${payload.length} notifikasi WhatsApp terkirim (simulasi).`, type: 'success' })
      onClose()
    } catch {
      toaster.create({ description: 'Gagal mengirim notifikasi.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="560px">
          <Dialog.Header>
            <Dialog.Title><Icon as={LuMessageCircle} color="green.500" /> {judul}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            {single ? (
              <Stack gap="10px">
                {targets[0].phone === '' ? (
                  <Flex align="center" gap="8px" p="10px" borderRadius="8px" bg="#FEF3C7" color="#92400E">
                    <Icon as={LuTriangleAlert} />
                    <Text fontSize="13px">No. HP orang tua belum diisi. Lengkapi di <b>Master Data → Orang Tua</b> untuk mengirim notifikasi.</Text>
                  </Flex>
                ) : (
                  <Flex align="center" gap="8px" wrap="wrap" fontSize="13px">
                    <Text color={COLORS.muted}>Kepada:</Text>
                    <Text fontWeight="600">{targets[0].namaOrtu || 'Orang Tua/Wali'}</Text>
                    <Badge colorPalette="green">{targets[0].phone}</Badge>
                    <Text color={COLORS.muted}>· wali dari</Text>
                    <Text fontWeight="600">{targets[0].nama}</Text>
                    <Badge colorPalette={targets[0].statusColor}>{targets[0].statusLabel}</Badge>
                  </Flex>
                )}
                <Box>
                  <Text fontSize="12px" fontWeight="500" mb="4px">Pesan</Text>
                  <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={7} fontSize="13px" />
                </Box>
              </Stack>
            ) : (
              <Stack gap="10px">
                <Text fontSize="13px" color={COLORS.muted}>
                  Pilih orang tua yang akan dikirimi notifikasi. Tiap pesan berisi nama murid, status, tanggal, dan nama sekolah.
                </Text>
                <Stack gap="4px" maxH="300px" overflowY="auto">
                  {targets.map((t) => {
                    const has = t.phone !== ''
                    return (
                      <Flex key={t.studentId} align="center" gap="10px" p="8px" borderRadius="8px"
                        border="1px solid" borderColor={COLORS.border} opacity={has ? 1 : 0.6}>
                        <Checkbox.Root checked={has && !!selected[t.studentId]} disabled={!has}
                          onCheckedChange={() => setSelected((s) => ({ ...s, [t.studentId]: !s[t.studentId] }))}>
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                        </Checkbox.Root>
                        <Box flex="1" minW={0}>
                          <Flex align="center" gap="6px">
                            <Text fontSize="13px" fontWeight="600">{t.nama}</Text>
                            <Badge colorPalette={t.statusColor}>{t.statusLabel}</Badge>
                          </Flex>
                          <Text fontSize="11px" color={COLORS.muted}>
                            {has ? `${t.namaOrtu || 'Orang Tua/Wali'} · ${t.phone}` : 'No. HP orang tua belum ada'}
                          </Text>
                        </Box>
                      </Flex>
                    )
                  })}
                </Stack>
                <Flex align="center" gap="6px" fontSize="12px" color={COLORS.muted}>
                  <Icon as={LuInfo} /> {withPhone.length} dari {targets.length} murid punya No. HP orang tua.
                </Flex>
              </Stack>
            )}
            <Flex align="center" gap="6px" mt="10px" fontSize="11px" color={COLORS.muted}>
              <Icon as={LuInfo} /> Integrasi pengiriman WhatsApp otomatis menyusul — saat ini simulasi.
            </Flex>
          </Dialog.Body>
          <Dialog.Footer>
            <Flex gap="8px" justify="flex-end">
              <Button variant="outline" onClick={onClose}>Batal</Button>
              <Button colorPalette="green" loading={busy} disabled={!canSend} onClick={doSend}>
                <Icon as={LuMessageCircle} /> {single ? 'Kirim via WhatsApp' : `Kirim ke ${chosen.length} orang tua`}
              </Button>
            </Flex>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
