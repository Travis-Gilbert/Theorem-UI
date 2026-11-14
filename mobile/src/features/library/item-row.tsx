// SOURCING: expo-image SF Symbols (as in ui/header.tsx); ui/row.tsx
//
// One Library row. A mark for the type on the left, then three levels: the
// title, the excerpt or one line of what it is, and "Type · Project · when".
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { recency } from '@/lib/time'
import { Row } from '@/ui/row'
import { useTheme } from '@/ui/theme'
import { DEFAULT_DISPLAY, metaFor, type Display } from './display-model'
import type { ItemType, LibraryItem } from './model'
import { markViewed } from './recents'

const SYMBOL: Record<ItemType | 'folder', string> = {
  note: 'doc.text',
  generated: 'macwindow',
  pdf: 'doc.richtext',
  page: 'globe',
  other: 'doc',
  folder: 'folder',
}

function Mark({ type }: { type: ItemType | 'folder' }) {
  const { palette } = useTheme()
  return (
    <View style={styles.mark}>
      <Image
        source={`sf:${SYMBOL[type]}`}
        tintColor={type === 'folder' ? palette.accent : palette.inkMuted}
        style={styles.symbol}
        contentFit="contain"
      />
    </View>
  )
}

export const openItem = (path: string) => {
  markViewed(path)
  router.push({ pathname: '/library/item', params: { path } })
}
export const openFolder = (path: string) => router.push({ pathname: '/library/folder', params: { path } })

export function ItemRow({
  item,
  showFolder = true,
  show = DEFAULT_DISPLAY.show,
}: {
  item: LibraryItem
  showFolder?: boolean
  /** Which properties the row shows; the title always does. */
  show?: Display['show']
}) {
  const when = recency(item.modifiedMs)
  return (
    <Row
      prominence="regular"
      leading={<Mark type={item.type} />}
      title={item.title}
      detail={show.excerpt ? item.excerpt : undefined}
      meta={metaFor(item, when, show, showFolder)}
      accessibilityLabel={[item.title, item.label, showFolder ? item.folder : undefined, when].filter(Boolean).join(', ')}
      onPress={() => openItem(item.path)}
    />
  )
}

export function FolderRow({ path, count }: { path: string; count: number }) {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return (
    <Row
      prominence="regular"
      leading={<Mark type="folder" />}
      title={name}
      meta={`${count} ${count === 1 ? 'item' : 'items'}`}
      onPress={() => openFolder(path)}
    />
  )
}

const styles = StyleSheet.create({
  mark: { width: 28, alignItems: 'center' },
  symbol: { width: 22, height: 22 },
})
