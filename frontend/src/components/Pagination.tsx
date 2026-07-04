import { useEffect, useMemo, useState } from 'react'
import { Button, Flex, Icon, Text } from '@chakra-ui/react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

/**
 * Client-side pagination hook. Slices an in-memory array into pages and keeps
 * the current page valid when the underlying list shrinks (e.g. after filtering).
 */
export function usePaged<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])
  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )
  return { page, setPage, pageItems, pageSize, total: items.length }
}

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/** Prev/next pager. Renders nothing when everything fits on one page. */
export default function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <Flex justify="space-between" align="center" mt="12px" flexWrap="wrap" gap="8px">
      <Text fontSize="12px" color={COLORS.muted}>{from}–{to} dari {total}</Text>
      <Flex gap="6px" align="center">
        <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <Icon as={LuChevronLeft} />
        </Button>
        <Text fontSize="13px" minW="70px" textAlign="center">Hal {page} / {totalPages}</Text>
        <Button size="xs" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <Icon as={LuChevronRight} />
        </Button>
      </Flex>
    </Flex>
  )
}
