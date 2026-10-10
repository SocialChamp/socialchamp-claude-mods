# Social Champ Calendar for Claude Code

See and manage your [Social Champ](https://www.socialchamp.com) posting calendar without leaving Claude Code,
and let Claude help plan it, without ever letting anything go out that you did not approve.

![The calendar pane next to a Claude Code session](docs/screenshots/overview.png)

<sub>All screenshots use made-up demo data (a café called Harbor Cafe). You can open the same demo yourself:
see [Try it without an account](#try-it-without-an-account).</sub>

## Contents

- [Why use it](#why-use-it)
- [What you need](#what-you-need)
- [Set it up, step by step](#set-it-up-step-by-step)
- [Try it without an account](#try-it-without-an-account)
- [A tour of the pane](#a-tour-of-the-pane)
- [Examples](#examples)
- [How it keeps you in control](#how-it-keeps-you-in-control)
- [Auto mode: permission rules](#auto-mode-permission-rules)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)
- [Privacy: what stays on your computer](#privacy-what-stays-on-your-computer)
- [Update or remove it](#update-or-remove-it)
- [Known limitations](#known-limitations)
- [For developers](#for-developers)

## Why use it

If you schedule social posts with Social Champ and work in Claude Code, you can now do both in one place. Most of
it happens in a pane beside your chat, and no change from the pane reaches Social Champ until you press
**✅ Yes, do it**.

**See your calendar**
- **Week and Day views** list every post of every connected channel, with its time, network, channel and status
  (posted, scheduled, failed, waiting for approval); **Month** shows each day's counts, failures in red.
- **Issues**: every failed post (with Social Champ's reason) and every post waiting for approval, across two weeks;
  the tab shows how many need you (a **+** means more may still be loading).
- **Drafts**: the workspace's drafts, who wrote them and when they are planned, with a filter and **Load more**.
- **Navigate** by week, month or day (**‹ Today ›**), open a day from the week or the month, and **↻ Refresh**.
- **Filters**: by workspace and channel everywhere; a word search and a label filter in Week, Day and Issues.
- **Public holidays** marked on the days they fall (the workspace's; with all workspaces shown, the first one's), and a **🌞 Today** card each morning: what goes out today, what
  failed since yesterday, what waits for approval, and which days have nothing planned.
- **A status-line watch** of today's posts (how many, failed, waiting, the next one), checked every few minutes
  even with the pane closed, with a notice when one fails.
- **After an interruption**, the next session tells you if a change may not have finished.

**Fix and change posts**
- **Reschedule** a post not yet published: −1 hour, +1 hour, +1 day, a time you type, or drag it to another day in
  the week.
- **Retry a failed post** in 15 minutes, or tick several failed posts in Issues and retry them together.
- **Move a day's unpublished posts** to the next day or a date you pick.
- **Edit the words** of a scheduled or failed post, with the channel's character limit shown as you type.
- **Labels**: add, remove or create labels on a post, or add one label to several posts at once.
- **Duplicate** an unpublished post (without attachments) to another channel, **recycle** a post into a collection.
- **Instagram first comment** on an Instagram business post, written by you or by **✨ Write it**.
- **Approvals**: approve or reject (when your connection may), or **send a reminder** to approvers.
- **Pause or resume publishing** for a channel or a whole workspace.
- **Share a date range as a public link** (optionally with a password), copy it, and turn links off or on again.
- **Delete a post** (it asks first and says it cannot be undone).
- **Several posts at once**: select them in Day or Issues, then move them, retry the failed ones, or add a label.
- **Open a post** in Social Champ, or the published post on its network.
- **Undo** for two minutes after a move, a label change on one post, or an edit. Before an edit or an undo, the pane re-reads the
  post and stops if someone changed it in Social Champ meanwhile.

**Write new posts**
- **New post** for any channel, written by Claude or by Social Champ AI from a topic, or typed yourself.
- **Shorten, expand, rephrase or add hashtags** with one click.
- **Free queue times** offered as one-click times, or type your own.
- **Generate an image** for the post with Social Champ AI.
- **Schedule it, or save it as a draft.**

**Let Claude help**
- **✨ Ask Claude** why a post failed, to review a post, or to polish a draft; the answer appears in the pane, and
  **Continue in chat** carries it over.
- **✨ Ask Claude to review this week**, **to draft posts for a day** (today or later), or **to fill the empty
  days**: the request is put in your prompt box for you to send.
- **From the chat**, ask for posts (*"draft five posts for next week"*) and Claude stages them in the pane as a
  checklist; you tick the ones you want and schedule them with one Yes.
- Claude can also move the pane to a day or a post, and read the ids, times, statuses and counts of what the pane
  has loaded (up to 200 posts; never post words or names).

**Stay in control**
- Every change in the pane is shown first, with whether and where it can be undone, and sent only after your Yes.
- When Claude itself tries to change something in Social Champ from the chat, you are asked first, every time, in
  every permission mode. Deleting posts, reading post metrics or best times, and large batches are refused from
  the chat.
- **🔧 Settings** in the pane: how often to check for failures, who writes new posts, AI images per session, and
  the workspace the pane opens on the first time (after that it opens where you left it).
- Works in the terminal and the Claude desktop app. On the Claude phone app the pane uses buttons only: you can look,
  move, retry and approve, but writing, editing, sharing, search and settings need a computer.

It is a *mod* (a Claude Code plugin with a live pane), built on the
[Social Champ MCP connector](https://github.com/SocialChamp/socialchamp-mcp).

## What you need

| | |
|---|---|
| **Claude Code 2.1.293 or later** | In a terminal or in the Claude desktop app's Code tab. Check with `claude --version`; upgrade with `claude update`. Older versions do not run this mod: `/socialchamp-calendar` answers that no hook handled it. |
| **A Social Champ account** | With at least one connected channel. Some views need you to be the workspace's owner (see [Known limitations](#known-limitations)). |
| **The Social Champ connector in Claude Code** | Step 1 below adds it. It is Social Champ's official MCP server, and you sign in through your browser. |
| **Python 3** (only for the demo) | Only to [try the demo](#try-it-without-an-account). Not needed to use the mod. |

## Set it up, step by step

### 1. Connect Social Champ to Claude Code

Run this in a terminal:

```bash
claude mcp add --scope user --transport http SocialChamp https://mcp.socialchamp.com/mcp
```

Then sign in:

1. Start Claude Code (`claude` in a terminal, or a new session in the desktop app's Code tab).
2. Type `/mcp`, choose **SocialChamp**, then **Authenticate**.
3. Your browser opens on Social Champ. Sign in and approve access.
4. Back in Claude Code, `/mcp` now shows SocialChamp as connected.

`--scope user` makes the connector available in every folder you open Claude Code in. The name `SocialChamp` is the
one the mod looks for, so nothing else needs setting.

> **Already have the connector under another name** (for example `socialchamp`)? Keep it, and skip the
> `claude mcp add` command. You will set the name once in step 3.

### 2. Install the mod

```bash
claude plugin marketplace add SocialChamp/socialchamp-claude-mods
```

```bash
claude plugin install socialchamp-calendar@socialchamp-mods
```

The first command adds this repository as a source of plugins. The second installs the calendar from it.

### 3. Open the calendar

In Claude Code, run `/reload-plugins` (or start a new session).

If your connector has a name other than `SocialChamp`, run `/plugin configure socialchamp-calendar@socialchamp-mods`
now and enter the name exactly as `/mcp` lists it.

Then open the pane:

```
/socialchamp-calendar
```

The pane opens on this week (later, on the view you used last). You should see your workspaces in the dropdown at the top and your posts listed by
day. If you see an error instead, check [Troubleshooting](#troubleshooting).

### 4. Only if you use auto mode: allow the Social Champ tools

In auto mode, Claude Code refuses the pane's calls until they are allowed. Add the
[permission rules](#auto-mode-permission-rules) **after** the pane has opened once. In the other modes you can skip
this step.

## Try it without an account

You can open the pane on demo data before connecting a Social Champ account. You need Claude Code 2.1.293+ that you
are signed in to, Python 3, git and bash (standard on macOS and Linux):

```bash
git clone https://github.com/SocialChamp/socialchamp-claude-mods.git
```

```bash
cd socialchamp-claude-mods && ./demo/try.sh
```

Add `month`, `day`, `issues` or `drafts` to open another view (`./demo/try.sh month`).

The script opens an ordinary, interactive Claude Code session (leave it with `/exit`). In it, the only connector is
a small fake Social Champ server, [`demo/demo_sc.py`](demo/demo_sc.py), and the mod runs from the cloned folder:

- **Nothing reaches Social Champ.** Your real connectors are not loaded in that session, and the fake server makes no
  network or file access. Claude Code itself still works as usual (it talks to Claude when you chat or press
  **✨ Ask Claude**, using your Claude account).
- **Your installed copy is untouched.** The demo keeps its own settings and cache, separate from an installed mod.
- **Demo changes are make-believe.** Moves, edits, labels, new posts and deletes show up until you quit; other
  changes answer OK and change nothing. Delete the cloned folder when you are done.

## A tour of the pane

Open a view with `/socialchamp-calendar week`, `month`, `day`, `drafts` or `issues`, or with the tabs at the top
of the pane. `/socialchamp-calendar refresh` reloads from Social Champ and goes back to today.

### Week

![Week view](docs/screenshots/week.png)

- The top row moves between weeks (**‹**, **Today**, **›**).
- The dropdowns pick a workspace and a channel; **Search posts** filters by words.
- The **🌞 Today** card appears once a day: what goes out today, what failed, what is waiting for approval.
- Each post shows its time, network, channel and first words. **✓** posted, **•** scheduled, **✕** failed,
  **◷** waiting for approval.
- **✋ Drag to reschedule** lets you drag posts not yet published to another day.
- Click a post to open it; click **View day ›** to see a whole day.

### Month

![Month view](docs/screenshots/month.png)

Counts per day for the whole month, with failures in red. Click a day to open it.

### Day

![Day view](docs/screenshots/day.png)

Every post of one day. With a workspace picked, today and later days also have **+ New post**, **☑ Select** (several posts at
once) and **✨ Ask Claude to draft posts**.

### Drafts

![Drafts view](docs/screenshots/drafts.png)

The workspace's drafts, with who wrote them and when they are planned, and a filter. Click one to read it, have
Claude polish it, or open Social Champ's Drafts page to schedule it.

### Issues

![Issues view](docs/screenshots/issues.png)

Everything that needs you, across two weeks: failed posts with Social Champ's reason, and posts waiting for
approval. The **🚩 Issues** tab shows how many there are, from any view.

### A post

Opening a post shows its full text, labels, status and links, and the things you can do with it:

- **+1 hour**, **+1 day**, or type a new time; **Retry in 15 min** for a failed post.
- Edit its words, add or remove labels, write an Instagram first comment.
- Duplicate it to another channel, recycle it into a collection, remind approvers.
- **✨ Ask Claude why it failed** / **✨ Ask Claude to review it**: Claude answers inside the pane.
- Delete it (asks first, and says it cannot be undone).

## Examples

### Move a post by an hour

1. Click a scheduled post in the week (posts already out cannot be moved).
2. Click **+1 hour**.
3. A bar appears, for example *Move "Weekend brunch…" on Harbor Cafe from Sat 8:00 AM to Sat 9:00 AM*, with a line
   saying whether it can be undone.
4. Click **✅ Yes, do it**. A *✅ Done* message appears and the pane refreshes.
5. Changed your mind? **↩ Undo** stays for two minutes.

### Retry everything that failed

1. Open **🚩 Issues**.
2. Click **☑ Select**, tick the failed posts, and click **🔁 Retry … failed**.
3. Confirm with **✅ Yes, do it**. Each post is retried a minute apart.

### Ask Claude to plan next week

Type in the chat:

> Draft five posts for Harbor Cafe for next week about our autumn menu, one a day at 9am, and stage them in the calendar.

Claude writes the posts and puts them in the pane as a checklist (nothing is scheduled yet). Untick any you do not
want, then press **✅ Yes, do it** once to schedule the rest.

### Other things to ask Claude

- *"Show me next Tuesday in the calendar."* The pane jumps there.
- *"Which channels have nothing scheduled this week?"* Claude reads what the pane shows (times, statuses, counts).
- *"Why did the Instagram post on Wednesday fail?"*
- *"Write a first comment for tomorrow's Instagram post."*

## How it keeps you in control

**In the pane**, every change shows a confirmation bar first. It says what will change, and whether and where it
can be undone: *You can undo this here*, *Undo in Social Champ: …*, *Reverse it here: …*, or *This cannot be
undone*. Before an edit or an
undo, the pane re-reads the post and stops if someone changed it in Social Champ meanwhile.

**In the chat**, the mod watches Claude's own calls to the Social Champ connector:

| Claude tries to… | What happens |
|---|---|
| Read posts, channels, drafts, labels | Allowed. |
| Change something (schedule, edit, label, pause…) | You are asked in Claude Code's question dialog, with every argument shown (long values shortened; post words in full, or the call is refused), **PUBLISHES NOW** when it would go out at once (a new post with no time, or with a time already past), and a warning when it asks to move a post to a time already past (Social Champ refuses those). Dismissing the question refuses it. |
| Delete posts | Refused. Delete in the pane (it asks you) or in Social Champ. |
| Send more than 10 posts in one batch (bulk schedule, bulk label, queue reorder, bulk delete) | Refused. Claude stages them in the pane instead, where you tick and confirm. |
| Read post metrics or best times | Refused. Facebook does not allow passing metrics to a third party. |
| Anything, when the mod's check itself fails | Refused before it runs. |

Claude also gets three tools of its own, none of which change Social Champ: `show_in_calendar` (move the pane),
`calendar_context` (ids, times, statuses and counts of what the pane shows, never post text or names) and
`stage_posts` (up to 30 checked drafts, as a checklist in the pane).

## Auto mode: permission rules

In auto mode, Claude Code refuses MCP calls it has no rule for, including the pane's. Each rule is
`mcp__<connector>__<tool>`. With the connector named as in step 1, that is `mcp__SocialChamp__<tool>`. If yours has
another name, use the name `/mcp` lists, with spaces as underscores.

Add the rules to the `permissions.allow` list in `~/.claude/settings.json`, keeping the rules already there. For
example:

```json
{
  "permissions": {
    "allow": [
      "mcp__SocialChamp__get_paginated_posts",
      "mcp__SocialChamp__update_post"
    ]
  }
}
```

The tools the pane uses:

- **Reading**: `get_paginated_posts`, `get_channels`, `get_workspaces`, `approval_list_pending`, `label_list`,
  `get_shareable_calendars`, `get_calendar_events`, `get_calendar_summary`, `get_drafts`, `get_queue_slots`,
  `get_posts_for_channels`, `list_collections`.
- **Writing words**: `generate_post`, `rewrite`, `suggest_hashtags`.
- **Changing**: `update_post`, `queue_reorder`, `label_create`, `label_apply`, `label_remove`, `queue_pause`,
  `queue_resume`, `create_public_calendar_link`, `update_shareable_calendar`, `create_text_post`,
  `create_image_post`, `generate_image`, `bulk_label`, `bulk_schedule`, `instagram_first_comment`,
  `recycle_post`, `approval_assign` (approval reminders), `approval_approve`, `approval_reject`, `delete_post`.

You can allow only the reading tools at first; a change you have not allowed is refused with a message saying so.

These rules also stop Claude Code itself asking before Claude calls those tools from the chat. The mod's own check
(above) still asks you before every change. If you uninstall the mod, remove the rules too.

## Settings

- **In the pane**, the **🔧** button: how often the status line checks for failed posts (or off), who writes new
  posts (Claude or Social Champ AI), how many AI images a session may make, and which workspace the pane opens on the first time (after that it
  opens on the workspace you used last).
- **Plugin options**: run `/plugin configure socialchamp-calendar@socialchamp-mods`.
  - `server`: the connector's name as `/mcp` lists it (default `SocialChamp`).
  - `pollMinutes`: how often to check today's posts for failures (default 5; 0 turns it off).

## Troubleshooting

| You see | What to do |
|---|---|
| *No Social Champ connector named "SocialChamp" is connected* | Run `/mcp`. If the connector is missing, do [step 1](#1-connect-social-champ-to-claude-code). If it is there under another name, set that name with `/plugin configure socialchamp-calendar@socialchamp-mods`. If it says it needs authentication, choose it and **Authenticate**. |
| *Loading…* for a few seconds when Claude Code starts | Normal: the pane waits for the connector to finish starting, and retries by itself. |
| *registered /socialchamp-calendar but no command.run hook answered it*, or an error about `$.state.get` | Your Claude Code is too old (the mod needs 2.1.293 or later). Run `claude update`, then restart it. |
| *Auto mode blocked this change* | Add the [permission rules](#auto-mode-permission-rules). |
| No drafts or queue times, or the month loads slowly | Those connector tools answer only for the workspace's owner. The month then counts posts itself, which takes longer; drafts and queue times need the owner. |
| Approve / Reject missing | Approvals need the `manage_team` scope. The browser sign-in asks only for `read_profile` and `manage_post`. |
| `/socialchamp-calendar` is unknown | Run `/reload-plugins`, or check `claude plugin list` shows `socialchamp-calendar@socialchamp-mods` as enabled. |

## Privacy: what stays on your computer

**Where your data goes.** The pane reads and changes your calendar only through the Social Champ connector you set
up. It sends something to Claude only when you use a Claude feature:

- **✨ Ask Claude why it failed / to review it**: that post's words, its error (if any), its network, status and time.
- **Polish a draft**: the draft's words.
- **Writing a new post with Claude**: the topic you type, the channel's name and network, and the words of up to
  five of that channel's most recent posts loaded in the pane, so Claude can match their voice (posts that came from feeds are left out).
- **Hand-offs to the chat** (for example *Ask Claude to draft posts for this day*): a request put in your prompt
  box, with day names, workspace and channel names, and the time, network, status and first 80 characters of the
  posts already there (feed posts' words left out). Nothing is sent until you press Enter.

Claude's own tools (`calendar_context`) give it ids, times, statuses and counts, never post words or names.

**What stays on your computer**, in Claude Code's plugin store (`~/.claude/plugins/store/`, the file whose name
starts with `socialchamp-calendar_socialchamp-mods`): workspace and channel names and ids (refreshed daily, and
only reused for the same connector), channels you paused from the pane, ids of failures it already told you about,
your settings and last view, the date of the last morning brief, a note of a change still in progress (cleared when
it finishes), and a short log of its last 30 steps (step name, success, a count, the kind of failure). No post
text, error text or links. Delete that file to clear it.

## Update or remove it

**Update**, then run `/reload-plugins`:

```bash
claude plugin marketplace update socialchamp-mods
```

```bash
claude plugin update socialchamp-calendar@socialchamp-mods
```

**Remove**:

```bash
claude plugin uninstall socialchamp-calendar@socialchamp-mods
```

```bash
claude plugin marketplace remove socialchamp-mods
```

Then remove the permission rules you added (`mcp__SocialChamp__…`, or your connector's name), and delete the file
whose name starts with `socialchamp-calendar_socialchamp-mods` in `~/.claude/plugins/store/`. To disconnect Social
Champ too, run `claude mcp remove SocialChamp --scope user` (with your connector's name if it differs).

## Known limitations

- **Owner-only views**: the month summary, drafts, queue slots and calendar events answer only for a workspace's
  owner. Team members see the pane without them.
- **Approvals** need the `manage_team` scope.
- **Drafts cannot be deleted** through the connector yet (it answers success without deleting), so the pane points
  you to Social Champ for that.
- **AI image generation** can time out.
- **On the Claude phone app**, the pane uses buttons only (no text fields or dropdowns), and some panels say to open
  the desktop app.

## For developers

From the root of a clone of this repository:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

- `hooks/data.ts`: pure helpers and the safety checks.
- `hooks/register.tsx`: the hooks, loaders and every write.
- `hooks/views.tsx`: the pane's drawing. It never holds `$`; handlers come bound from `register.tsx` as `act`.
- `hooks/drag.tsx`: the week's drag grid.
- `demo/`: the demo connector and `try.sh`. The screenshots in `docs/screenshots/` were taken with it.

## Licence

MIT. See [LICENSE](LICENSE).
