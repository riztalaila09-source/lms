import { Button, Dialog, Icon, Text } from '@chakra-ui/react'
import { LuTriangleAlert, LuCircleHelp } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

export interface ConfirmState {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
}

interface ConfirmDialogProps {
  state: ConfirmState | null
  onClose: () => void
}

/**
 * Reusable warning popup. Render once per page; drive it with a ConfirmState
 * object (set it to show, null to hide).
 */
export default function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const danger = state?.variant !== 'primary'
  return (
    <Dialog.Root open={!!state} onOpenChange={(e) => { if (!e.open) onClose() }} role="alertdialog">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="400px">
          <Dialog.Header>
            <Dialog.Title display="flex" alignItems="center" gap="6px">
              <Icon as={danger ? LuTriangleAlert : LuCircleHelp} color={danger ? COLORS.danger : COLORS.primary} />
              {state?.title}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Text fontSize="14px" color={COLORS.text}>{state?.message}</Text>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button
              bg={danger ? COLORS.danger : COLORS.primary}
              color="white"
              _hover={{ opacity: 0.9 }}
              onClick={() => {
                state?.onConfirm()
                onClose()
              }}
            >
              {state?.confirmLabel ?? (danger ? 'Hapus' : 'Lanjutkan')}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
