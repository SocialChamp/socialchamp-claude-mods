export type View = 'week' | 'month' | 'day' | 'issues' | 'drafts'

export type PostStatus = 'failed' | 'pending' | 'posted' | 'scheduled'

export type Post = {
  id: string
  channelId: string
  text: string
  dateTime: string
  socialType: string
  status: PostStatus
  error: string | null
  permalink: string | null
  labels: string[]
  media: number
  source: string
  labelIds: string[]
  /** The post inside the Social Champ app, when the connector gives it. */
  appUrl: string | null
  /** The channel's name as the post carries it, for channels the channel list does not have. */
  channelName: string | null
}

export type Channel = { id: string; name: string; type: string; workspaceId: string }

export type Workspace = { id: string; name: string }

export type Loaded = { from: string; to: string; at: number }

export type Watch = { today: number; failed: number; pending: number; next: string | null; at: number }

export type Label = { id: string; title: string }

export type ActionKind =
  | 'approve' | 'reject' | 'reschedule' | 'shift-day' | 'label-add' | 'label-remove' | 'label-create'
  | 'pause' | 'resume' | 'share' | 'create-post' | 'save-draft'
  | 'edit-text' | 'first-comment' | 'duplicate' | 'recycle' | 'share-toggle' | 'bulk-label' | 'bulk-move'
  | 'bulk-schedule' | 'image-import' | 'image-generate' | 'image-post' | 'remind' | 'bulk-retry' | 'delete-post' | 'delete-draft'

/** A post as a change saw it: checked again at Yes. The text only as a fingerprint. */
export type PostSnapshot = { id: string; dateTime: string; status: PostStatus; text: string; labelIds: string[] }

/** A change waiting for the person's Yes: the Social Champ call to make and what it means in words. */
export type Pending = {
  kind: ActionKind
  tool: string
  args: Record<string, unknown>
  summary: string
  /** Where the Yes / Cancel bar draws: a post id, a day, or 'toolbar'. */
  scope: string
  /** The post a change is about, when the call itself does not name it. */
  postId?: string
  /** Posts as the change saw them: re-read at Yes, and a difference cancels it. */
  expect?: PostSnapshot[]
  /** For a staged batch: the staged item ids sent, in the order of the batch's entries. */
  stagedIds?: string[]
  /** The change that would put this one back, for Undo. */
  inverse?: Pending
}

export type Shared = { name: string; link: string }

/** An existing share link: `id` is the database id the update tool takes. */
export type ShareLink = { id: string; name: string; isActive: boolean; hasPassword: boolean; link: string | null; from: string | null; to: string | null }

/** Posts Claude proposed with stage_posts, checked, waiting for the person to tick and schedule them. */
export type Staged = { workspaceId: string; items: Array<{ id: string; channelId: string; dateTime: string; text: string; checked: boolean }> }

/** The morning brief: today at a glance, once a day. */
export type Brief = { day: string; today: number; scheduled: number; failed: number; pending: number; emptyDays: string[] }

/** A recycle collection. */
export type Collection = { id: string; title: string; postCount: number }

/** A saved draft: no channel post yet, maybe no date. */
export type Draft = {
  id: string
  text: string
  dateTime: string | null
  createdBy: string | null
  channelIds: string[]
  attachments: number
  updatedAt: string | null
}

/** One get_calendar_summary row: how many posts of a status a channel has on a day. */
export type SummaryRow = { day: string; channelId: string; status: string; count: number }

/** A channel's queue timetable: slot times (HH:MM) per weekday (MON…SUN), in its zone. */
export type Timetable = { zone: string; days: Partial<Record<string, string[]>> }

/** Choices kept across sessions. */
export type Settings = { pollMinutes: number | null; writer: Writer; defaultWorkspace: string; showStatus: boolean; imagesPerSession: number }

/** A public holiday the Social Champ web calendar marks, on a calendar day. */
export type Holiday = { day: string; name: string }

/** A post being written in the pane: where it goes, its words, and when (ISO, or '' for no time yet). */
/** Who writes for the New post panel: Claude in the pane, or Social Champ's own AI writer. */
export type Writer = 'claude' | 'socialchamp'

/** `day` is the calendar day the post was started from: a bare HH:MM is read on it. */
export type Compose = {
  channelId: string; text: string; when: string; writer: Writer; day: string
  /** A Social Champ-hosted image to post with the words, when one was generated and picked. */
  imageUrl?: string
}

export type Ui = {
  view: View
  anchor: string
  posts: Post[]
  loaded: Loaded | null
  isLoading: boolean
  error: string | null
  selected: string | null
  workspace: string
  channel: string
  channels: Channel[]
  workspaces: Workspace[]
  watch: Watch | null
  confirm: Pending | null
  /** The change being made right now, in words; null when idle. */
  busy: string | null
  /** Each workspace's labels, by workspace id, loaded when a post in it is opened. */
  labels: Record<string, Label[]>
  /** Channels paused from this pane; Social Champ's tools cannot read a channel's paused state. */
  paused: string[]
  /** The toolbar panel open below it. */
  panel: 'share' | 'move' | 'compose' | null
  /** The last share link created from the pane. */
  shared: Shared | null
  /** The post being written in the New post panel. */
  compose: Compose | null
  /** Public holidays in the loaded range, as the workspace's web calendar shows them. */
  holidays: Holiday[]
  /** Claude's answer about one post, shown in its detail; from a side call that cannot act. */
  insight: { postId: string; text: string; isLoading: boolean } | null
  /** Month counts from the calendar summary, when the connector allows it; posts load per day instead. */
  summary: { from: string; to: string; at: number; rows: SummaryRow[] } | null
  /** The same over the Issues interval, for the tab's badge in month view. */
  issuesSummary: { from: string; to: string; rows: SummaryRow[] } | null
  /** The Drafts tab: one workspace's drafts, a page at a time. */
  drafts: { workspaceId: string; items: Draft[]; hasMore: boolean; isLoading: boolean; error: string | null } | null
  selectedDraft: string | null
  draftFilter: string
  /** Search over the loaded posts' words and channel names; '' for none. */
  search: string
  /** A label id posts must carry; '' for any. */
  labelFilter: string
  /** Free queue slots for the New post panel's channel. */
  slots: { channelId: string; items: string[] } | null
  /** The tool open in a post's detail view. */
  detailPanel: 'edit' | 'comment' | 'copy' | 'recycle' | null
  /** Text being edited in the detail view (edit text, first comment), with the post it belongs to. */
  editing: { postId: string; text: string } | null
  /** Duplicate: the target channel chosen. */
  copyChannel: string
  /** A workspace's existing share links, for the Share panel. */
  shares: { workspaceId: string; items: ShareLink[]; isLoading: boolean } | null
  /** A workspace's recycle collections, by workspace id. */
  collections: Record<string, Collection[]>
  /** The last change made from the pane, for two minutes of Undo. */
  undo: { pending: Pending; until: number } | null
  /** Several posts picked at once (one workspace), and whether picking is on. */
  selection: string[]
  isSelecting: boolean
  /** Claude's staged posts. */
  staged: Staged | null
  /** The morning brief, until dismissed. */
  brief: Brief | null
  /** Images generated for the New post panel, Social Champ-hosted links. */
  generated: string[]
  /** Whether the week shows the drag grid instead of its list. */
  dragMode: boolean
  /** Whether the Settings panel is open. */
  showSettings: boolean
  /** Whether the connector's login may use the approval tools; null until checked. */
  canApprove: boolean | null
}

declare module 'claude-code' {
  interface PluginState {
    'socialchamp-calendar': { ui: Ui }
  }
}
