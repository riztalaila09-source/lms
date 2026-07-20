import { useEffect, useState } from 'react'
import { Box, Button, Field, Flex, Icon, IconButton, Image, Input, Stack, Text, Textarea } from '@chakra-ui/react'
import type { IconType } from 'react-icons'
import { LuPlus, LuTrash2, LuSave, LuUpload, LuImage } from 'react-icons/lu'
import { schoolClient } from '@/lib/client'
import { Card } from '@/components/Card'
import { COLORS } from '@/theme/tokens'

type FieldKind = 'text' | 'textarea' | 'url' | 'image-link' | 'image-upload'
export interface ContentField {
  key: 'title' | 'subtitle' | 'body' | 'image' | 'url'
  label: string
  placeholder?: string
  kind: FieldKind
}
type Row = { title: string; subtitle: string; body: string; image: string; url: string }
const emptyRow = (): Row => ({ title: '', subtitle: '', body: '', image: '', url: '' })

const fileToDataURL = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = reject
  r.readAsDataURL(file)
})

export default function ContentListEditor({ type, title, icon, fields, note, addLabel = 'Tambah' }: {
  type: string
  title: string
  icon: IconType
  fields: ContentField[]
  note?: string
  addLabel?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    schoolClient.listContent({ type }).then((r) => setRows(r.items.map((it) => ({
      title: it.title, subtitle: it.subtitle, body: it.body, image: it.image, url: it.url,
    })))).catch(() => {})
  }, [type])

  const add = () => setRows((p) => [...p, emptyRow()])
  const remove = (i: number) => setRows((p) => p.filter((_, j) => j !== i))
  const setField = (i: number, k: keyof Row, v: string) => setRows((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const upload = async (i: number, file: File) => {
    if (file.size > 512 * 1024) { setErr('Gambar maksimal 512 KB.'); return }
    try { setField(i, 'image', await fileToDataURL(file)); setErr('') } catch { setErr('Gagal membaca gambar.') }
  }
  const save = async () => {
    setSaving(true); setMsg(''); setErr('')
    try {
      const items = rows
        .filter((r) => r.title.trim() || r.body.trim() || r.image.trim() || r.url.trim())
        .map((r) => ({ title: r.title, subtitle: r.subtitle, body: r.body, image: r.image, url: r.url }))
      const res = await schoolClient.setContent({ type, items })
      setRows(res.items.map((it) => ({ title: it.title, subtitle: it.subtitle, body: it.body, image: it.image, url: it.url })))
      setMsg('Tersimpan.')
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const renderField = (row: Row, i: number, fld: ContentField) => {
    if (fld.kind === 'textarea') return (
      <Field.Root key={fld.key}><Field.Label fontSize="11px">{fld.label}</Field.Label>
        <Textarea size="sm" rows={4} value={row[fld.key]} onChange={(e) => setField(i, fld.key, e.target.value)} placeholder={fld.placeholder} /></Field.Root>
    )
    if (fld.kind === 'image-link') return (
      <Field.Root key={fld.key}><Field.Label fontSize="11px">{fld.label}</Field.Label>
        <Input size="sm" value={row[fld.key]} onChange={(e) => setField(i, fld.key, e.target.value)} placeholder={fld.placeholder || 'https://…'} /></Field.Root>
    )
    if (fld.kind === 'image-upload') return (
      <Box key={fld.key}>
        <Text fontSize="11px" fontWeight="500" mb="4px">{fld.label}</Text>
        <Flex align="center" gap="10px" wrap="wrap">
          {row.image
            ? <Image src={row.image} alt={fld.label} maxH="70px" maxW="120px" objectFit="cover" borderRadius="8px" border="1px solid" borderColor={COLORS.border} />
            : <Flex boxSize="60px" borderRadius="8px" border="1px dashed" borderColor={COLORS.border} align="center" justify="center" color={COLORS.muted}><Icon as={LuImage} boxSize="22px" /></Flex>}
          <Box as="label" cursor="pointer">
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(i, f); e.currentTarget.value = '' }} />
            <Box as="span" fontSize="12px" px="10px" py="6px" border="1px solid" borderColor={COLORS.border} borderRadius="7px" display="inline-flex" alignItems="center" gap="4px"><Icon as={LuUpload} boxSize="14px" /> Unggah</Box>
          </Box>
          {row.image && <Button size="xs" variant="ghost" colorPalette="red" onClick={() => setField(i, 'image', '')}>Hapus</Button>}
        </Flex>
        <Input size="sm" mt="6px" value={row.image.startsWith('data:') ? '' : row.image} onChange={(e) => setField(i, 'image', e.target.value)} placeholder="atau tempel URL gambar…" />
      </Box>
    )
    // text / url
    return (
      <Field.Root key={fld.key}><Field.Label fontSize="11px">{fld.label}</Field.Label>
        <Input size="sm" value={row[fld.key]} onChange={(e) => setField(i, fld.key, e.target.value)} placeholder={fld.placeholder} /></Field.Root>
    )
  }

  return (
    <Card title={<><Icon as={icon} /> {title}</>}>
      <Stack gap="12px">
        {note && <Text fontSize="11px" color={COLORS.muted}>{note}</Text>}
        {rows.length === 0 && <Text fontSize="12px" color={COLORS.muted}>Belum ada. Klik "{addLabel}".</Text>}
        {rows.map((row, i) => (
          <Box key={i} border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="12px">
            <Flex justify="flex-end" mb="-8px"><IconButton size="xs" variant="ghost" colorPalette="red" aria-label="Hapus" onClick={() => remove(i)}><Icon as={LuTrash2} /></IconButton></Flex>
            <Stack gap="10px">{fields.map((fld) => renderField(row, i, fld))}</Stack>
          </Box>
        ))}
        <Flex gap="10px" align="center" wrap="wrap">
          <Button size="sm" variant="outline" onClick={add}><Icon as={LuPlus} /> {addLabel}</Button>
          <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={saving} onClick={save}><Icon as={LuSave} /> Simpan</Button>
          {err && <Text color={COLORS.danger} fontSize="12px">{err}</Text>}
          {msg && <Text color={COLORS.success} fontSize="12px">{msg}</Text>}
        </Flex>
      </Stack>
    </Card>
  )
}
