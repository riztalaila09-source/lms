import { useRef } from 'react'
import { Button, Icon, Menu, Portal } from '@chakra-ui/react'
import { LuFileSpreadsheet, LuChevronDown, LuUpload, LuDownload, LuFileText } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

export interface DataMenuProps {
  /** Called with the picked file when the user chooses "Import CSV". Omit to hide the item. */
  onImportFile?: (file: File) => void
  /** Called when the user chooses "Export CSV". Omit to hide the item. */
  onExport?: () => void
  /** Called when the user chooses "Unduh Template". Omit to hide the item. */
  onTemplate?: () => void
  importing?: boolean
  exportDisabled?: boolean
  size?: 'xs' | '2xs' | 'sm' | 'md'
  label?: string
}

/**
 * A single dropdown that groups the CSV data actions (Import / Export / Template)
 * behind one trigger — instead of three separate buttons — using the Chakra UI v3
 * Menu (https://www.chakra-ui.com/docs/components/menu). Only the items whose
 * handler is provided are shown. The hidden file input for import is managed here.
 */
export default function DataMenu({
  onImportFile, onExport, onTemplate,
  importing = false, exportDisabled = false, size = 'sm', label = 'Data',
}: DataMenuProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  if (!onImportFile && !onExport && !onTemplate) return null

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button size={size} variant="outline" loading={importing}>
            <Icon as={LuFileSpreadsheet} /> {label} <Icon as={LuChevronDown} />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {onImportFile && (
                <Menu.Item value="import" onClick={() => fileRef.current?.click()}>
                  <Icon as={LuUpload} /> Import CSV
                </Menu.Item>
              )}
              {onExport && (
                <Menu.Item value="export" disabled={exportDisabled}
                  color={exportDisabled ? COLORS.muted : undefined} onClick={onExport}>
                  <Icon as={LuDownload} /> Export CSV
                </Menu.Item>
              )}
              {onTemplate && (
                <Menu.Item value="template" onClick={onTemplate}>
                  <Icon as={LuFileText} /> Unduh Template
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      {onImportFile && (
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); if (fileRef.current) fileRef.current.value = '' }} />
      )}
    </>
  )
}
