import React from "react";
import {
  IconDefinition as FontAwesomeIconDefinition,
  faTag,
  faLocationDot,
} from "@fortawesome/free-solid-svg-icons";
import AddTagOutlineIcon from '../../../assets/add-tag-outline.svg?react';
import AddMarkerOutlineIcon from '../../../assets/add-marker-outline.svg?react';
import {
  Heart,
  HeartFill,
  Bookmark,
  BookmarkFill,
  Pin,
  PinFill,
  ListUl,
  Star,
  StarFill,
  Icon0Circle,
  Icon0CircleFill,
  Icon1Circle,
  Icon1CircleFill,
  Icon2Circle,
  Icon2CircleFill,
  Icon3Circle,
  Icon3CircleFill,
  Icon4Circle,
  Icon4CircleFill,
  Icon5Circle,
  Icon5CircleFill,
  Icon6Circle,
  Icon6CircleFill,
  Icon7Circle,
  Icon7CircleFill,
  Icon8Circle,
  Icon8CircleFill,
  Icon9Circle,
  Icon9CircleFill,
  HandThumbsUp,
  HandThumbsUpFill,
  HandThumbsDown,
  HandThumbsDownFill,
  Icon as BootstrapIcon,
  ArchiveFill,
  Archive,
  Backpack3,
  Backpack3Fill,
  BagFill,
  Bag,
  Basket2Fill,
  Basket2,
  BellFill,
  Bell,
  CheckCircleFill,
  CheckCircle,
  CircleFill,
  Circle,
  ClipboardFill,
  Clipboard,
  ClockFill,
  Clock,
  CollectionFill,
  Collection,
  CollectionPlayFill,
  CollectionPlay,
  DropletFill,
  Droplet,
  Flag,
  FlagFill,
  Floppy,
  FloppyFill,
  FolderFill,
  Folder,
  Inbox,
  InboxFill,
  LightbulbFill,
  Lightbulb,
  LockFill,
  Lock,
  SuitClubFill,
  SuitClub,
  TelephoneFill,
  Telephone,
  Trash3Fill,
  Trash3,
  CardList,
  Tag,
  TagFill,
  TagsFill,
  Tags,
} from "react-bootstrap-icons";

export type ActionButtonIconSource = React.FunctionComponent<React.SVGProps<SVGSVGElement>>
  | FontAwesomeIconDefinition
  | BootstrapIcon
  | React.Component
export type ActionButtonIcon = ActionButtonIconSource
  | Record<string, ActionButtonIconSource>
  | React.FC<{ state: unknown }>

type ActionButtonIconDefinition = {
  states: Record<string, ActionButtonIconSource>,
  category: ("general" | "tag" | "marker" | "main")[]
}

const _actionButtonIcons = {
  "heart": {
    states: {
      active: HeartFill,
      inactive: Heart,
    },
    category: ["general"],
  },
  "bookmark": {
    states: {
      active: BookmarkFill,
      inactive: Bookmark,
    },
    category: ["general"],
  },
  "pin": {
    states: {
      active: PinFill,
      inactive: Pin,
    },
    category: ["general"],
  },
  "list": {
    states: {
      active: CardList,
      inactive: ListUl,
    },
    category: ["general"],
  },
  "star": {
    states: {
      active: StarFill,
      inactive: Star,
    },
    category: ["general"],
  },
  "add-tag": {
    states: {
      active: faTag,
      inactive: AddTagOutlineIcon,
    },
    category: ["tag", "main"],
  },
  "tag": {
    states: {
      active: TagFill,
      inactive: Tag,
    },
    category: ["tag"],
  },
  "tags": {
    states: {
      active: TagsFill,
      inactive: Tags,
    },
    category: ["tag"],
  },
  "thumbs-up": {
    states: {
      active: HandThumbsUpFill,
      inactive: HandThumbsUp,
    },
    category: ["general"],
  },
  "thumbs-down": {
    states: {
      active: HandThumbsDownFill,
      inactive: HandThumbsDown,
    },
    category: ["general"],
  },
  "0-circle": {
    states: {
      active: Icon0CircleFill,
      inactive: Icon0Circle,
    },
    category: ["general"],
  },
  "1-circle": {
    states: {
      active: Icon1CircleFill,
      inactive: Icon1Circle,
    },
    category: ["general"],
  },
  "2-circle": {
    states: {
      active: Icon2CircleFill,
      inactive: Icon2Circle,
    },
    category: ["general"],
  },
  "3-circle": {
    states: {
      active: Icon3CircleFill,
      inactive: Icon3Circle,
    },
    category: ["general"],
  },
  "4-circle": {
    states: {
      active: Icon4CircleFill,
      inactive: Icon4Circle,
    },
    category: ["general"],
  },
  "5-circle": {
    states: {
      active: Icon5CircleFill,
      inactive: Icon5Circle,
    },
    category: ["general"],
  },
  "6-circle": {
    states: {
      active: Icon6CircleFill,
      inactive: Icon6Circle,
    },
    category: ["general"],
  },
  "7-circle": {
    states: {
      active: Icon7CircleFill,
      inactive: Icon7Circle,
    },
    category: ["general"],
  },
  "8-circle": {
    states: {
      active: Icon8CircleFill,
      inactive: Icon8Circle,
    },
    category: ["general"],
  },
  "9-circle": {
    states: {
      active: Icon9CircleFill,
      inactive: Icon9Circle,
    },
    category: ["general"],
  },
  "archive": {
    states: {
      active: ArchiveFill,
      inactive: Archive,
    },
    category: ["general"],
  },
  "backpack": {
    states: {
      active: Backpack3Fill,
      inactive: Backpack3,
    },
    category: ["general"],
  },
  "bag": {
    states: {
      active: BagFill,
      inactive: Bag,
    },
    category: ["general"],
  },
  "basket": {
    states: {
      active: Basket2Fill,
      inactive: Basket2,
    },
    category: ["general"],
  },
  "bell": {
    states: {
      active: BellFill,
      inactive: Bell,
    },
    category: ["general"],
  },
  "check": {
    states: {
      active: CheckCircleFill,
      inactive: CheckCircle,
    },
    category: ["general"],
  },
  "circle": {
    states: {
      active: CircleFill,
      inactive: Circle,
    },
    category: ["general"],
  },
  "clipboard": {
    states: {
      active: ClipboardFill,
      inactive: Clipboard,
    },
    category: ["general"],
  },
  "clock": {
    states: {
      active: ClockFill,
      inactive: Clock,
    },
    category: ["general"],
  },
  "collection": {
    states: {
      active: CollectionFill,
      inactive: Collection,
    },
    category: ["general"],
  },
  "collection-play": {
    states: {
      active: CollectionPlayFill,
      inactive: CollectionPlay,
    },
    category: ["general"],
  },
  "droplet": {
    states: {
      active: DropletFill,
      inactive: Droplet,
    },
    category: ["general"],
  },
  "flag": {
    states: {
      active: FlagFill,
      inactive: Flag,
    },
    category: ["general"],
  },
  "floppy": {
    states: {
      active: FloppyFill,
      inactive: Floppy,
    },
    category: ["general"],
  },
  "folder": {
    states: {
      active: FolderFill,
      inactive: Folder,
    },
    category: ["general"],
  },
  "inbox": {
    states: {
      active: InboxFill,
      inactive: Inbox,
    },
    category: ["general"],
  },
  "lightbulb": {
    states: {
      active: LightbulbFill,
      inactive: Lightbulb,
    },
    category: ["general"],
  },
  "lock": {
    states: {
      active: LockFill,
      inactive: Lock,
    },
    category: ["general"],
  },
  "suit-club": {
    states: {
      active: SuitClubFill,
      inactive: SuitClub,
    },
    category: ["general"],
  },
  "telephone": {
    states: {
      active: TelephoneFill,
      inactive: Telephone,
    },
    category: ["general"],
  },
  "trash": {
    states: {
      active: Trash3Fill,
      inactive: Trash3,
    },
    category: ["general"],
  },
  "add-marker": {
    states: {
      active: faLocationDot,
      inactive: AddMarkerOutlineIcon,
    },
    category: ["marker"],
  },
} satisfies Record<string, ActionButtonIconDefinition>

export type ActionButtonIconName = keyof typeof _actionButtonIcons;

export const actionButtonIcons: Record<ActionButtonIconName, ActionButtonIconDefinition> = _actionButtonIcons;
