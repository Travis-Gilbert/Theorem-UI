// SOURCING: expo-image-picker SDK 58 (launchCameraAsync, launchImageLibraryAsync with the `mediaTypes` string array, requestCameraPermissionsAsync), expo-document-picker (getDocumentAsync), expo-sharing's ResolvedSharePayload (experimental incoming shares)
//
// The three ways an item reaches intake on the phone itself, and the fourth
// from the share sheet. Each returns items already kept in the app's storage.
import * as Crypto from 'expo-crypto'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import type { ResolvedSharePayload } from 'expo-sharing'
import { keep } from './files'
import type { IntakeItem, ItemSource } from './model'

export class PermissionError extends Error {
  constructor(what: string) {
    super(`Theorem is not allowed to use ${what}. Allow it in Settings to continue.`)
    this.name = 'PermissionError'
  }
}

const id = () => Crypto.randomUUID()

/** The system camera: one photograph, a definite thing to talk about. Empty when the person cancels. */
export async function fromCamera(): Promise<IntakeItem[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) throw new PermissionError('the camera')
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false })
  if (result.canceled) return []
  return result.assets.map((asset) =>
    keep(id(), 'camera', { uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize }),
  )
}

/** The system photo picker runs out of process, so it needs no photo library permission. */
export async function fromLibrary(): Promise<IntakeItem[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
    exif: false,
  })
  if (result.canceled) return []
  return result.assets.map((asset) =>
    keep(id(), 'library', { uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize }),
  )
}

export async function fromFiles(): Promise<IntakeItem[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
  if (result.canceled) return []
  return result.assets.map((asset) =>
    keep(id(), 'files', { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }),
  )
}

/** What another app handed over through the share sheet. A link stays a link; nothing is fetched. */
export function fromShare(payloads: ResolvedSharePayload[]): IntakeItem[] {
  const source: ItemSource = 'share'
  return payloads.flatMap((payload): IntakeItem[] => {
    if (payload.shareType === 'url') return [{ kind: 'link', id: id(), source, url: payload.value }]
    if (payload.shareType === 'text')
      return payload.value.trim() ? [{ kind: 'text', id: id(), source, text: payload.value }] : []
    const uri = payload.contentUri ?? payload.value
    if (!uri) return []
    return [
      keep(id(), source, {
        uri,
        name: payload.originalName,
        mimeType: payload.contentMimeType ?? payload.mimeType,
        size: payload.contentSize,
      }),
    ]
  })
}
