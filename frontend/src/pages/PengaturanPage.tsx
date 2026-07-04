import { useEffect, useState } from 'react'
import { Box, Button, Field, Flex, Icon, Image, Input, SimpleGrid, Stack, Text, Textarea } from '@chakra-ui/react'
import { LuUser, LuSave, LuKeyRound, LuLock, LuQuote } from 'react-icons/lu'
import { userClient } from '@/lib/client'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import { COLORS } from '@/theme/tokens'

export default function PengaturanPage() {
  const { user, loadProfile } = useAuth()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [story, setStory] = useState('')
  const [storyMsg, setStoryMsg] = useState('')
  const [savingStory, setSavingStory] = useState(false)

  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [passErr, setPassErr] = useState('')
  const [savingPass, setSavingPass] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName(user.fullName)
      setUsername(user.username)
      setEmail(user.email)
      setPhotoUrl(user.photoUrl)
      setStory(user.story || '')
    }
  }, [user])

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
      await userClient.updateProfile({ fullName, username, email, photoUrl })
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

  const initials = (fullName || username || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <AppLayout title="Pengaturan Akun" subtitle="Kelola profil, foto, dan password Anda">
     <Stack gap="16px" maxW="900px">
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="16px">
        <Card title={<><Icon as={LuUser} /> Profil & Foto</>}>
          <form onSubmit={saveProfile}>
            <Stack gap="12px">
              <Flex align="center" gap="14px">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt="foto"
                    w="64px"
                    h="64px"
                    borderRadius="full"
                    objectFit="cover"
                    border="2px solid"
                    borderColor={COLORS.border}
                  />
                ) : (
                  <Flex
                    w="64px"
                    h="64px"
                    borderRadius="full"
                    bg={COLORS.primary}
                    color="white"
                    align="center"
                    justify="center"
                    fontSize="22px"
                    fontWeight="bold"
                  >
                    {initials}
                  </Flex>
                )}
                <Box flex={1}>
                  <Field.Root>
                    <Field.Label fontSize="12px">URL Foto Profil</Field.Label>
                    <Input
                      size="sm"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      placeholder="https://… (tautan gambar)"
                    />
                  </Field.Root>
                </Box>
              </Flex>

              <Field.Root>
                <Field.Label fontSize="12px">Nama Lengkap</Field.Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="12px">Username (untuk login)</Field.Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="12px">Email</Field.Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field.Root>

              {profileErr && <Text color={COLORS.danger} fontSize="12px">{profileErr}</Text>}
              {profileMsg && <Text color={COLORS.success} fontSize="12px">{profileMsg}</Text>}

              <Button type="submit" loading={savingProfile} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>
<Icon as={LuSave} /> Simpan Profil
              </Button>
            </Stack>
          </form>
        </Card>

        <Card title={<><Icon as={LuKeyRound} /> Ganti Password</>}>
          <form onSubmit={savePassword}>
            <Stack gap="12px">
              <Field.Root>
                <Field.Label fontSize="12px">Password Saat Ini</Field.Label>
                <Input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="12px">Password Baru</Field.Label>
                <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="12px">Konfirmasi Password Baru</Field.Label>
                <Input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} required />
              </Field.Root>

              {passErr && <Text color={COLORS.danger} fontSize="12px">{passErr}</Text>}
              {passMsg && <Text color={COLORS.success} fontSize="12px">{passMsg}</Text>}

              <Button type="submit" loading={savingPass} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>
<Icon as={LuLock} /> Ganti Password
              </Button>
            </Stack>
          </form>
        </Card>
      </SimpleGrid>

      {/* Cerita — editable testimonial shown on the home page */}
      <Card title={<><Icon as={LuQuote} /> Cerita Saya</>}>
        <form onSubmit={saveStory}>
          <Stack gap="10px">
            <Text fontSize="12px" color={COLORS.muted}>
              Ceritakan pengalaman belajarmu. Cerita ini tampil di halaman Beranda dan bisa kamu ubah kapan saja.
            </Text>
            <Textarea
              rows={5}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Contoh: Belajar di sini membuat saya lebih paham jaringan komputer…"
              maxLength={600}
            />
            <Flex justify="space-between" align="center">
              <Text fontSize="11px" color={COLORS.muted}>{story.length}/600 karakter</Text>
              {storyMsg && <Text fontSize="12px" color={storyMsg.includes('berhasil') ? COLORS.success : COLORS.danger}>{storyMsg}</Text>}
            </Flex>
            <Button type="submit" alignSelf="flex-start" loading={savingStory} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>
              <Icon as={LuSave} /> Simpan Cerita
            </Button>
          </Stack>
        </form>
      </Card>
     </Stack>
    </AppLayout>
  )
}
