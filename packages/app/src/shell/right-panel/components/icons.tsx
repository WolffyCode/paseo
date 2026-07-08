import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FolderOpen,
  GitCompareArrows,
  Globe,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react-native";
import type { ComponentType } from "react";

// The right panel's lucide icon set. Plain lucide components taking size + color; the owning `observer`
// reads themeModel.tokens and passes the role color via `color`, so an icon repaints on a scheme flip
// with no per-icon theme wrapper (mirrors shell/components/icons.tsx). Kept in the right-panel tree so the
// module stays zero-touch on the old app components dir.

export type PanelIcon = ComponentType<{ size?: number; color?: string }>;

export const IconFile: PanelIcon = FileIcon;
export const IconImage: PanelIcon = ImageIcon;
export const IconX: PanelIcon = X;
export const IconPlus: PanelIcon = Plus;
export const IconMaximize: PanelIcon = Maximize2;
export const IconMinimize: PanelIcon = Minimize2;
export const IconPanelRight: PanelIcon = PanelRight;
export const IconChevronRight: PanelIcon = ChevronRight;
export const IconChevronDown: PanelIcon = ChevronDown;
export const IconArrowUp: PanelIcon = ArrowUp;
export const IconSearch: PanelIcon = Search;
export const IconCheck: PanelIcon = Check;
export const IconLock: PanelIcon = Lock;
export const IconEye: PanelIcon = Eye;
export const IconPencil: PanelIcon = Pencil;
export const IconFolderOpen: PanelIcon = FolderOpen;
export const IconRefresh: PanelIcon = RefreshCw;
export const IconDownload: PanelIcon = Download;
export const IconExternal: PanelIcon = ExternalLink;
export const IconTerminal: PanelIcon = Terminal;
export const IconGlobe: PanelIcon = Globe;
export const IconReview: PanelIcon = GitCompareArrows;
export const IconConversation: PanelIcon = MessageSquare;
export const IconWifiOff: PanelIcon = WifiOff;
export const IconAlert: PanelIcon = TriangleAlert;
export const IconInfo: PanelIcon = Info;
export const IconCircleAlert: PanelIcon = CircleAlert;
export const IconCopy: PanelIcon = Copy;
export const IconSpinner: PanelIcon = LoaderCircle;
