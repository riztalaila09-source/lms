import { useEffect, useState } from 'react'
import { Box, Button, Field, Flex, Icon, Image, Input, NativeSelect, SimpleGrid, Stack, Tabs, Text, Textarea } from '@chakra-ui/react'
import { LuUser, LuSave, LuKeyRound, LuLock, LuQuote, LuShieldCheck, LuDatabase, LuCheck, LuX, LuDownload, LuContact } from 'react-icons/lu'
import { userClient, schoolClient, parentClient } from '@/lib/client'
import type { Parent } from '@/gen/parent/v1/parent_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/permissions'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import { COLORS } from '@/theme/tokens'

// Resources that teachers can edit/delete, controlled centrally by admin.
// Keys mirror the backend `procedureCapabilities` map ("<resource>.<action>").
const ACCESS_RESOURCES: { key: string; label: string; edit: boolean; del: boolean }[] = [
  { key: 'materi', label: 'Materi Umum', edit: true, del: true },
  { key: 'mapel', label: 'Mata Pelajaran', edit: true, del: true },
  { key: 'tugas', label: 'Tugas / Kuis / Praktikum', edit: true, del: true },
  { key: 'nilai', label: 'Nilai (penilaian)', edit: true, del: false },
  { key: 'absensi', label: 'Absensi', edit: true, del: true },
  { key: 'pkl', label: 'Mitra PKL', edit: true, del: true },
  { key: 'pengguna', label: 'Data Pengguna (Murid / Guru / Orang Tua)', edit: false, del: true },
]

export default function PengaturanPage() {
  const { user, loadProfile } = useAuth()
  const admin = isAdmin(user)

  const isTeacher = user?.role === Role.TEACHER
  const isStudent = user?.role === Role.STUDENT

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [myParent, setMyParent] = useState<Parent | null>(null)

  const [story, setStory] = useState('')
  const [storyMsg, setStoryMsg] = useState('')
  const [savingStory, setSavingStory] = useState(false)

  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [passErr, setPassErr] = useState('')
  const [savingPass, setSavingPass] = useState(false)

  // Hak Akses: set of DENIED capability keys ("<resource>.edit" / "<resource>.delete").
  const [denied, setDenied] = useState<Set<string>>(new Set())
  const [savingAccess, setSavingAccess] = useState(false)
  const [accessMsg, setAccessMsg] = useState('')

  const [backupMsg, setBackupMsg] = useState('')
  const [backupErr, setBackupErr] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName(user.fullName)
      setUsername(user.username)
      setEmail(user.email)
      setPhone(user.phone || '')
      setGender(user.gender || '')
      setPhotoUrl(user.photoUrl)
      setStory(user.story || '')
    }
  }, [user])

  // Murid: tampilkan data orang tua (read-only).
  useEffect(() => {
    if (!isStudent) return
    parentClient.getMyParent({}).then((p) => setMyParent(p.id ? p : null)).catch(() => setMyParent(null))
  }, [isStudent])

  useEffect(() => {
    if (!admin) return
    schoolClient.getAccessPolicy({}).then((r) => setDenied(new Set(r.deniedKeys))).catch(() => {})
  }, [admin])

  const saveStory = async (e: React.FormEvent) => {
    e.preventDefault()
    setStoryMsg('')
    setSavingStory(true)
    try {
      await userClient.updateProfile({ story })
      await loadProfile()
      setStoryMsg('Cerita berhasil disimpan.')
    } catch (err: unknown) {
      setStoryMsg(err instanceof Error ? err.message : 'Gagal menyimpan cerita')
    } finally {
      setSavingStory(false)
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg('')
    setProfileErr('')
    setSavingProfile(true)
    try {
      await userClient.updateProfile({ fullName, username, email, photoUrl, phone, gender })
      await loadProfile()
      setProfileMsg('Profil berhasil disimpan.')
    } catch (err: unknown) {
      setProfileErr(err instanceof Error ? err.message : 'Gagal menyimpan profil')
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg('')
    setPassErr('')
    if (newPass !== newPass2) {
      setPassErr('Konfirmasi password tidak cocok.')
      return
    }
    if (newPass.length < 6) {
      setPassErr('Password baru minimal 6 karakter.')
      return
    }
    setSavingPass(true)
    try {
      await userClient.changePassword({ currentPassword: curPass, newPassword: newPass })
      setPassMsg('Password berhasil diganti.')
      setCurPass('')
      setNewPass('')
      setNewPass2('')
    } catch (err: unknown) {
      setPassErr(err instanceof Error ? err.message : 'Gagal mengganti password')
    } finally {
      setSavingPass(false)
    }
  }

  const isAllowed = (key: string) => !denied.has(key)
  const toggle = (key: string) => setDenied((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const saveAccess = async () => {
    setSavingAccess(true)
    setAccessMsg('')
    try {
      const r = await schoolClient.setAccessPolicy({ deniedKeys: [...denied] })
      setDenied(new Set(r.deniedKeys))
      setAccessMsg('Hak akses tersimpan.')
    } catch (err: unknown) {
      setAccessMsg(err instanceof Error ? err.message : 'Gagal menyimpan hak akses')
    } finally {
      setSavingAccess(false)
    }
  }

  const downloadBackup = async () => {
    setDownloading(true)
    setBackupErr('')
    setBackupMsg('')
    try {
      const res = await schoolClient.exportBackup({})
      const blob = new Blob([res.data as BlobPart], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename || 'lms-backup.db'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setBackupMsg(`Backup terunduh: ${res.filename} (${(res.data.length / 1024 / 1024).toFixed(2)} MB).`)
    } catch (err: unknown) {
      setBackupErr(err instanceof Error ? err.message : 'Gagal membuat backup')
    } finally {
      setDownloading(false)
    }
  }

  const initials = (fullName || username || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Allow/deny toggle cell.
  const Toggle = ({ cap, on }: { cap: string; on: boolean }) => (
    on
      ? <Flex as="button" onClick={() => toggle(cap)} align="center" gap="6px" px="10px" py="6px" borderRadius="8px"
          bg="#DCFCE7" color={COLORS.success} border="1px solid" borderColor={COLORS.success} cursor="pointer" fontSize="12px" fontWeight="600">
          <Icon as={LuCheck} boxSize="15px" /> Diizinkan
        </Flex>
      : <Flex as="button" onClick={() => toggle(cap)} align="center" gap="6px" px="10px" py="6px" borderRadius="8px"
          bg={COLORS.bg} color={COLORS.muted} border="1px solid" borderColor={COLORS.border} cursor="pointer" fontSize="12px" fontWeight="600">
          <Icon as={LuX} boxSize="15px" /> Ditolak
        </Flex>
  )

  return (
    <AppLayout title="Pengaturan" subtitle="Kelola akun, hak akses, dan backup">
      <Tabs.Root defaultValue="profil" maxW="960px">
        <Tabs.List>
          <Tabs.Trigger value="profil"><Icon as={LuUser} /> Profil</Tabs.Trigger>
          <Tabs.Trigger value="password"><Icon as={LuKeyRound} /> Password</Tabs.Trigger>
          <Tabs.Trigger value="cerita"><Icon as={LuQuote} /> Cerita</Tabs.Trigger>
          {admin && <Tabs.Trigger value="akses"><Icon as={LuShieldCheck} /> Hak Akses</Tabs.Trigger>}
          {admin && <Tabs.Trigger value="backup"><Icon as={LuDatabase} /> Backup</Tabs.Trigger>}
        </Tabs.List>

        {/* Profil */}
        <Tabs.Content value="profil">
          <Stack gap="16px" maxW="720px">
          <Card title={<><Icon as={LuUser} /> Profil & Foto</>}>
            <form onSubmit={saveProfile}>
              <Stack gap="14px">
                <Flex align="center" gap="14px">
                  {photoUrl ? (
                    <Image src={photoUrl} alt="foto" w="64px" h="64px" borderRadius="full" objectFit="cover" border="2px solid" borderColor={COLORS.border} />
                  ) : (
                    <Flex w="64px" h="64px" borderRadius="full" bg={COLORS.primary} color="white" align="center" justify="center" fontSize="22px" fontWeight="bold">{initials}</Flex>
                  )}
                  <Box flex={1}>
                    <Field.Root>
                      <Field.Label fontSize="12px">URL Foto Profil</Field.Label>
                      <Input size="sm" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://… (tautan gambar)" />
                    </Field.Root>
                  </Box>
                </Flex>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
                  <Field.Root><Field.Label fontSize="12px">Nama Lengkap</Field.Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">Username (untuk login)</Field.Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">Email</Field.Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">No. HP / WhatsApp</Field.Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">Jenis Kelamin</Field.Label>
                    <NativeSelect.Root><NativeSelect.Field value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">—</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                    </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
                  {isStudent && <Field.Root><Field.Label fontSize="12px">Kelas <Text as="span" color={COLORS.muted} fontSize="10px">(diatur admin)</Text></Field.Label><Input value={user?.kelas || '-'} readOnly bg={COLORS.bg} /></Field.Root>}
                  {isStudent && <Field.Root><Field.Label fontSize="12px">Jurusan <Text as="span" color={COLORS.muted} fontSize="10px">(diatur admin)</Text></Field.Label><Input value={user?.jurusan || '-'} readOnly bg={COLORS.bg} /></Field.Root>}
                  {isTeacher && <Field.Root><Field.Label fontSize="12px">Mapel <Text as="span" color={COLORS.muted} fontSize="10px">(diatur admin)</Text></Field.Label><Input value={user?.mapel || '-'} readOnly bg={COLORS.bg} /></Field.Root>}
                </SimpleGrid>
                {profileErr && <Text color={COLORS.danger} fontSize="12px">{profileErr}</Text>}
                {profileMsg && <Text color={COLORS.success} fontSize="12px">{profileMsg}</Text>}
                <Button type="submit" alignSelf="flex-start" loading={savingProfile} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan Profil</Button>
              </Stack>
            </form>
          </Card>

          {/* Data Orang Tua (murid) — read-only */}
          {isStudent && (
            <Card title={<><Icon as={LuContact} /> Data Orang Tua / Wali</>}>
              {myParent ? (
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
                  <Field.Root><Field.Label fontSize="12px">Nama Orang Tua / Wali</Field.Label><Input value={myParent.namaOrtu || '-'} readOnly bg={COLORS.bg} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">Hubungan</Field.Label><Input value={myParent.hubungan || '-'} readOnly bg={COLORS.bg} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">No. HP / WhatsApp</Field.Label><Input value={myParent.phone || '-'} readOnly bg={COLORS.bg} /></Field.Root>
                  <Field.Root><Field.Label fontSize="12px">Alamat</Field.Label><Input value={myParent.alamat || '-'} readOnly bg={COLORS.bg} /></Field.Root>
                </SimpleGrid>
              ) : (
                <Text fontSize="13px" color={COLORS.muted}>Belum ada data orang tua yang tertaut. Hubungi admin / guru untuk menautkan.</Text>
              )}
              <Text fontSize="11px" color={COLORS.muted} mt="10px">Data orang tua hanya bisa diubah oleh admin/guru (di menu Pengguna → Orang Tua).</Text>
            </Card>
          )}
          </Stack>
        </Tabs.Content>

        {/* Password */}
        <Tabs.Content value="password">
          <Card title={<><Icon as={LuKeyRound} /> Ganti Password</>}>
            <form onSubmit={savePassword}>
              <Stack gap="12px" maxW="420px">
                <Field.Root><Field.Label fontSize="12px">Password Saat Ini</Field.Label><Input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required /></Field.Root>
                <Field.Root><Field.Label fontSize="12px">Password Baru</Field.Label><Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required /></Field.Root>
                <Field.Root><Field.Label fontSize="12px">Konfirmasi Password Baru</Field.Label><Input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} required /></Field.Root>
                {passErr && <Text color={COLORS.danger} fontSize="12px">{passErr}</Text>}
                {passMsg && <Text color={COLORS.success} fontSize="12px">{passMsg}</Text>}
                <Button type="submit" alignSelf="flex-start" loading={savingPass} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuLock} /> Ganti Password</Button>
              </Stack>
            </form>
          </Card>
        </Tabs.Content>

        {/* Cerita */}
        <Tabs.Content value="cerita">
          <Card title={<><Icon as={LuQuote} /> Cerita Saya</>}>
            <form onSubmit={saveStory}>
              <Stack gap="10px" maxW="640px">
                <Text fontSize="12px" color={COLORS.muted}>Ceritakan pengalaman belajarmu. Cerita ini tampil di halaman Beranda dan bisa kamu ubah kapan saja.</Text>
                <Textarea rows={5} value={story} onChange={(e) => setStory(e.target.value)} placeholder="Contoh: Belajar di sini membuat saya lebih paham jaringan komputer…" maxLength={600} />
                <Flex justify="space-between" align="center">
                  <Text fontSize="11px" color={COLORS.muted}>{story.length}/600 karakter</Text>
                  {storyMsg && <Text fontSize="12px" color={storyMsg.includes('berhasil') ? COLORS.success : COLORS.danger}>{storyMsg}</Text>}
                </Flex>
                <Button type="submit" alignSelf="flex-start" loading={savingStory} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan Cerita</Button>
              </Stack>
            </form>
          </Card>
        </Tabs.Content>

        {/* Hak Akses (admin) */}
        {admin && (
          <Tabs.Content value="akses">
            <Card title={<><Icon as={LuShieldCheck} /> Hak Akses Guru</>}>
              <Stack gap="14px">
                <Text fontSize="12px" color={COLORS.muted}>
                  Kontrol terpusat izin <b>Edit</b> dan <b>Hapus</b> untuk <b>semua guru</b> (berlaku di atas izin menu per-guru). Admin tidak terpengaruh. Secara bawaan semua diizinkan.
                </Text>
                <Box overflowX="auto">
                  <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
                    <Box as="thead">
                      <Box as="tr" borderBottom="1px solid" borderColor={COLORS.border}>
                        <Box as="th" textAlign="left" p="8px" fontSize="12px" color={COLORS.muted}>Menu / Data</Box>
                        <Box as="th" textAlign="left" p="8px" fontSize="12px" color={COLORS.muted}>Edit</Box>
                        <Box as="th" textAlign="left" p="8px" fontSize="12px" color={COLORS.muted}>Hapus</Box>
                      </Box>
                    </Box>
                    <Box as="tbody">
                      {ACCESS_RESOURCES.map((r) => (
                        <Box as="tr" key={r.key} borderBottom="1px solid" borderColor={COLORS.border}>
                          <Box as="td" p="8px" fontSize="13px" fontWeight="600" color={COLORS.text}>{r.label}</Box>
                          <Box as="td" p="8px">{r.edit ? <Toggle cap={`${r.key}.edit`} on={isAllowed(`${r.key}.edit`)} /> : <Text fontSize="12px" color={COLORS.muted}>—</Text>}</Box>
                          <Box as="td" p="8px">{r.del ? <Toggle cap={`${r.key}.delete`} on={isAllowed(`${r.key}.delete`)} /> : <Text fontSize="12px" color={COLORS.muted}>—</Text>}</Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
                <Flex align="center" gap="12px">
                  <Button loading={savingAccess} onClick={saveAccess} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan Hak Akses</Button>
                  {accessMsg && <Text fontSize="12px" color={accessMsg.includes('tersimpan') ? COLORS.success : COLORS.danger}>{accessMsg}</Text>}
                </Flex>
              </Stack>
            </Card>
          </Tabs.Content>
        )}

        {/* Backup (admin) */}
        {admin && (
          <Tabs.Content value="backup">
            <Card title={<><Icon as={LuDatabase} /> Backup Database</>}>
              <Stack gap="14px" maxW="640px">
                <Text fontSize="13px" color={COLORS.muted}>
                  Unduh salinan (snapshot) database secara utuh dan konsisten. Simpan file <b>.db</b> ini di tempat aman sebagai cadangan. Untuk memulihkan, ganti file database server dengan file hasil unduhan lalu mulai ulang server.
                </Text>
                <SimpleGrid columns={{ base: 1, sm: 2 }} gap="12px">
                  <Button loading={downloading} onClick={downloadBackup} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuDownload} /> Unduh Backup</Button>
                </SimpleGrid>
                {backupErr && <Text fontSize="12px" color={COLORS.danger}>{backupErr}</Text>}
                {backupMsg && <Text fontSize="12px" color={COLORS.success}>{backupMsg}</Text>}
              </Stack>
            </Card>
          </Tabs.Content>
        )}
      </Tabs.Root>
    </AppLayout>
  )
}
