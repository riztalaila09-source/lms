import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, Flex, Grid, Icon, IconButton, Image, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { LuVolume2, LuVolumeX, LuPlay, LuEye, LuArrowRight, LuTrophy, LuUsers, LuCheck } from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import type { Assignment } from '@/gen/assignment/v1/assignment_pb'
import { gameClient, schoolClient } from '@/lib/client'
import { gameAudio } from '@/lib/gameAudio'
import { useGamePoll } from '@/hooks/useGamePoll'
import { tile } from './gameTiles'
import PlayerAvatar from './PlayerAvatar'

export default function GameHost({ assignment, open, onClose }: { assignment: Assignment | null; open: boolean; onClose: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [createErr, setCreateErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [muted, setMutedState] = useState(gameAudio.muted)
  const [, setTick] = useState(0)
  const createdFor = useRef<string | null>(null)
  const prevKey = useRef('')

  const { state, serverNow } = useGamePoll(sessionId)

  // Create the game once per opened assignment.
  useEffect(() => {
    if (!open || !assignment) return
    if (createdFor.current === assignment.id) return
    createdFor.current = assignment.id
    gameAudio.init()
    // Use the school's uploaded soundtrack if any, else synthesized music.
    schoolClient.getSchool({}).then((s) => gameAudio.setMusicSrc(s.hasGameMusic ? '/game-music' : null)).catch(() => {})
    gameClient.createGame({ assignmentId: assignment.id, durationSeconds: 20 })
      .then((r) => { setSessionId(r.sessionId); setPin(r.pin) })
      .catch((e) => setCreateErr(e instanceof Error ? e.message : 'Gagal membuat game'))
  }, [open, assignment])

  useEffect(() => {
    if (!open) { setSessionId(null); setPin(''); setCreateErr(''); createdFor.current = null; prevKey.current = ''; gameAudio.stopLoop() }
  }, [open])

  useEffect(() => {
    if (state?.status !== 'question') return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [state?.status])

  // Sound transitions.
  useEffect(() => {
    if (!state) return
    const key = `${state.status}:${state.currentIndex}`
    if (key === prevKey.current) return
    prevKey.current = key
    if (state.status === 'lobby') gameAudio.lobby()
    else if (state.status === 'question') gameAudio.question()
    else if (state.status === 'reveal') { gameAudio.stopLoop(); gameAudio.reveal() }
    else if (state.status === 'ended') { gameAudio.stopLoop(); gameAudio.podium() }
  }, [state])

  const remaining = useMemo(() => {
    if (!state || state.status !== 'question' || !state.currentStartedAt) return 0
    const end = timestampDate(state.currentStartedAt).getTime() + state.durationSeconds * 1000
    return Math.max(0, Math.ceil((end - serverNow()) / 1000))
  }, [state, serverNow])

  const control = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const start = (index: number) => control(() => gameClient.startQuestion({ sessionId: sessionId!, index }))
  const reveal = () => control(() => gameClient.revealQuestion({ sessionId: sessionId! }))
  const end = () => control(() => gameClient.endGame({ sessionId: sessionId! }))

  const toggleMute = () => setMutedState(gameAudio.toggleMute())
  const close = () => { gameAudio.stopLoop(); onClose() }

  const maxDist = Math.max(1, ...(state?.answerDistribution ?? [1]))

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) close() }} size="full">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="#1B1440" color="white">
          <Dialog.CloseTrigger />
          <Dialog.Body p={0} position="relative">
            <IconButton aria-label="Suara" size="sm" variant="ghost" color="whiteAlpha.900" onClick={toggleMute} position="absolute" top="12px" right="52px">
              <Icon as={muted ? LuVolumeX : LuVolume2} />
            </IconButton>

            {createErr && <Flex minH="80vh" align="center" justify="center"><Text color="#FCA5A5" fontSize="16px">{createErr}</Text></Flex>}

            {/* Lobby */}
            {!createErr && state?.status === 'lobby' && (
              <Flex direction="column" minH="90vh" align="center" justify="center" p="20px" gap="16px">
                <Text fontSize="18px" color="whiteAlpha.800">{state.assignmentTitle}</Text>
                <Text fontSize="16px" color="whiteAlpha.700">PIN Game — buka menu Tugas ▸ Gabung Game</Text>
                <Text fontSize="72px" fontWeight="900" letterSpacing="12px" lineHeight="1">{pin}</Text>
                <Flex align="center" gap="8px" color="whiteAlpha.900"><Icon as={LuUsers} /><Text fontSize="18px" fontWeight="700">{state.playerCount} pemain</Text></Flex>
                <SimpleGrid columns={{ base: 2, md: 4 }} gap="8px" w="full" maxW="720px">
                  {state.leaderboard.map((p) => (
                    <Flex key={p.playerId} bg="whiteAlpha.200" px="12px" py="8px" borderRadius="8px" align="center" gap="8px">
                      <PlayerAvatar nickname={p.nickname} avatar={p.avatar} size={28} />
                      <Text fontWeight="700" lineClamp={1}>{p.nickname}</Text>
                    </Flex>
                  ))}
                </SimpleGrid>
                <Button size="lg" bg="#26890C" color="white" _hover={{ bg: '#1C6B08' }} loading={busy} disabled={state.playerCount === 0} onClick={() => start(0)}>
                  <Icon as={LuPlay} /> Mulai Game
                </Button>
              </Flex>
            )}

            {/* Question / Reveal share the question + options layout */}
            {!createErr && (state?.status === 'question' || state?.status === 'reveal') && (
              <Flex direction="column" minH="90vh" p="20px" gap="14px">
                <Flex justify="space-between" align="center">
                  <Text fontWeight="700" fontSize="18px">Soal {state.currentIndex + 1}/{state.questionCount}</Text>
                  {state.status === 'question'
                    ? <Flex align="center" justify="center" boxSize="60px" borderRadius="full" bg={remaining <= 5 ? '#E21B3C' : 'whiteAlpha.300'} fontWeight="800" fontSize="26px">{remaining}</Flex>
                    : <Flex align="center" gap="6px" color="#4ADE80"><Icon as={LuCheck} /><Text fontWeight="700">Jawaban benar ditandai</Text></Flex>}
                  <Flex align="center" gap="6px"><Icon as={LuUsers} /><Text fontWeight="700">{state.answeredCount}/{state.playerCount}</Text></Flex>
                </Flex>

                <Box textAlign="center">
                  <Text fontSize="26px" fontWeight="800" mb="8px">{state.question}</Text>
                  {state.image && <Image src={state.image} alt="" maxH="34vh" mx="auto" borderRadius="12px" />}
                </Box>

                <Grid templateColumns="1fr 1fr" gap="12px" flex="1">
                  {state.options.map((o, i) => {
                    const t = tile(i)
                    const isCorrect = state.status === 'reveal' && state.correctIndex === i
                    const dimmed = state.status === 'reveal' && state.correctIndex !== i
                    return (
                      <Flex key={i} bg={t.color} opacity={dimmed ? 0.4 : 1} borderRadius="12px" p="16px" align="center" gap="14px" minH="90px"
                        color="white" border={isCorrect ? '4px solid white' : '4px solid transparent'}>
                        <Icon as={t.icon} boxSize="30px" flexShrink={0} />
                        <Text fontSize="22px" fontWeight="700" flex="1" lineClamp={3}>{o}</Text>
                        {state.status === 'reveal' && <Text fontSize="20px" fontWeight="800">{state.answerDistribution?.[i] ?? 0}</Text>}
                        {isCorrect && <Icon as={LuCheck} boxSize="26px" />}
                      </Flex>
                    )
                  })}
                </Grid>

                {/* Distribution + leaderboard on reveal */}
                {state.status === 'reveal' && (
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="14px">
                    <Stack gap="6px">
                      {state.options.map((_, i) => (
                        <Flex key={i} align="center" gap="8px">
                          <Icon as={tile(i).icon} color={tile(i).color} />
                          <Box flex="1" bg="whiteAlpha.200" borderRadius="6px" h="18px" overflow="hidden">
                            <Box bg={tile(i).color} h="full" w={`${((state.answerDistribution?.[i] ?? 0) / maxDist) * 100}%`} />
                          </Box>
                          <Text fontSize="13px" w="28px" textAlign="right">{state.answerDistribution?.[i] ?? 0}</Text>
                        </Flex>
                      ))}
                    </Stack>
                    <Stack gap="4px">
                      <Text fontWeight="700" mb="2px">Papan Peringkat</Text>
                      {state.leaderboard.slice(0, 5).map((p) => (
                        <Flex key={p.playerId} justify="space-between" align="center" gap="8px" bg="whiteAlpha.200" px="10px" py="6px" borderRadius="6px">
                          <Flex align="center" gap="8px" minW={0}><PlayerAvatar nickname={p.nickname} avatar={p.avatar} size={26} /><Text fontWeight="700" lineClamp={1}>{p.rank}. {p.nickname}</Text></Flex>
                          <Text fontWeight="700">{p.score}</Text>
                        </Flex>
                      ))}
                    </Stack>
                  </SimpleGrid>
                )}

                <Flex justify="center" gap="10px">
                  {state.status === 'question' && <Button size="lg" bg="whiteAlpha.300" color="white" _hover={{ bg: 'whiteAlpha.400' }} loading={busy} onClick={reveal}><Icon as={LuEye} /> Lihat Jawaban</Button>}
                  {state.status === 'reveal' && (state.currentIndex + 1 < state.questionCount
                    ? <Button size="lg" bg="#26890C" color="white" _hover={{ bg: '#1C6B08' }} loading={busy} onClick={() => start(state.currentIndex + 1)}><Icon as={LuArrowRight} /> Soal Berikutnya</Button>
                    : <Button size="lg" bg="#D89E00" color="white" _hover={{ bg: '#A87C00' }} loading={busy} onClick={end}><Icon as={LuTrophy} /> Lihat Podium</Button>)}
                </Flex>
              </Flex>
            )}

            {/* Ended — podium */}
            {!createErr && state?.status === 'ended' && (
              <Flex direction="column" minH="90vh" align="center" justify="center" p="20px" gap="14px">
                <Icon as={LuTrophy} boxSize="70px" color="#FDE047" />
                <Text fontSize="34px" fontWeight="900">Papan Peringkat Akhir</Text>
                <SimpleGrid columns={1} gap="8px" w="full" maxW="520px">
                  {state.leaderboard.slice(0, 10).map((p) => (
                    <Flex key={p.playerId} justify="space-between" align="center" gap="10px" bg={p.rank <= 3 ? '#D89E00' : 'whiteAlpha.200'} px="16px" py="12px" borderRadius="10px">
                      <Flex align="center" gap="10px" minW={0}><PlayerAvatar nickname={p.nickname} avatar={p.avatar} size={34} /><Text fontWeight="800" fontSize="18px" lineClamp={1}>{p.rank}. {p.nickname}</Text></Flex>
                      <Text fontWeight="800" fontSize="18px">{p.score}</Text>
                    </Flex>
                  ))}
                </SimpleGrid>
                <Button mt="8px" size="lg" bg="whiteAlpha.300" color="white" _hover={{ bg: 'whiteAlpha.400' }} onClick={close}>Tutup</Button>
              </Flex>
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
