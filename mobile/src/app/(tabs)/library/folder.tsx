// SOURCING: expo-router Stack.Screen and useLocalSearchParams; the vault list through @/features/library/files
//
// One folder of the Library: its subfolders, then its files, newest first.
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { loadVault } from '@/features/library/files'
import { FolderRow, ItemRow } from '@/features/library/item-row'
import { countUnder, filesIn, foldersIn, type LibraryItem } from '@/features/library/model'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'

type Entry = { kind: 'folder'; path: string; count: number } | { kind: 'item'; item: LibraryItem }

export default function FolderScreen() {
  const { path } = useLocalSearchParams<{ path: string }>()
  const vault = useRequest(loadVault, [])
  const rows: Entry[] = vault.data
    ? [
        ...foldersIn(vault.data.entries, path).map((folder) => ({
          kind: 'folder' as const,
          path: folder,
          count: countUnder(vault.data!.items, folder),
        })),
        ...filesIn(vault.data.items, path).map((item) => ({ kind: 'item' as const, item })),
      ]
    : []
  return (
    <>
      <Stack.Screen options={{ title: path.slice(path.lastIndexOf('/') + 1) }} />
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'folder' ? row.path : row.item.path)}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={vault.status === 'loading' && !!vault.data} onRefresh={vault.reload} />}
        renderItem={({ item: row }) =>
          row.kind === 'folder' ? <FolderRow path={row.path} count={row.count} /> : <ItemRow item={row.item} showFolder={false} />
        }
        ListEmptyComponent={
          <View style={styles.message}>
            {vault.status === 'failed' ? (
              <>
                <Text tone="error">{describeError(vault.error)}</Text>
                <Button label="Try again" onPress={vault.reload} />
              </>
            ) : vault.status === 'loading' ? (
              <StatusLabel tone="live" label="Loading folder" />
            ) : (
              <Text tone="muted">This folder is empty.</Text>
            )}
          </View>
        }
      />
    </>
  )
}

const styles = StyleSheet.create({ message: { padding: space.xl, gap: space.md, alignItems: 'center' } })
