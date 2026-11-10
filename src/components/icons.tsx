// SOURCING: vite-plugin-svgr (SVG-as-React-component, adopted as build plugin) over owner-licensed Noun SVG assets; Vite asset URLs for owner-supplied Streamline PNGs painted as CSS masks, the coloured ones as the layers scripts/rail-icons.mjs splits them into; lucide-react for the folder and file the notes tree draws
// Noun Project icons owned under the paid subscription; see src/assets/icons/PROVENANCE.md.
// Noun icons are filled contours on a 100 viewBox, painted with currentColor by the
// svg[data-icon] rule in styles.css. Moon and Sun are the Lucide-derived theme glyphs
// TheoremWeb uses (stroke outlines; provenance in PROVENANCE.md).
import type { CSSProperties, ComponentProps, FC } from 'react'
import { cn } from '@/lib/utils'
import Close from '@/assets/icons/composer/noun-close-8086061.svg?react'
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
import ChatMark from '@/assets/icons/rail/noun-chat-52762.svg?react'
import Moon from '@/assets/icons/rail/lucide-moon-rail.svg?react'
import Sun from '@/assets/icons/rail/lucide-sun-rail.svg?react'
// The owned Noun set has no delete glyph yet; Lucide's trash stands in until one is licensed.
// Nor a two-way chevron for switchers, a terminal, a bare close cross, a plus, a mark for a continued thread, or the
// settings marks (a star for a picked model, a key, a plugin),
// or the data-table controls (sort arrows and the sort list, a filter, column
// options, hide and pin, a drag grip, one- and two-step chevrons for pages
// and selects, a calendar), or the Life controls (play, pause, one step,
// shuffle); Lucide's stand in the same way.
import {
  ArrowDown,
  ArrowDownUp as SortList,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SquareDashed,
  ChevronUp,
  ChevronsLeft as First,
  ChevronsRight as Last,
  ChevronsUpDown as UpDown,
  CornerDownRight as Continue,
  EyeOff as Hide,
  GripVertical as Grip,
  KeyRound as Key,
  Pause,
  Play,
  ListFilter as Filter,
  Pin,
  PinOff as Unpin,
  Plus as Add,
  Puzzle as Plugin,
  Settings2 as Columns,
  Shuffle,
  SkipForward as StepForward,
  SquareTerminal as Terminal,
  Star,
  Trash2 as Delete,
  X,
  BellOff as Mute,
  History,
  Radar,
  Database,
  FunctionSquare,
  ShieldCheck,
  Sigma,
  MessageCircleQuestion,
  Eye as ViewEye,
  PlugZap,
  Table2,
  Hash,
  FileText,
  Circle,
  File as LucideFile,
  Folder as LucideFolder,
  AudioLines as Audio,
  Bell,
  Inbox,
  Braces as Json,
  Clock3 as Later,
  Columns2 as Compare,
  Film as Video,
  Image as ImageMark,
  LayoutGrid as Apps,
  ListChecks as Checklist,
  MessagesSquare as Conversation,
  SquareArrowOutUpRight as Detach,
  Sparkles as Sparkle,
  Undo2 as Undo,
} from 'lucide-react'
import PenroseTriangle from '@/assets/icons/rail/noun-penrose-triangle-881122.svg?react'
import Projects from '@/assets/icons/rail/noun-projects-8375031.svg?react'
import Shellfile from '@/assets/icons/rail/noun-shellfile-1517619.svg?react'
import Archive from '@/assets/icons/records/noun-archive-8315826.svg?react'
import Check from '@/assets/icons/records/noun-checkmark-8086058.svg?react'
import Coding from '@/assets/icons/records/noun-coding-8259870.svg?react'
import Expand from '@/assets/icons/records/noun-expand-8086092.svg?react'
import Eye from '@/assets/icons/records/noun-eye-8086063.svg?react'
import Menu from '@/assets/icons/records/noun-menu-8086045.svg?react'
import Link from '@/assets/icons/records/noun-link-8086078.svg?react'
import ProjectRow from '@/assets/icons/tree/noun-data-8394841.svg?react'
import FolderClosed from '@/assets/icons/streamline/streamline-folder.png'
import AgentCursor from '@/assets/icons/streamline/streamline-agent-software-cursor-bot-2.png'
import AiFileRobot from '@/assets/icons/streamline/streamline-ai-file-robot.png'
import AiRouting from '@/assets/icons/streamline/streamline-ai-routing-agent-direction-1.png'
import AiVariation from '@/assets/icons/streamline/streamline-ai-generate-variation-robot.png'
import DesignFileSelect from '@/assets/icons/streamline/streamline-design-file-select.png'
import HierarchyTwo from '@/assets/icons/streamline/streamline-hierarchy-2.png'
import HierarchyFive from '@/assets/icons/streamline/streamline-hierarchy-5.png'
import PaginateMail from '@/assets/icons/streamline/streamline-paginate-filter-mail.png'
import WorkflowClosed from '@/assets/icons/streamline/streamline-workflow-request-closed.png'
import AiScienceSpark from '@/assets/icons/streamline/streamline-ai-science-spark.png'
import BrowserPageLayout from '@/assets/icons/streamline/streamline-browser-page-layout.png'
import CodeWrite from '@/assets/icons/streamline/streamline-code-write-1.png'
import CommonFileTextEdit from '@/assets/icons/streamline/streamline-common-file-text-edit.png'
import HierarchyOrganize from '@/assets/icons/streamline/streamline-hierarchy-5-organize.png'
import HierarchySix from '@/assets/icons/streamline/streamline-hierarchy-6.png'
import OfficeFileText from '@/assets/icons/streamline/streamline-office-file-text.png'
import PencilNote from '@/assets/icons/streamline/streamline-pencil-write-1.png'
import PaperPlane from '@/assets/icons/streamline/streamline-travel-paper-plane.png'
import WorkflowBranch from '@/assets/icons/streamline/streamline-workflow-branch.png'
import WorkflowPullRequest from '@/assets/icons/streamline/streamline-workflow-pull-request.png'
import CopyPaste from '@/assets/icons/streamline/streamline-copy-paste-1.png'
import CrossRegion from '@/assets/icons/streamline/streamline-cross-region-data-delivery-2.png'
import DownloadBox from '@/assets/icons/streamline/streamline-download-box.png'
import ShipmentUpload from '@/assets/icons/streamline/streamline-shipment-upload.png'
import SearchSquare from '@/assets/icons/streamline/streamline-search-square.png'
import SquareWireframe from '@/assets/icons/streamline/streamline-square-wireframe-3d.png'
import ShareBox from '@/assets/icons/streamline/streamline-share-1.png'
import XMark from '@/assets/icons/streamline/streamline-x.png'

import TreeFileMark from '@/assets/icons/tree/file.svg?react'
import FolderMark from '@/assets/icons/tree/folder-closed.svg?react'
import FolderOpenMark from '@/assets/icons/tree/folder-open.svg?react'
import CommonFileDouble from '@/assets/icons/streamline/streamline-common-file-double.png'
import CommonFileStack from '@/assets/icons/streamline/streamline-common-file-stack.png'
import DrawerFile from '@/assets/icons/streamline/streamline-drawer-file.png'
import FileOpen1 from '@/assets/icons/streamline/streamline-file-open-1.png'
import FolderFile1 from '@/assets/icons/streamline/streamline-folder-file-1.png'
import ZipFileLock from '@/assets/icons/streamline/streamline-zip-file-lock.png'
import ZipFileWarning from '@/assets/icons/streamline/streamline-zip-file-warning.png'

import AstronomyConstellation from '@/assets/icons/streamline/streamline-astronomy-constellation.png'
import AiRobotVariation from '@/assets/icons/streamline/streamline-ai-robot-generate-variation.png'
import DescendingSort from '@/assets/icons/streamline/streamline-descending-sort-filter-2.png'
import CommonFileAdd from '@/assets/icons/streamline/streamline-common-file-add.png'
import AiFileSparkle from '@/assets/icons/streamline/streamline-ai-file-sparkle.png'
import AiFolderSpark from '@/assets/icons/streamline/library/streamline-ai-folder-spark.png'
import { CONTROL_LAYERS } from '@/assets/icons/streamline/control/layers'

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

/** Paint order: the fills first, the outline over them. */
const ORDER = ['tint', 'paper', 'accent', 'line'] as const
export type MarkLayers = Partial<Record<(typeof ORDER)[number], string>>
type PaintedMark = FC<
  Pick<ComponentProps<'svg'>, 'className' | 'style' | 'aria-hidden'>
>

/**
 * What paints each layer of a control's mark. A control draws at a third of
 * the rail's size and its fills carry drawn detail (a bubble's lines, an
 * arrow), so each fill takes the next lighter colour: the accent is painted
 * as the tint and the tint as the paper, which keeps the outline legible.
 */
const SOFT = { tint: 'paper', paper: 'paper', accent: 'tint', line: 'line' }

/**
 * A coloured Streamline mark as stacked masks, one per layer
 * scripts/rail-icons.mjs splits its PNG into: the outline in ink, the accent
 * in the theme's accent turned `shift` degrees of the colour wheel, and the
 * tint and paper as that colour taken toward the ground (.rail-mark in
 * styles.css), so it follows the palette and the mode. Each layer is its own
 * element, so the mark is a span, not the empty <svg> a one-colour mark is:
 * it sizes itself, at a control's 16px unless the caller says otherwise.
 */
export const painted = (
  layers: MarkLayers,
  shift = 0,
  soft = false,
): PaintedMark =>
  function PaintedMark({ className, style, ...props }) {
    return (
      <span
        aria-hidden="true"
        {...props}
        className={cn('rail-mark size-4', className)}
        style={{ ...style, '--rail-shift': shift } as CSSProperties}
      >
        {ORDER.map((layer) => {
          const src = layers[layer]
          return (
            src && (
              <span
                key={layer}
                data-layer={soft ? SOFT[layer] : layer}
                className="icon-mask"
                style={{ '--icon-mask': `url("${src}")` } as CSSProperties}
              />
            )
          )
        })}
      </span>
    )
  }

/**
 * The folder and the file as the notes tree draws them. A project in the
 * sidebar and an entry in the file explorer are the same two marks, so a
 * folder is one thing wherever it is listed. Their colours are their own:
 * a caller's text colour does not repaint them.
 */
const Folder: SvgMark = ({ className, ...props }) => (
  <LucideFolder
    aria-hidden="true"
    {...props}
    className={cn('size-4 shrink-0', className, 'fill-folder text-folder')}
  />
)
const FileEntry: SvgMark = ({ className, ...props }) => (
  <LucideFile
    aria-hidden="true"
    {...props}
    className={cn('size-4 shrink-0', className, 'text-ink-muted')}
  />
)

const Artifact = masked(SquareWireframe)
const Copy = masked(CopyPaste)
const Download = masked(DownloadBox)
const TreeFile = solid(TreeFileMark)
const Diagram = masked(CodeWrite)
const Search = masked(SearchSquare)
const Share = masked(ShareBox)
const Web = masked(CrossRegion)
const Exit = masked(XMark)

const Panels = masked(BrowserPageLayout)

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
const TheoremVault = masked(SquareWireframe)
const AddNode = masked(HierarchyFive)
const Agent = masked(AiFileRobot)
const Delegate = masked(AiRouting)

/** Theorem's own model choice, where the person has not picked one. */
const Theorem = masked(AiRobotVariation)
const Sort = masked(DescendingSort)
const NewNote = masked(CommonFileAdd)
const AgentNote = masked(AiFileSparkle)
const File = masked(CommonFileDouble)
const Follow = masked(AgentCursor)
const Mail = masked(PaginateMail)
const Model = masked(AiVariation)
const NewGraph = masked(DesignFileSelect)
const Outline = masked(HierarchyTwo)
const Reject = masked(WorkflowClosed)
const Route = masked(AiRouting)
const Article = masked(OfficeFileText)
const Layout = masked(BrowserPageLayout)
const Canvas = masked(CodeWrite)
const Draft = masked(CommonFileTextEdit)
const Fork = masked(WorkflowBranch)
const Graph = masked(AstronomyConstellation)
const Note = masked(PencilNote)
const Organize = masked(HierarchyOrganize)
/** The Librarian, which files threads into projects. */
const Librarian = masked(AiFolderSpark)
const Proposal = masked(WorkflowPullRequest)
const Skill = masked(AiScienceSpark)
const Compound = masked(HierarchySix)
const Sink = masked(PaperPlane)
const Copied = solid(CopiedMark)
const Edit = solid(EditMark)
const More = solid(MoreMark)
const Next = solid(NextMark)
const Previous = solid(PreviousMark)
const Reload = solid(ReloadMark)
const TreeFolder = solid(FolderMark)
const TreeFolderOpen = solid(FolderOpenMark)
/** A program node's kind reads by its glyph and silhouette, never by hue. */
export const ProgramKindMark = {
  external_endpoint: PlugZap,
  source: Database,
  sentinel: Radar,
  rule: FunctionSquare,
  stochastic: Skill,
  verify: ShieldCheck,
  fold: Sigma,
  human_input: MessageCircleQuestion,
  sink: Sink,
  compound: Compound,
  view: ViewEye,
} as const

/** The five port shape classes, each paired with a low-chroma color at the node. */
export const PortClassMark = {
  table: Table2,
  graph: Graph,
  value: Hash,
  record: FileText,
  other: Circle,
} as const

/** The controls' coloured marks, each at its own turn of the wheel from the accent. */
/** The outline folder that stands for Theorem beside its replies. */
const Speaker = masked(FolderClosed)
const Thread = painted(CONTROL_LAYERS.thread, 180, true)
const ChatSearch = painted(CONTROL_LAYERS.chatSearch, 180, true)
const Send = painted(CONTROL_LAYERS.send, 0, true)
const Attachment = painted(CONTROL_LAYERS.upload, 180, true)
const AttachFolder = painted(CONTROL_LAYERS.attachFolder, 45, true)
const Plan = painted(CONTROL_LAYERS.plan, 180, true)
const WebSearch = painted(CONTROL_LAYERS.webSearch, 180, true)
const NewChat = painted(CONTROL_LAYERS.newChat, 45, true)
const ToolRunning = painted(CONTROL_LAYERS.toolRunning, 45, true)
const ToolDone = painted(CONTROL_LAYERS.toolDone, 135, true)

export const Icon = {
  Group: SquareDashed,
  Apps,
  Audio,
  Bell,
  Inbox,
  Checklist,
  Compare,
  Conversation,
  Detach,
  Image: ImageMark,
  Json,
  Later,
  Sigma,
  Sparkle,
  Table: Table2,
  Undo,
  Video,
  Download,
  Open,
  X,
  Artifact,
  Add,
  AddNode,
  Archive,
  ArrowDown,
  ArrowUp,
  Article,
  AttachFolder,
  Attachment,
  Calendar,
  Chat,
  ChatSearch,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Close,
  Code: Coding,
  Columns,
  Continue,
  Copied,
  Copy,
  Delete,
  Diagram,
  Draft,
  Edit,
  Exit,
  Expand,
  Eye,
  File,
  FileEntry,
  Filter,
  First,
  Follow,
  Folder,
  Fork,
  Grip,
  Hide,
  Ide: Shellfile,
  Key,
  Last,
  Layout,
  Librarian,
  Link,
  Mail,
  Menu,
  Microphone,
  Model,
  Moon,
  More,
  NewChat,
  NewGraph,
  Next,
  Panels,
  Pause,
  Pin,
  Play,
  Plugin,
  Previous,
  Project: ProjectRow,
  Projects,
  Refresh,
  Reload,
  Search,
  Send,
  Settings,
  Share,
  Shuffle,
  SortList,
  Spaces: PenroseTriangle,
  Canvas,
  Speaker,
  Star,
  StepForward,
  Stop,
  Sun,
  Terminal,
  Thread,
  ToolDone,
  ToolRunning,
  Unpin,
  UpDown,
  Web,
  WebSearch,
  Agent,
  Attachments,
  Delegate,
  Files,
  Graph,
  History,
  Index: Archive,
  Mute,
  Note,
  Notes,
  OpenFolder,
  Organize,
  Outline,
  Plan,
  Proposal,
  Reject,
  Route,
  Sink,
  Skill,
  NewNote,
  AgentNote,
  Sort,
  Theorem,
  TheoremVault,
  TreeFile,
  Trusted,
  Untrusted,
  Vault,
  TreeFolder,
  TreeFolderOpen,
}

export type IconName = keyof typeof Icon
