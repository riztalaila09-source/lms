import { IconButton, Icon, Menu, Portal } from '@chakra-ui/react'
import { LuEllipsisVertical } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { COLORS } from '@/theme/tokens'

export interface RowAction {
  label: string
  icon: IconType
  onClick: () => void
  danger?: boolean
  hidden?: boolean
}

/**
 * Kebab (⋮) menu for a data-table row when there are too many actions to show
 * as individual icon buttons. Each item has its icon on the left
 * (docs/frontend-implementation.md — "Kaitan Data table").
 */
export default function RowActionsMenu({ actions, label = 'Aksi' }: { actions: RowAction[]; label?: string }) {
  const items = actions.filter((a) => !a.hidden)
  if (items.length === 0) return null
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton size="xs" variant="ghost" aria-label={label} title={label}>
          <Icon as={LuEllipsisVertical} />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {items.map((a) => (
              <Menu.Item key={a.label} value={a.label}
                color={a.danger ? COLORS.danger : undefined}
                onClick={a.onClick}>
                <Icon as={a.icon} /> {a.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
