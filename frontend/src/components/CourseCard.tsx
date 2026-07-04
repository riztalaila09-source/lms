import { Box, Flex, Icon, Text } from '@chakra-ui/react'
import { LuBookOpen, LuUsers, LuGraduationCap } from 'react-icons/lu'
import type { Course } from '@/gen/course/v1/course_pb'
import { UDEMY, courseGradient } from '@/theme/tokens'

/** Udemy-style course card: gradient cover + title, instructor, meta. */
export default function CourseCard({
  course,
  onClick,
  progress,
}: {
  course: Course
  onClick: () => void
  progress?: number
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      textAlign="left"
      w="full"
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor={UDEMY.border}
      bg={UDEMY.bg}
      overflow="hidden"
      transition="box-shadow .15s, transform .15s"
      _hover={{ boxShadow: '0 8px 20px rgba(0,0,0,.16)', transform: 'translateY(-2px)' }}
    >
      {/* Cover */}
      <Box h="132px" position="relative" style={{ background: courseGradient(course.code || course.name) }} flexShrink={0}>
        <Flex position="absolute" inset={0} align="center" justify="center" color="whiteAlpha.900">
          <Icon as={LuBookOpen} boxSize="40px" />
        </Flex>
        {course.code && (
          <Box position="absolute" top="8px" left="8px" bg="blackAlpha.600" color="white"
            fontSize="10px" px="6px" py="2px" borderRadius="4px" fontFamily="mono">
            {course.code}
          </Box>
        )}
        {!course.isActive && (
          <Box position="absolute" top="8px" right="8px" bg="blackAlpha.600" color="white"
            fontSize="10px" px="6px" py="2px" borderRadius="4px">Nonaktif</Box>
        )}
      </Box>

      {/* Body */}
      <Box p="10px" flex={1} display="flex" flexDirection="column">
        <Text fontWeight="bold" fontSize="14px" color={UDEMY.ink} lineClamp={2} lineHeight="1.25">
          {course.name}
        </Text>
        <Text fontSize="12px" color={UDEMY.inkMuted} mt="2px" lineClamp={1}>
          {course.teacher?.fullName || 'Pengajar'}
        </Text>
        <Flex align="center" gap="10px" mt="6px" fontSize="11px" color={UDEMY.inkMuted}>
          <Flex align="center" gap="3px"><Icon as={LuUsers} /> {course.studentCount} siswa</Flex>
          {course.kelas?.length > 0 && (
            <Flex align="center" gap="3px"><Icon as={LuGraduationCap} /> {course.kelas.length} kelas</Flex>
          )}
        </Flex>

        {progress !== undefined && (
          <Box mt="8px">
            <Box h="6px" bg="#E5E7EB" borderRadius="full" overflow="hidden">
              <Box h="full" w={`${Math.min(100, Math.max(0, progress))}%`} bg={UDEMY.accent} />
            </Box>
            <Text fontSize="10px" color={UDEMY.inkMuted} mt="3px">{progress}% selesai</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
