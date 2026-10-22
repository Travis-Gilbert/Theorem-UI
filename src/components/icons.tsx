// SOURCING: vite-plugin-svgr (SVG-as-React-component, adopted as build plugin) over owner-licensed Noun SVG assets
// Noun Project icons owned under the paid subscription; see src/assets/icons/PROVENANCE.md.
// Noun icons are filled contours on a 100 viewBox, painted with currentColor by the
// svg[data-icon] rule in styles.css. Moon and Sun are the Lucide-derived theme glyphs
// TheoremWeb uses (stroke outlines; provenance in PROVENANCE.md).
import type { ComponentProps, FC } from 'react'
import { cn } from '@/lib/utils'
import Attachment from '@/assets/icons/composer/noun-attachment-8184735.svg?react'
import Close from '@/assets/icons/composer/noun-close-8086061.svg?react'
import Draft from '@/assets/icons/composer/noun-draft-8216278.svg?react'
import Microphone from '@/assets/icons/composer/noun-microphone-8216254.svg?react'
import Refresh from '@/assets/icons/composer/noun-refresh-8086048.svg?react'
import Send from '@/assets/icons/composer/noun-send-8216262.svg?react'
import Settings from '@/assets/icons/composer/noun-settings-8086044.svg?react'
import Stop from '@/assets/icons/composer/noun-stop-8086088.svg?react'
import Web from '@/assets/icons/composer/noun-web-8223212.svg?react'
import CopiedMark from '@/assets/icons/message/theorem-copied.svg?react'
import CopyMark from '@/assets/icons/message/theorem-copy.svg?react'
import EditMark from '@/assets/icons/message/theorem-edit.svg?react'
import MoreMark from '@/assets/icons/message/theorem-more.svg?react'
import NextMark from '@/assets/icons/message/theorem-next.svg?react'
import PreviousMark from '@/assets/icons/message/theorem-previous.svg?react'
import ReloadMark from '@/assets/icons/message/theorem-reload.svg?react'
import Chat from '@/assets/icons/rail/noun-chat-8216252.svg?react'
import Index from '@/assets/icons/rail/noun-database-8408864.svg?react'
import Moon from '@/assets/icons/rail/lucide-moon-rail.svg?react'
import Page from '@/assets/icons/rail/noun-page-7936682.svg?react'
import Script from '@/assets/icons/rail/noun-shellfile-1517619.svg?react'
import Sun from '@/assets/icons/rail/lucide-sun-rail.svg?react'
// The owned Noun set has no delete glyph yet; Lucide's trash stands in until one is licensed.
import { Trash2 as Delete } from 'lucide-react'
import Projects from '@/assets/icons/rail/noun-projects-8375031.svg?react'
import Writing from '@/assets/icons/rail/noun-writing-8280302.svg?react'
import Add from '@/assets/icons/records/noun-add-8086054.svg?react'
import Archive from '@/assets/icons/records/noun-archive-8315826.svg?react'
import Article from '@/assets/icons/records/noun-article-8259879.svg?react'
import Check from '@/assets/icons/records/noun-checkmark-8086058.svg?react'
import Coding from '@/assets/icons/records/noun-coding-8259870.svg?react'
import Diagram from '@/assets/icons/records/noun-diagram-8269845.svg?react'
import Expand from '@/assets/icons/records/noun-expand-8086092.svg?react'
import Eye from '@/assets/icons/records/noun-eye-8086063.svg?react'
import File from '@/assets/icons/records/noun-file-8259863.svg?react'
import Hierarchy from '@/assets/icons/records/noun-hierarchy-8259865.svg?react'
import Layout from '@/assets/icons/records/noun-layout-8176268.svg?react'
import Menu from '@/assets/icons/records/noun-menu-8086045.svg?react'
import Message from '@/assets/icons/records/noun-message-8086072.svg?react'
import Link from '@/assets/icons/records/noun-link-8086078.svg?react'
import Search from '@/assets/icons/records/noun-search-8086046.svg?react'
import Share from '@/assets/icons/records/noun-share-8086062.svg?react'
import ProjectRow from '@/assets/icons/tree/noun-data-8394841.svg?react'

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

const Copied = solid(CopiedMark)
const Copy = solid(CopyMark)
const Edit = solid(EditMark)
const More = solid(MoreMark)
const Next = solid(NextMark)
const Previous = solid(PreviousMark)
const Reload = solid(ReloadMark)

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
  Hierarchy,
  Index,
  Layout,
  Link,
  Menu,
  Message,
  Microphone,
  Moon,
  More,
  NewChat: Writing,
  Next,
  Page,
  Previous,
  Project: ProjectRow,
  Projects,
  Refresh,
  Reload,
  Script,
  Search,
  Send,
  Settings,
  Share,
  Stop,
  Sun,
  Web,
}

export type IconName = keyof typeof Icon
