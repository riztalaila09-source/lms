import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, Flex, Grid, Icon, IconButton, Image, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { LuVolume2, LuVolumeX, LuCheck, LuX, LuTrophy, LuGamepad2 } from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { gameClient, schoolClient } from '@/lib/client'
import { gameAudio } from '@/lib/gameAudio'
import { useGamePoll } from '@/hooks/useGamePoll'
import { useAuth } from '@/hooks/useAuth'
import { tile } from './gameTiles'
import PlayerAvatar from './PlayerAvatar'

export default function GamePlayer({ open, onClose, defaultPin = '' }: { open: boolean; onClose: () => void; defaultPin?: string }) {
  const { user } = useAuth()
  const [pin, setPin] = useState(defaultPin)
  const [nickname, setNickname] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState('')
  const [answeredIdx, setAnsweredIdx] = useState(-1)
  const [muted, setMutedState] = useState(gameAudio.muted)
  const [, setTick] = useState(0)
  const prevKey = useRef('')

  useEffect(() => { if (open) { setNickname(user?.fullName || '') ; setPin(defaultPin) } }, [open, user, defaultPin])

  const { state, serverNow } = useGamePoll(sessionId)

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) { setSessionId(null); setAnsweredIdx(-1); setJoinErr(''); gameAudio.stopLoop() }
  }, [open])

  // Smooth countdown: re-render 4x/sec while a question is live.
  useEffect(() => {
    if (state?.status !== 'question') return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [state?.status])

  // Sound transitions (once per status/question change).
  useEffect(() => {
    if (!state) return
    const key = `${state.status}:${state.currentIndex}`
    if (key === prevKey.current) return
    prevKey.current = key
    if (state.status === 'lobby') gameAudio.lobby()
    else if (state.status === 'question') { setAnsweredIdx(-1); gameAudio.question() }
    else if (state.status === 'reveal') {
      gameAudio.stopLoop()
      gameAudio.reveal()
      if (state.myResult?.answered) (state.myResult.isCorrect ? gameAudio.correct() : gameAudio.wrong())
    } else if (state.status === 'ended') { gameAudio.stopLoop(); gameAudio.podium() }
  }, [state])

  const join = async () => {
    if (!pin.trim()) { setJoinErr('Masukkan PIN.'); return }
    setJoining(true); setJoinErr('')
    gameAudio.init(); gameAudio.join()
    schoolClient.getSchool({}).then((s) => gameAudio.setMusicSrc(s.hasGameMusic ? '/game-music' : null)).catch(() => {})
    try {
      const r = await gameClient.joinGame({ pin: pin.trim(), nickname: nickname.trim() })
      setSessionId(r.sessionId)
    } catch (e) { setJoinErr(e instanceof Error ? e.message : 'Gagal bergabung') }
    finally { setJoining(false) }
  }

  const remaining = useMemo(() => {
    if (!state || state.status !== 'question' || !state.currentStartedAt) return 0
    const end = timestampDate(state.currentStartedAt).getTime() + state.durationSeconds * 1000
    return Math.max(0, Math.ceil((end - serverNow()) / 1000))
  }, [state, serverNow])

  const answer = async (optionIndex: number) => {
    if (!state || !sessionId || state.status !== 'question') return
    if (answeredIdx >= 0 || remaining <= 0) return
    setAnsweredIdx(optionIndex)
    gameAudio.tap()
    try { await gameClient.submitGameAnswer({ sessionId, questionIndex: state.currentIndex, optionIndex }) }
    catch { /* ignore — reveal will show the truth */ }
  }

  const toggleMute = () => setMutedState(gameAudio.toggleMute())
  const close = () => { gameAudio.stopLoop(); onClose() }

  const MuteBtn = (
    <IconButton aria-label="Suara" size="sm" variant="ghost" color="whiteAlpha.900" onClick={toggleMute} position="absolute" top="12px" right="52px">
      <Icon as={muted ? LuVolumeX : LuVolume2} />
    </IconButton>
  )

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) close() }} size="full">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="#241C4A" color="white">
          <Dialog.CloseTrigger />
          <Dialog.Body p={0} position="relative">
            {MuteBtn}

            {/* Join screen */}
            {!sessionId && (
              <Flex minH="80vh" align="center" justify="center" p="20px">
                <Stack gap="16px" w="full" maxW="360px" textAlign="center">
                  <Flex align="center" justify="center" gap="8px"><Icon as={LuGamepad2} boxSize="30px" /><Text fontSize="26px" fontWeight="800">Gabung Game</Text></Flex>
                  <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN Game"
                    textAlign="center" fontSize="28px" letterSpacing="8px" fontWeight="800" bg="whiteAlpha.200" borderColor="whiteAlpha.400" _placeholder={{ color: 'whiteAlpha.600' }} h="60px" />
                  <Input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 20))} placeholder="Nama panggilan"
                    textAlign="center" fontSize="16px" bg="whiteAlpha.200" borderColor="whiteAlpha.400" _placeholder={{ color: 'whiteAlpha.600' }} />
                  {joinErr && <Text color="#FCA5A5" fontSize="13px">{joinErr}</Text>}
                  <Button size="lg" bg="#26890C" color="white" _hover={{ bg: '#1C6B08' }} loading={joining} onClick={join}>Gabung</Button>
                </Stack>
              </Flex>
            )}

            {/* Lobby */}
            {sessionId && state?.status === 'lobby' && (
              <Flex minH="80vh" align="center" justify="center" p="20px">
                <Stack gap="10px" textAlign="center" align="center">
                  <PlayerAvatar nickname={nickname || user?.fullName || 'Pemain'} avatar={user?.photoUrl} size={72} />
                  <Text fontSize="24px" fontWeight="800">Kamu sudah masuk!</Text>
                  <Text fontSize="15px" color="whiteAlpha.900">{nickname || user?.fullName}</Text>
                  <Text fontSize="15px" color="whiteAlpha.800">Tunggu host memulai game…</Text>
                  <Text fontSize="14px" color="whiteAlpha.700">{state.playerCount} pemain bergabung</Text>
                </Stack>
              </Flex>
            )}

            {/* Question */}
            {sessionId && state?.status === 'question' && (
              <Flex direction="column" minH="90vh" p="16px" gap="12px">
                <Flex justify="space-between" align="center">
                  <Text fontWeight="700">Soal {state.currentIndex + 1}/{state.questionCount}</Text>
                  <Flex align="center" justify="center" boxSize="52px" borderRadius="full" bg={remaining <= 5 ? '#E21B3C' : 'whiteAlpha.300'} fontWeight="800" fontSize="22px">{remaining}</Flex>
                  <Text fontWeight="700">{state.myResult?.totalScore ?? 0}</Text>
                </Flex>
                <Box flex="0 0 auto" textAlign="center">
                  <Text fontSize="20px" fontWeight="700" mb="8px">{state.question}</Text>
                  {state.image && <Image src={state.image} alt="" maxH="30vh" mx="auto" borderRadius="10px" />}
                </Box>
                {answeredIdx >= 0 ? (
                  <Flex flex="1" align="center" justify="center"><Stack textAlign="center" gap="6px"><Icon as={LuCheck} boxSize="50px" color="#4ADE80" mx="auto" /><Text fontSize="18px" fontWeight="700">Jawaban terkirim!</Text><Text color="whiteAlpha.700">Menunggu pemain lain…</Text></Stack></Flex>
                ) : remaining <= 0 ? (
                  <Flex flex="1" align="center" justify="center"><Text fontSize="18px" fontWeight="700" color="#FCA5A5">Waktu habis!</Text></Flex>
                ) : (
                  <Grid flex="1" templateColumns="1fr 1fr" gap="10px">
                    {state.options.map((o, i) => {
                      const t = tile(i)
                      return (
                        <Flex as="button" key={i} onClick={() => answer(i)} bg={t.color} _hover={{ filter: 'brightness(1.08)' }} _active={{ transform: 'scale(0.98)' }}
                          borderRadius="12px" p="14px" align="center" gap="12px" minH="90px" color="white" textAlign="left">
                          <Icon as={t.icon} boxSize="28px" flexShrink={0} />
                          <Text fontSize="18px" fontWeight="700" lineClamp={3}>{o}</Text>
                        </Flex>
                      )
                    })}
                  </Grid>
                )}
              </Flex>
            )}

            {/* Reveal */}
            {sessionId && state?.status === 'reveal' && (
              <Flex minH="85vh" align="center" justify="center" p="20px">
                <Stack gap="10px" textAlign="center" w="full" maxW="420px">
                  {state.myResult?.answered ? (
                    state.myResult.isCorrect ? (
                      <><Icon as={LuCheck} boxSize="64px" color="#4ADE80" mx="auto" /><Text fontSize="28px" fontWeight="800">Benar!</Text><Text fontSize="20px" fontWeight="700" color="#4ADE80">+{state.myResult.points} poin</Text></>
                    ) : (
                      <><Icon as={LuX} boxSize="64px" color="#FCA5A5" mx="auto" /><Text fontSize="28px" fontWeight="800">Kurang tepat</Text></>
                    )
                  ) : (
                    <><Icon as={LuX} boxSize="64px" color="#FCA5A5" mx="auto" /><Text fontSize="24px" fontWeight="800">Tidak menjawab</Text></>
                  )}
                  {(state.myResult?.streak ?? 0) > 1 && <Text color="#FDE047" fontWeight="700">🔥 Streak {state.myResult?.streak}</Text>}
                  <Flex justify="center" gap="18px" mt="6px">
                    <Stack gap={0}><Text fontSize="28px" fontWeight="800">{state.myResult?.totalScore ?? 0}</Text><Text fontSize="12px" color="whiteAlpha.700">Skor</Text></Stack>
                    <Stack gap={0}><Text fontSize="28px" fontWeight="800">#{state.myResult?.rank ?? '-'}</Text><Text fontSize="12px" color="whiteAlpha.700">Peringkat</Text></Stack>
                  </Flex>
                  <Text fontSize="13px" color="whiteAlpha.700" mt="6px">Menunggu host…</Text>
                </Stack>
              </Flex>
            )}

            {/* Ended */}
            {sessionId && state?.status === 'ended' && (
              <Flex minH="85vh" align="center" justify="center" p="20px">
                <Stack gap="12px" textAlign="center" w="full" maxW="460px">
                  <Icon as={LuTrophy} boxSize="64px" color="#FDE047" mx="auto" />
                  <Text fontSize="30px" fontWeight="800">Selesai!</Text>
                  <Flex justify="center" gap="24px">
                    <Stack gap={0}><Text fontSize="34px" fontWeight="800">{state.myResult?.totalScore ?? 0}</Text><Text fontSize="12px" color="whiteAlpha.700">Skor akhir</Text></Stack>
                    <Stack gap={0}><Text fontSize="34px" fontWeight="800">#{state.myResult?.rank ?? '-'}</Text><Text fontSize="12px" color="whiteAlpha.700">Peringkat</Text></Stack>
                  </Flex>
                  <SimpleGrid columns={1} gap="6px" mt="6px">
                    {state.leaderboard.slice(0, 5).map((p) => (
                      <Flex key={p.playerId} justify="space-between" align="center" gap="8px" bg="whiteAlpha.200" px="12px" py="8px" borderRadius="8px">
                        <Flex align="center" gap="8px" minW={0}><PlayerAvatar nickname={p.nickname} avatar={p.avatar} size={26} /><Text fontWeight="700" lineClamp={1}>{p.rank}. {p.nickname}</Text></Flex>
                        <Text fontWeight="700">{p.score}</Text>
                      </Flex>
                    ))}
                  </SimpleGrid>
                  <Button mt="8px" bg="whiteAlpha.300" color="white" _hover={{ bg: 'whiteAlpha.400' }} onClick={close}>Tutup</Button>
                </Stack>
              </Flex>
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
