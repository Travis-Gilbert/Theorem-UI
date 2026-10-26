// SOURCING: vite-plugin-svgr (SVG-as-React-component, adopted as build plugin) over owner-licensed Noun SVG assets; Vite asset URLs for owner-supplied Streamline PNGs painted as CSS masks
// Noun Project icons owned under the paid subscription; see src/assets/icons/PROVENANCE.md.
// Noun icons are filled contours on a 100 viewBox, painted with currentColor by the
// svg[data-icon] rule in styles.css. Moon and Sun are the Lucide-derived theme glyphs
// TheoremWeb uses (stroke outlines; provenance in PROVENANCE.md).
import type { CSSProperties, ComponentProps, FC } from 'react'
import { cn } from '@/lib/utils'
import Attachment from '@/assets/icons/composer/noun-attachment-8184735.svg?react'
import Close from '@/assets/icons/composer/noun-close-8086061.svg?react'
import Draft from '@/assets/icons/composer/noun-draft-8216278.svg?react'
import Microphone from '@/assets/icons/composer/noun-microphone-8216254.svg?react'
import Refresh from '@/assets/icons/composer/noun-refresh-8086048.svg?react'
import Settings from '@/assets/icons/composer/noun-settings-8086044.svg?react'
import Stop from '@/assets/icons/composer/noun-stop-8086088.svg?react'
import CopiedMark from '@/assets/icons/message/theorem-copied.svg?react'
import EditMark from '@/assets/icons/message/theorem-edit.svg?react'
import MoreMark from '@/assets/icons/message/theorem-more.svg?react'
import NextMark from '@/assets/icons/message/theorem-next.svg?react'
import PreviousMark from '@/assets/icons/message/theorem-previous.svg?react'
import ReloadMark from '@/assets/icons/message/theorem-reload.svg?react'
import Moon from '@/assets/icons/rail/lucide-moon-rail.svg?react'
import Sun from '@/assets/icons/rail/lucide-sun-rail.svg?react'
// The owned Noun set has no delete glyph yet; Lucide's trash stands in until one is licensed.
// Nor a two-way chevron for switchers; Lucide's stands in the same way.
// Nor an outline or a node graph mark; Lucide's stand in the same way.
// Nor an agent's document or a skill; Lucide's stand in the same way.
// Nor a mute mark, for a link suggestion not to make again.
// Nor a pin or a revision history for the Index's views; Lucide's stand in too.
import {
  BellOff as Mute,
  Bot as Agent,
  ChevronsUpDown as UpDown,
  GraduationCap as Skill,
  History,
  Pin,
  Trash2 as Delete,
  TableOfContents as Outline,
  Waypoints as Graph,
  SquareTerminal as Terminal,
  PanelsTopLeft,
  X,
} from 'lucide-react'
import PenroseTriangle from '@/assets/icons/rail/noun-penrose-triangle-881122.svg?react'
import Projects from '@/assets/icons/rail/noun-projects-8375031.svg?react'
import Shellfile from '@/assets/icons/rail/noun-shellfile-1517619.svg?react'
import Add from '@/assets/icons/records/noun-add-8086054.svg?react'
import Archive from '@/assets/icons/records/noun-archive-8315826.svg?react'
import Article from '@/assets/icons/records/noun-article-8259879.svg?react'
import Check from '@/assets/icons/records/noun-checkmark-8086058.svg?react'
import Coding from '@/assets/icons/records/noun-coding-8259870.svg?react'
import Expand from '@/assets/icons/records/noun-expand-8086092.svg?react'
import Eye from '@/assets/icons/records/noun-eye-8086063.svg?react'
import File from '@/assets/icons/records/noun-file-8259863.svg?react'
import Layout from '@/assets/icons/records/noun-layout-8176268.svg?react'
import Menu from '@/assets/icons/records/noun-menu-8086045.svg?react'
import Link from '@/assets/icons/records/noun-link-8086078.svg?react'
import ProjectRow from '@/assets/icons/tree/noun-data-8394841.svg?react'
import TreeFileMark from '@/assets/icons/tree/file.svg?react'
import FolderMark from '@/assets/icons/tree/folder-closed.svg?react'
import FolderOpenMark from '@/assets/icons/tree/folder-open.svg?react'
import CodeWrite from '@/assets/icons/streamline/streamline-code-write-1.png'
import CommonFileDouble from '@/assets/icons/streamline/streamline-common-file-double.png'
import CommonFileStack from '@/assets/icons/streamline/streamline-common-file-stack.png'
import CopyPaste from '@/assets/icons/streamline/streamline-copy-paste-1.png'
import CrossRegion from '@/assets/icons/streamline/streamline-cross-region-data-delivery-2.png'
import DrawerFile from '@/assets/icons/streamline/streamline-drawer-file.png'
import FileOpen1 from '@/assets/icons/streamline/streamline-file-open-1.png'
import FolderFile1 from '@/assets/icons/streamline/streamline-folder-file-1.png'
import PencilWrite from '@/assets/icons/streamline/streamline-pencil-write-2.png'
import SearchSquare from '@/assets/icons/streamline/streamline-search-square.png'
import SendEmail from '@/assets/icons/streamline/streamline-send-email-1.png'
import SquareWireframe from '@/assets/icons/streamline/streamline-square-wireframe-3d.png'
import WebpageBullets from '@/assets/icons/streamline/streamline-ui-webpage-bullets.png'
import ShareBox from '@/assets/icons/streamline/streamline-share-1.png'
import ZipFileLock from '@/assets/icons/streamline/streamline-zip-file-lock.png'
import ZipFileWarning from '@/assets/icons/streamline/streamline-zip-file-warning.png'

import ChatMark from '@/assets/icons/rail/noun-chat-52762.svg?react'
import FileOpen from '@/assets/icons/streamline/streamline-file-open.png'
import DownloadBox from '@/assets/icons/streamline/streamline-download-box.png'
import FolderClosed from '@/assets/icons/streamline/streamline-folder.png'
import ShipmentUpload from '@/assets/icons/streamline/streamline-shipment-upload.png'
import XMark from '@/assets/icons/streamline/streamline-x.png'

type SvgMark = FC<
  ComponentProps<'svg'> & {
    title?: string
    titleId?: string
    desc?: string
    descId?: string
  }
>

/**
 * The message toolbar marks arrive solid: Theorem drew them as a 7.5-unit
 * line and expanded it to a filled outline, so they already carry the weight
 * the family is drawn with. The rest of the family is hollow contour, which
 * the rendering layer closes with a same-colour stroke so the marks read at
 * control size. These carry the class that keeps them out of that rule.
 */
const solid = (Mark: SvgMark): SvgMark =>
  function SolidMark({ className, ...props }) {
    return <Mark {...props} className={cn('icon-solid', className)} />
  }

/**
 * Streamline Ultimate Light marks arrive as 48px black-on-transparent PNGs.
 * Each paints currentColor through its PNG as a mask (.icon-mask in
 * styles.css), so it takes the surrounding ink like the SVG marks. It renders
 * as an empty <svg> so the sizing rules written for icons (a button's default
 * size, shrink-0) reach it too. At the 14-20px the controls use, the source
 * is at least 2x on a retina display.
 */
const masked = (src: string): SvgMark =>
  function MaskedMark({ className, style, ...props }) {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        {...props}
        className={cn('icon-mask', className)}
        style={{ ...style, '--icon-mask': `url("${src}")` } as CSSProperties}
      />
    )
  }
const Artifact = masked(SquareWireframe)
const Copy = masked(CopyPaste)
const Download = masked(DownloadBox)
const Diagram = masked(CodeWrite)
const NewChat = masked(PencilWrite)
const Search = masked(SearchSquare)
const Send = masked(SendEmail)
const Share = masked(ShareBox)
const Web = masked(CrossRegion)
const Exit = masked(XMark)

function Panels({ className, ...props }: ComponentProps<typeof PanelsTopLeft>) {
  return <PanelsTopLeft {...props} className={cn('-scale-x-100', className)} />
}

const flap =
  'icon-mask box-flap absolute inset-0 duration-(--duration-exit) ease-exit group-hover/open:duration-(--duration-lift) group-hover/open:ease-lift group-focus-visible/open:duration-(--duration-lift) group-focus-visible/open:ease-lift'

/**
 * Streamline's shipment box as masks of the one PNG: the body, the rim of its
 * top face, and the two flaps that meet at the taped seam (.box-* in
 * styles.css). Hovering or focusing the enclosing `group/open` swings the
 * flaps up and out from the seam, the back one a beat ahead of the front.
 */
function Open({ className, style, ...props }: ComponentProps<'span'>) {
  const mask = {
    ...style,
    '--icon-mask': `url("${ShipmentUpload}")`,
  } as CSSProperties
  return (
    <span
      aria-hidden="true"
      {...props}
      className={cn(
        'relative inline-block shrink-0 group-hover/open:[--flap:120deg] group-focus-visible/open:[--flap:120deg]',
        className,
      )}
    >
      <span className="icon-mask box-body absolute inset-0" style={mask} />
      <span
        className="icon-mask box-rim absolute inset-0 opacity-0 transition-opacity duration-(--duration-exit) group-hover/open:opacity-100 group-focus-visible/open:opacity-100"
        style={mask}
      />
      <span data-flap="back" className={flap} style={mask} />
      <span
        data-flap="front"
        className={cn(
          flap,
          'group-hover/open:delay-60 group-focus-visible/open:delay-60',
        )}
        style={mask}
      />
    </span>
  )
}
const Chat = solid(ChatMark)
const Vault = masked(DrawerFile)
const Files = masked(FolderFile1)
const OpenFolder = masked(FileOpen1)
const Notes = masked(CommonFileStack)
const Attachments = masked(CommonFileDouble)
const Trusted = masked(ZipFileLock)
const Untrusted = masked(ZipFileWarning)
const Plan = masked(WebpageBullets)
const TheoremVault = masked(SquareWireframe)

const Copied = solid(CopiedMark)
const Edit = solid(EditMark)
const More = solid(MoreMark)
const Next = solid(NextMark)
const Previous = solid(PreviousMark)
const Reload = solid(ReloadMark)
const TreeFolder = solid(FolderMark)
const TreeFolderOpen = solid(FolderOpenMark)
const Folder = masked(FolderClosed)
const FolderOpen = masked(FileOpen)
const TreeFile = solid(TreeFileMark)

export const Icon = {
  Add,
  Agent,
  Archive,
  Article,
  Attachment,
  Attachments,
  Chat,
  Check,
  Close,
  Code: Coding,
  Copied,
  Copy,
  Delete,
  Diagram,
  Draft,
  Edit,
  Expand,
  Eye,
  File,
  Files,
  Folder,
  FolderOpen,
  Graph,
  History,
  Ide: Shellfile,
  Index: Archive,
  Layout,
  Link,
  Menu,
  Microphone,
  Moon,
  More,
  Mute,
  NewChat,
  Next,
  Notes,
  OpenFolder,
  Outline,
  Pin,
  Plan,
  Previous,
  Project: ProjectRow,
  Projects,
  Refresh,
  Reload,
  Search,
  Send,
  Settings,
  Share,
  Skill,
  Spaces: PenroseTriangle,
  Stop,
  Sun,
  TheoremVault,
  TreeFile,
  Trusted,
  Untrusted,
  UpDown,
  Vault,
  Web,
  Download,
  Open,
  X,
  Artifact,
  Exit,
  Panels,
  Terminal,
  TreeFolder,
  TreeFolderOpen,
}

export type IconName = keyof typeof Icon
