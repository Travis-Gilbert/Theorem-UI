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
import Chat from '@/assets/icons/rail/noun-chat-8216252.svg?react'
import Moon from '@/assets/icons/rail/lucide-moon-rail.svg?react'
import Sun from '@/assets/icons/rail/lucide-sun-rail.svg?react'
// The owned Noun set has no delete glyph yet; Lucide's trash stands in until one is licensed.
// Nor a two-way chevron for switchers; Lucide's stands in the same way.
import { ChevronsUpDown as UpDown, Trash2 as Delete } from 'lucide-react'
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
import CopyPaste from '@/assets/icons/streamline/streamline-copy-paste-1.png'
import CrossRegion from '@/assets/icons/streamline/streamline-cross-region-data-delivery-2.png'
import PencilWrite from '@/assets/icons/streamline/streamline-pencil-write-2.png'
import SearchSquare from '@/assets/icons/streamline/streamline-search-square.png'
import SendEmail from '@/assets/icons/streamline/streamline-send-email-1.png'
import ShareBox from '@/assets/icons/streamline/streamline-share-1.png'

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

const Copy = masked(CopyPaste)
const Diagram = masked(CodeWrite)
const NewChat = masked(PencilWrite)
const Search = masked(SearchSquare)
const Send = masked(SendEmail)
const Share = masked(ShareBox)
const Web = masked(CrossRegion)

const Copied = solid(CopiedMark)
const Edit = solid(EditMark)
const More = solid(MoreMark)
const Next = solid(NextMark)
const Previous = solid(PreviousMark)
const Reload = solid(ReloadMark)
// The folder tree's marks are filled outlines on a 24 viewBox, solid like the toolbar's.
const Folder = solid(FolderMark)
const FolderOpen = solid(FolderOpenMark)
const TreeFile = solid(TreeFileMark)

export const Icon = {
  Add,
  Archive,
  Article,
  Attachment,
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
  Folder,
  FolderOpen,
  Ide: Shellfile,
  Layout,
  Link,
  Menu,
  Microphone,
  Moon,
  More,
  NewChat,
  Next,
  Previous,
  Project: ProjectRow,
  Projects,
  Refresh,
  Reload,
  Search,
  Send,
  Settings,
  Share,
  Spaces: PenroseTriangle,
  Stop,
  Sun,
  TreeFile,
  UpDown,
  Web,
}

export type IconName = keyof typeof Icon
