import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Flex, Icon, Input, Stack, Text } from '@chakra-ui/react'
import { LuLogIn, LuClock, LuCircleCheck, LuGraduationCap, LuArrowLeft } from 'react-icons/lu'
import { ConnectError } from '@connectrpc/connect'
import { schoolClient } from '@/lib/client'
import type { PpdbQuestion } from '@/gen/school/v1/school_pb'
import { UDEMY } from '@/theme/tokens'

const errMsg = (e: unknown) => (e instanceof ConnectError ? e.rawMessage : e instanceof Error ? e.message : 'Terjadi kesalahan')

/** Public PPDB exam: applicants log in with printed credentials and take a timed MCQ. */
export default function PpdbUjianPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'login' | 'closed' | 'test' | 'done'>('login')
  const [no, setNo] = useState('')
  const [password, setPassword] = useState('')
  const [nama, setNama] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [qs, setQs] = useState<PpdbQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [deadline, setDeadline] = useState(0)
  const [, setTick] = useState(0)
  const [score, setScore] = useState(0)
  const submittedRef = useRef(false)

  // The exam token lives in the normal auth slot so schoolClient carries it.
  const setToken = (t: string) => { try { localStorage.setItem('lms_token', t) } catch { /* ignore */ } }
  const clearToken = () => { try { localStorage.removeItem('lms_token') } catch { /* ignore */ } }
  useEffect(() => () => clearToken(), [])

  const loadTest = useCallback(async (durationMin: number) => {
    const r = await schoolClient.getPpdbTest({})
    if (r.submitted) { setPhase('done'); return }
    setQs(r.questions)
    setDeadline(Date.now() + (r.durationMinutes || durationMin || 60) * 60 * 1000)
    setPhase('test')
  }, [])

  const doLogin = async () => {
    if (!no.trim() || !password.trim()) { setErr('Isi nomor pendaftaran & password.'); return }
    setBusy(true); setErr('')
    try {
      const r = await schoolClient.ppdbLogin({ noPendaftaran: no.trim(), password: password.trim() })
      setToken(r.token); setNama(r.nama)
      if (r.testSubmitted) { setPhase('done') }
      else if (!r.testActive) { setPhase('closed') }
      else { await loadTest(r.durationMinutes) }
    } catch (e) { clearToken(); setErr(errMsg(e)) }
    finally { setBusy(false) }
  }

  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setBusy(true)
    try {
      const payload = qs.map((_, i) => ({ questionIndex: i, optionIndex: answers[i] ?? -1 }))
      const r = await schoolClient.submitPpdbTest({ answers: payload })
      setScore(r.score)
    } catch { /* ignore — server records once */ }
    finally { setBusy(false); setPhase('done'); clearToken() }
  }, [qs, answers])

  // Countdown; auto-submit at 0.
  useEffect(() => {
    if (phase !== 'test') return
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      if (Date.now() >= deadline) submit()
    }, 500)
    return () => window.clearInterval(id)
  }, [phase, deadline, submit])

  const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
  const mmss = useMemo(() => `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`, [remaining])
  const answeredCount = Object.keys(answers).length

  return (
    <Flex minH="100vh" bg="#241C4A" color="white" direction="column" align="center" p="20px">
      <Flex w="full" maxW="820px" justify="space-between" align="center" py="10px">
        <Flex align="center" gap="8px"><Icon as={LuGraduationCap} boxSize="24px" /><Text fontWeight="800" fontSize="18px">Ujian PPDB</Text></Flex>
        {phase === 'login' && <Button size="sm" variant="ghost" color="whiteAlpha.900" onClick={() => navigate('/')}><Icon as={LuArrowLeft} /> Beranda</Button>}
        {phase === 'test' && <Flex align="center" gap="8px" bg={remaining <= 60 ? '#E21B3C' : 'whiteAlpha.300'} px="12px" py="6px" borderRadius="full"><Icon as={LuClock} /><Text fontWeight="800" fontSize="18px">{mmss}</Text></Flex>}
      </Flex>

      {phase === 'login' && (
        <Flex flex="1" align="center" justify="center" w="full">
          <Stack gap="14px" w="full" maxW="360px">
            <Text fontSize="22px" fontWeight="800" textAlign="center">Masuk Ujian</Text>
            <Text fontSize="13px" color="whiteAlpha.700" textAlign="center">Gunakan Nomor Pendaftaran & password dari panitia.</Text>
            <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="Nomor Pendaftaran (mis. 2627-G1-0001)" bg="whiteAlpha.200" borderColor="whiteAlpha.400" _placeholder={{ color: 'whiteAlpha.600' }} />
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" bg="whiteAlpha.200" borderColor="whiteAlpha.400" _placeholder={{ color: 'whiteAlpha.600' }} onKeyDown={(e) => { if (e.key === 'Enter') doLogin() }} />
            {err && <Text color="#FCA5A5" fontSize="13px" textAlign="center">{err}</Text>}
            <Button loading={busy} onClick={doLogin} bg="#26890C" color="white" _hover={{ bg: '#1C6B08' }} size="lg"><Icon as={LuLogIn} /> Masuk</Button>
          </Stack>
        </Flex>
      )}

      {phase === 'closed' && (
        <Flex flex="1" align="center" justify="center"><Stack gap="8px" textAlign="center" maxW="380px">
          <Icon as={LuClock} boxSize="50px" color="#FDE047" mx="auto" />
          <Text fontSize="20px" fontWeight="800">Halo, {nama}</Text>
          <Text color="whiteAlpha.800">Ujian belum dibuka. Silakan tunggu jadwal ujian dari panitia.</Text>
          <Button mt="6px" variant="outline" color="white" borderColor="whiteAlpha.500" onClick={() => { clearToken(); setPhase('login') }}>Keluar</Button>
        </Stack></Flex>
      )}

      {phase === 'test' && (
        <Stack w="full" maxW="820px" gap="14px" pb="30px">
          <Flex justify="space-between"><Text fontSize="13px" color="whiteAlpha.800">{nama}</Text><Text fontSize="13px" color="whiteAlpha.800">Terjawab {answeredCount}/{qs.length}</Text></Flex>
          {qs.map((q, qi) => (
            <Box key={q.id} bg="whiteAlpha.100" borderRadius="12px" p="16px">
              <Text fontWeight="700" mb="10px">{qi + 1}. {q.question}</Text>
              <Stack gap="8px">
                {q.options.map((o, oi) => {
                  const picked = answers[qi] === oi
                  return (
                    <Flex as="button" key={oi} onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))} align="center" gap="10px"
                      bg={picked ? UDEMY.accent : 'whiteAlpha.200'} _hover={{ bg: picked ? UDEMY.accentDark : 'whiteAlpha.300' }}
                      px="12px" py="10px" borderRadius="8px" textAlign="left" color="white">
                      <Flex align="center" justify="center" boxSize="22px" borderRadius="full" border="2px solid" borderColor="whiteAlpha.700" flexShrink={0} fontWeight="700" fontSize="12px">{String.fromCharCode(65 + oi)}</Flex>
                      <Text>{o}</Text>
                    </Flex>
                  )
                })}
              </Stack>
            </Box>
          ))}
          {qs.length === 0 && <Text color="whiteAlpha.700" textAlign="center">Belum ada soal untuk gelombang ini.</Text>}
          <Button size="lg" loading={busy} onClick={submit} bg="#26890C" color="white" _hover={{ bg: '#1C6B08' }} alignSelf="center" px="40px"><Icon as={LuCircleCheck} /> Kumpulkan Jawaban</Button>
        </Stack>
      )}

      {phase === 'done' && (
        <Flex flex="1" align="center" justify="center"><Stack gap="10px" textAlign="center" maxW="380px" align="center">
          <Icon as={LuCircleCheck} boxSize="64px" color="#4ADE80" />
          <Text fontSize="24px" fontWeight="800">Ujian Selesai</Text>
          <Text color="whiteAlpha.800">Jawaban kamu sudah terkirim. Nilai & kelulusan diumumkan oleh panitia PPDB.</Text>
          {score > 0 && <Text fontSize="18px" fontWeight="700" color="#4ADE80">Nilai kamu: {score}</Text>}
          <Button mt="6px" variant="outline" color="white" borderColor="whiteAlpha.500" onClick={() => navigate('/')}>Kembali ke Beranda</Button>
        </Stack></Flex>
      )}
    </Flex>
  )
}
