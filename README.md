# Social Champ mods for Claude Code

`socialchamp-calendar`: the Social Champ calendar inside Claude Code. A side pane over your Social Champ account, and a
guard on Claude's own Social Champ calls. Every change the pane makes is shown first and sent only after you press
Yes; every change Claude makes from chat asks you in Claude Code's own question dialog, in every permission mode.

## Install

You need Claude Code 2.1.293 or later (`claude --version`; `claude update` to upgrade), which runs mods (plugins
with hooks), and the [Social Champ MCP connector](https://github.com/SocialChamp/socialchamp-mcp) connected.

The mod uses the connector named `SocialChamp`. When Claude Code says no server by that name exists, it looks for
`socialchamp`, `Social Champ` and `social-champ`, and uses the one that exists; if none does, or more than one does
(two connectors may be two accounts), it does not guess. It never switches away from a `SocialChamp` connector that
exists but has dropped. If the pane says it cannot reach Social Champ, set your connector's name (as `/mcp` lists it)
in Claude Code with `/plugin configure socialchamp-calendar@socialchamp-mods`.

```bash
claude plugin marketplace add SocialChamp/socialchamp-claude-mods
claude plugin install socialchamp-calendar@socialchamp-mods
```

Then run `/reload-plugins` and open the pane with `/socialchamp-calendar`. If you use auto mode, the pane's calls
are refused until you add the permission rules below. Add them only after the pane has opened: the rules turn off
Claude Code's own prompt for these tools, and the mod's guard is what asks you instead. If you uninstall the mod,
remove the rules too.

To update: `claude plugin marketplace update socialchamp-mods`, then `claude plugin update socialchamp-calendar@socialchamp-mods`
and `/reload-plugins`.

Some connector tools answer only for a workspace's owner (the month summary, drafts, queue slots, calendar events),
so team members see the pane without those parts; approving, rejecting and approval reminders need the `manage_team` scope.

## What it does

- **Views**: Week, Month (counts from one summary call), Day, Issues (failed and waiting for approval,
  two weeks), Drafts. Workspace and channel filters, search, a label filter, public holidays.
  `/socialchamp-calendar [week|month|day|issues|drafts|refresh]`.
- **Changes, each behind Yes / Cancel**, with a line saying whether and where it can be undone:
  reschedule (±1 hour, +1 day, a typed time, retry a failed post), drag a post to another day in Week view,
  move a whole day, edit a post's words, labels, pause and resume a channel or workspace, share a date range as a
  link and turn links off, duplicate to another channel, recycle into a collection, Instagram first comment,
  approval reminder, approve / reject (when the connection may), delete a post (cannot be undone; drafts are deleted in Social Champ, see Known gaps).
- **Several posts at once**: select in Day or Issues, then move, retry every failed one, or add a label.
- **New post**: Claude or Social Champ AI writes it, shortens, expands, rephrases, adds hashtags; the channel's
  character limit; free queue slots as one-press times; an AI image (one a session by default).
- **Undo** for two minutes after a move, a label change or an edit. Edits and undo re-read the post first and
  stop if Social Champ has it differently.
- **Claude in the pane**: "Ask Claude" answers there (a side call that cannot act), "Continue in chat" carries
  the answer over. Hand-offs fill your prompt box; feed-made posts' words are never handed over.
- **Morning brief** once a day on the week; a status-line watch for failures (Settings: interval or off).
- **Phone**: on the Claude mobile app the pane uses buttons instead of fields and dropdowns.

## Claude and Social Champ

- Tools Claude can call: `show_in_calendar` (move the pane to a view, day or post), `calendar_context` (ids,
  times, statuses and counts of what the pane shows; never post words or names), `stage_posts` (up to 30
  drafted posts, checked, shown in the pane as a checklist you tick and schedule with one Yes). None of
  them changes Social Champ.
- The guard on Claude's own calls to any Social Champ connector: reads pass; post metrics and best times are
  refused (Facebook does not allow passing metrics to a third party); deleting posts is refused (do it in
  Social Champ); batches over 10 items are refused (stage them instead); every other call is put to you with
  every argument shown, and "PUBLISHES NOW" when it would go out at once. Dismissing the question refuses it.

## Permissions

In auto mode the pane's own calls were refused until the tools had `permissions.allow` rules in
`~/.claude/settings.json`. These rules also let Claude call the tools from chat without Claude Code's own
prompt; the guard above still asks you for every write. The mod never edits settings. Each rule is
`mcp__<connector>__<tool>`, where `<connector>` is the name `/mcp` lists with spaces as underscores: `mcp__SocialChamp__update_post`,
`mcp__socialchamp__update_post` or `mcp__Social_Champ__update_post`. Add them to the `permissions.allow` list in
`~/.claude/settings.json`, keeping what is already there:

```json
{ "permissions": { "allow": ["...your existing rules...", "mcp__socialchamp__get_paginated_posts", "mcp__socialchamp__update_post"] } }
```

The tools (the approval reminder uses `approval_assign`):

- Reads: `get_paginated_posts`, `get_channels`, `get_workspaces`, `approval_list_pending`, `label_list`,
  `get_shareable_calendars`, `get_calendar_events`, `get_calendar_summary`, `get_drafts`, `get_queue_slots`,
  `get_posts_for_channels`, `list_collections`.
- Writing words: `generate_post`, `rewrite`, `suggest_hashtags`.
- Changes: `update_post`, `queue_reorder`, `label_create`, `label_apply`, `label_remove`, `queue_pause`,
  `queue_resume`, `create_public_calendar_link`, `update_shareable_calendar`, `create_text_post`,
  `create_image_post`, `generate_image`, `bulk_label`, `bulk_schedule`, `instagram_first_comment`,
  `recycle_post`, `approval_assign`, `approval_approve`, `approval_reject`, `delete_post`.

To remove them, delete those entries from `permissions.allow`; the pane then asks or is refused per call.

## What it keeps on this machine

In its plugin store (`~/.claude/plugins/store/`, the `socialchamp-calendar` file): workspace and channel names and ids
(refreshed daily), channels paused from the pane, ids of failures already announced (last 500), your settings
and last view, the brief's date, a record of a change in flight (cleared when it settles), and a log of the last
30 steps (step, ok, a count, the kind of failure). No post words, errors or links. Delete that file to clear it.

## Develop

`claude plugin validate .` and `claude plugin test .` check the manifest, the hooks module and the tests.
`hooks/data.ts` holds the pure helpers (and the safety checks), `hooks/register.tsx` the hooks, loaders and every
write, `hooks/views.tsx` the pane's drawing (it never holds `$`: handlers come bound from register.tsx as `act`), and
`hooks/drag.tsx` the week's drag grid.

## Known gaps in the connector

- Drafts cannot be deleted through it yet (it answers success without deleting), so the pane sends you to Social Champ.
- Image generation can time out.

## Licence

MIT
