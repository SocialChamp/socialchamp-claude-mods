import type { Elements, RenderElement } from 'claude-code'

import type { Pending, Post, Ui, Writer } from '../types'
import {
  addDays, badge, channelOptions, workspaceOptions, byDay, counts, covers, dayLabel, dayOf, days, filterPosts, isoRange,
  clip, isMovable, isValidPassword, labelOptions, loadRange, monthGrid, parseWhen, pickForDay, platform,
  charLimit, platformColor, plural, relativeTime, rangeFor, rangeLabel, shiftDayItems, snippet,
  timeOf, whenLabel, addMinutes, onDay, ymd,
  reversibility, networkLink, isHandOffSafe, fenced, summaryByDay, sumCounts, matchesSearch,
  snapshotOf, FIRST_COMMENT_LIMIT, textHash,
  SELECTION_LIMIT, retryItems, stagedEntries, } from './data'
import type { Act } from './register'

// The pane's drawing, apart from its hooks: register.tsx loads and writes; this draws from what it is handed.
// It never holds `$`: every effect goes through `act`, bound in register.tsx to that dispatch's `$`.

export const CALENDAR_URL = 'https://app.socialchamp.com/calendar'
export const TAB_LABELS = { week: '📆 Week', month: '📅 Month', day: '🌞 Day', issues: '🚩 Issues', drafts: '📝 Drafts' } as const
export const STATUS_WORDS = { scheduled: 'Scheduled', posted: 'Published', failed: 'Failed', pending: 'Waiting for approval' } as const
export const BRAND = '#F7752A'
export const STATUS_CHIP = { scheduled: '#2563EB', posted: '#16A34A', failed: '#DC2626', pending: '#D97706' } as const
export const SCOPE_HINT = 'Approvals need the manage_team permission: reconnect the Social Champ connector with it'
export const WEEK_ROWS_PER_DAY = 6

/** What a draw needs: the render event, the surface's elements, the pane's value as read, and the handlers. */
export type PaneInput = {
  e: { surface: string; props: unknown }
  /** The elements every surface has; the field and drag elements come separately, null where absent. */
  elements: Pick<Elements['mobile'], 'Box' | 'Text' | 'Button' | 'Link'>
  ui: Ui
  act: Act
  Client: Elements['desktop']['Client'] | null
  Select: Elements['desktop']['Select'] | null
  Input: Elements['desktop']['Input'] | null
}

// The limit matters only when it is near: Facebook's 63,206 is noise on a 70-character post.
const lengthNote = (n: number, limit: number | undefined) =>
  limit !== undefined && (limit <= 5000 || n > limit * 0.8) ? `${n} / ${limit}` : plural(n, 'character')

export function drawPane(input: PaneInput): RenderElement {
  const { e, elements, ui, act, Client, Select, Input } = input
  const { Box, Text, Button, Link } = elements
  const { view: v, posts: all, channels: chs, workspaces: wss, workspace: ws, channel: ch, selected: sel } = ui
  const { confirm: pendingConfirm, isLoading: loading, error: err, loaded: lastLoad, canApprove } = ui
  const { busy, labels, paused, panel, shared } = ui
  const day = ui.anchor || ymd(new Date())
  const today = ymd(new Date())
  const nowIso = new Date().toISOString()
  const width = (e.props as { bodyColumns?: number }).bodyColumns ?? 60

  const byId = new Map(chs.map(c => [c.id, c]))
  const nameOf = (p: Post) => byId.get(p.channelId)?.name ?? p.channelName ?? platform(p.socialType)
  const shown = filterPosts(all, chs, ws, ch)
    .filter(p => matchesSearch(p, ui.search, nameOf(p)) && (ui.labelFilter === '' || p.labelIds.includes(ui.labelFilter)))
  const isFiltering = ui.search !== '' || ui.labelFilter !== ''
  const grouped = byDay(shown)
  const isPaused = (channelId: string) => paused.includes(channelId)
  const holidaysOn = (d: string) => ui.holidays.filter(holiday => holiday.day === d)

  const statusColor = (p: Post) =>
    // Posted in the plain text colour: the theme's "subtle" all but disappears on a dark terminal.
    p.status === 'failed' ? 'error' : p.status === 'pending' ? 'warning' : p.status === 'posted' ? undefined : 'suggestion'
  const statusMark = (p: Post) =>
    p.status === 'failed' ? '✕' : p.status === 'pending' ? '◷' : p.status === 'posted' ? '✓' : '•'

  const nameWidth = width >= 72 ? 17 : 12
  const pill = (type: string) => (
    <Text backgroundColor={platformColor(type)} color="#FFFFFF" bold>{` ${badge(type).toUpperCase()} `}</Text>
  )
  const row = (p: Post, withDate = false) => {
    const when = withDate ? `${dayLabel(dayOf(p.dateTime))}, ${timeOf(p.dateTime)}` : timeOf(p.dateTime)
    // "Sun 11 Oct, 11:00 AM" is 20 characters.
    const timeWidth = withDate ? 20 : 9
    // The desktop font is proportional and runs narrower than a cell, so there the text gets a fifth more room. A
    // terminal draws every character a full cell: a longer text there squeezes the time and badge onto two lines.
    const room = width - timeWidth - nameWidth - 14
    const textWidth = Math.max(8, e.surface === 'desktop' ? Math.floor(room * 1.2) : room)
    return (
      <Box key={`row-${p.id}`} flexDirection="row" gap={1} alignItems="center">
        {ui.isSelecting && (v === 'day' || v === 'issues') && (() => {
          const isPicked = ui.selection.includes(p.id)
          const lockedTo = ui.selection.length > 0 ? byId.get(act.postsHeld().find(x => x.id === ui.selection[0])?.channelId ?? '')?.workspaceId : undefined
          const canPick = isPicked || ((lockedTo === undefined || byId.get(p.channelId)?.workspaceId === lockedTo) &&
            ui.selection.length < SELECTION_LIMIT && p.status !== 'posted')
          return canPick
            ? <Button key={`pick-${p.id}`} plain label={isPicked ? '☑' : '☐'}
              onPress={() => void act.patch({ selection: isPicked ? ui.selection.filter(id => id !== p.id) : [...ui.selection, p.id] })} />
            : <Box width={1}><Text dimColor>·</Text></Box>
        })()}
        <Box width={2} flexShrink={0}><Text color={statusColor(p)} bold>{statusMark(p)}</Text></Box>
        <Box width={timeWidth} flexShrink={0}><Text dimColor wrap="truncate-end">{when}</Text></Box>
        <Box width={5} flexShrink={0}>{pill(p.socialType)}</Box>
        <Box width={nameWidth} flexShrink={0}>
          <Text dimColor wrap="truncate-end">{`${isPaused(p.channelId) ? '⏸ ' : ''}${nameOf(p)}`}</Text>
        </Box>
        <Button key={`open-${p.id}`} plain label={`${clip(snippet(p.text), textWidth)} ›`}
          hover={{ color: 'suggestion', underline: true }} onPress={() => void act.patch({ selected: p.id, confirm: null, detailPanel: null, editing: null, insight: null })} />
      </Box>
    )
  }
  const rule = <Text dimColor wrap="truncate-end">{'─'.repeat(Math.max(10, width))}</Text>
  const isToday = (d: string) => d === today

  /** The Yes / Cancel bar of a change proposed in this place. */
  const confirmBar = (scope: string) =>
    pendingConfirm !== null && pendingConfirm.scope === scope && (
      <Box key={`confirm-${scope}`} flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
        <Text color="warning" wrap="wrap">❗ {pendingConfirm.summary}</Text>
        <Text dimColor wrap="wrap">{reversibility(pendingConfirm.kind)}</Text>
        <Box flexDirection="row" gap={1}>
          <Button key={`yes-${scope}`} label="✅ Yes, do it" variant="primary" onPress={() => void act.runPending(pendingConfirm)} />
          <Button key={`no-${scope}`} label="Cancel" onPress={() => void act.set('confirm', null)} />
        </Box>
      </Box>
    )

  const selectToggle = (
    <Button key="select-toggle" label={ui.isSelecting ? 'Done selecting' : '☑ Select'}
      onPress={() => void act.patch({ isSelecting: !ui.isSelecting, selection: [] })} />
  )
  const picked = ui.selection.map(id => act.postsHeld().find(p => p.id === id)).filter((p): p is Post => p !== undefined)
  const pickedWs = byId.get(picked[0]?.channelId ?? '')?.workspaceId ?? ''
  const pickedFailed = picked.filter(p => p.status === 'failed')
  const bulkMove = (items: Array<{ postId: string; dateTime: string }>, summary: string) => {
    if (items.some(item => Date.parse(item.dateTime) <= Date.now() + 60_000)) {
      act.toast('Some of those times have passed; pick a later move')
      return
    }
    void act.propose({
      kind: 'bulk-move', tool: 'queue_reorder', args: { items }, scope: 'toolbar', summary,
      expect: picked.map(snapshotOf),
      inverse: {
        kind: 'bulk-move', tool: 'queue_reorder', scope: 'toolbar',
        args: { items: picked.map(p => ({ postId: p.id, dateTime: p.dateTime })) },
        summary: `Undo: move ${plural(picked.length, 'post')} back.`,
        expect: picked.map(p => ({ ...snapshotOf(p), dateTime: items.find(item => item.postId === p.id)?.dateTime ?? p.dateTime })),
      },
    })
  }
  const bulkBar = ui.isSelecting && picked.length > 0 && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor="suggestion" paddingX={1}>
      <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
        <Text bold>{plural(picked.length, 'post')} selected</Text>
        <Button key="bulk-hour" label="+1 hour"
          onPress={() => bulkMove(picked.map(p => ({ postId: p.id, dateTime: addMinutes(p.dateTime, 60) })), `Move ${plural(picked.length, 'post')} one hour later.`)} />
        <Button key="bulk-day" label="To next day"
          onPress={() => bulkMove(picked.map(p => ({ postId: p.id, dateTime: onDay(p.dateTime, addDays(dayOf(p.dateTime), 1)) })), `Move ${plural(picked.length, 'post')} to the next day, keeping their times.`)} />
        {pickedFailed.length > 0 && (
          <Button key="bulk-retry" label={`🔁 Retry ${pickedFailed.length} failed`} variant="primary"
            onPress={() => {
              const items = retryItems(pickedFailed, Date.now())
              void act.propose({
                kind: 'bulk-retry', tool: 'update_post', args: { items }, scope: 'toolbar',
                summary: `Try ${plural(pickedFailed.length, 'failed post')} again from 15 minutes from now, a minute apart.`,
                expect: pickedFailed.map(snapshotOf),
              })
            }} />
        )}
        {Select !== null && (labels[pickedWs]?.length ?? 0) > 0 && (
          <Select key="bulk-label" value="" options={[{ value: '', label: '🏷 Add a label…' }, ...(labels[pickedWs] ?? []).slice(0, 62).map(l => ({ value: l.id, label: `🏷 ${l.title}` }))]}
            onSelect={(value: string) => value !== '' && void act.propose({
              kind: 'bulk-label', tool: 'bulk_label', scope: 'toolbar',
              args: { postIds: picked.map(p => p.id), labelIds: [value], mode: 'add' },
              summary: `Add the label "${labels[pickedWs]?.find(l => l.id === value)?.title ?? 'label'}" to ${plural(picked.length, 'post')}, keeping their other labels.`,
              expect: picked.map(snapshotOf),
            })} />
        )}
        <Button key="bulk-clear" plain label="Clear" onPress={() => void act.patch({ selection: [] })} />
      </Box>
    </Box>
  )
  const staged = ui.staged
  const stagedPanel = staged !== null && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor={BRAND} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>🗂 Posts Claude drafted · {staged.items.filter(i => i.checked).length} of {staged.items.length} ticked</Text>
        <Button key="staged-close" plain label="✕ Discard" onPress={() => void act.patch({ staged: null })} />
      </Box>
      {staged.items.map(item => {
        const channel = byId.get(item.channelId)
        return (
          <Box key={`staged-${item.id}`} flexDirection="row" gap={1} alignItems="center">
            <Button key={`staged-tick-${item.id}`} plain label={item.checked ? '☑' : '☐'}
              onPress={() => void act.patch({ staged: { ...staged, items: staged.items.map(i => (i.id === item.id ? { ...i, checked: !i.checked } : i)) } })} />
            <Box width={19}><Text dimColor>{`${dayLabel(dayOf(item.dateTime))}, ${timeOf(item.dateTime)}`}</Text></Box>
            <Box width={5}>{channel !== undefined ? pill(channel.type) : <Text dimColor>?</Text>}</Box>
            <Text wrap="truncate-end">{clip(snippet(item.text), Math.max(20, width - 40))}</Text>
          </Box>
        )
      })}
      <Box flexDirection="row" gap={1}>
        <Button key="staged-schedule" label="📅 Schedule ticked…" variant="primary"
          onPress={() => {
            const posts = stagedEntries(staged)
            if (posts.length === 0) return void act.toast('Tick at least one post')
            void act.propose({
              kind: 'bulk-schedule', tool: 'bulk_schedule', scope: 'toolbar', args: { posts },
              stagedIds: staged.items.filter(i => i.checked).map(i => i.id),
              summary: `Schedule ${plural(posts.length, 'post')} Claude drafted, at the times shown. Nothing publishes before its time.`,
            })
          }} />
      </Box>
    </Box>
  )
  const brief = ui.brief !== null && ui.brief.day === today && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor={BRAND} paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>🌞 Today</Text>
        <Button key="brief-dismiss" plain label="✕ Dismiss" onPress={() => void act.patch({ brief: null })} />
      </Box>
      <Text wrap="wrap">{`${plural(ui.brief.today, 'post')} today (${ui.brief.scheduled} still to go)` +
        (ui.brief.failed > 0 ? ` · ${ui.brief.failed} failed since yesterday` : ' · nothing failed since yesterday') +
        (ui.brief.pending > 0 ? ` · ${ui.brief.pending} waiting for approval` : '')}</Text>
      {ui.brief.emptyDays.length > 0 && (
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          <Text dimColor>{`Nothing planned on ${ui.brief.emptyDays.map(dayLabel).join(', ')}.`}</Text>
          {ws !== 'all' && <Button key="brief-fill" label="✨ Ask Claude to fill the gaps"
            onPress={() => void act.handToClaude(`Draft social posts for these empty days in my Social Champ calendar: ` +
              `${ui.brief?.emptyDays.map(dayLabel).join(', ')}, for ${scopeName}. Channels: ${channelList || 'none found'}. ` +
              'Use my brand voice and suggest times. Then stage them in the Social Champ pane with stage_posts so I can ' +
              'tick and schedule them there. Do not schedule anything yourself.')} />}
        </Box>
      )}
    </Box>
  )

  /** Undo for two minutes after a change; its Yes bar appears where it was pressed. */
  const undoBar = (scope: string) => ui.undo !== null && Date.now() < ui.undo.until && busy === null && (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Button key="undo" label="↩ Undo" onPress={() => void act.propose({ ...ui.undo!.pending, scope })} />
      <Text dimColor wrap="truncate-end">{ui.undo.pending.summary.replace(/^Undo: /, '')}</Text>
    </Box>
  )

  /** Claude's answer about a post or draft, in the pane. */
  const insightCard = (id: string, post: Post | null) => ui.insight !== null && ui.insight.postId === id && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor={BRAND} paddingX={2} paddingY={1}>
      <Text bold color={BRAND}>✨ Claude</Text>
      {ui.insight.isLoading ? <Text dimColor>Thinking…</Text> : <Text wrap="wrap">{ui.insight.text}</Text>}
      {!ui.insight.isLoading && (
        <Box flexDirection="row" gap={1}>
          <Button key="insight-chat" label="Continue in chat"
            onPress={() => void act.continueInChat(post !== null
              ? `Social Champ post ${post.id} (${platform(post.socialType)}, ${post.status})` : `Social Champ draft ${id}`,
            ui.insight?.text ?? '')} />
          <Button key="insight-close" plain label="✕ Close" onPress={() => void act.patch({ insight: null })} />
        </Box>
      )}
    </Box>
  )

  // What the toolbar's channel actions apply to: the chosen channel, or every channel of the chosen workspace.
  const wsName = wss.find(w => w.id === ws)?.name ?? 'this workspace'
  const chName = ch === 'all' ? undefined : byId.get(ch)?.name
  const scopeIds = ch !== 'all' ? [ch] : chs.filter(c => c.workspaceId === ws).map(c => c.id)
  const scopeName = chName ?? `all ${plural(scopeIds.length, 'channel')} in ${wsName}`
  const scopeArgs = ch !== 'all' ? { channelIds: [ch] } : { workspaceId: ws }
  const range = loadRange(v, day)
  const rangeText = `${dayLabel(range.from)} – ${dayLabel(range.to)}`
  const pausedHere = scopeIds.filter(isPaused).length

  const movable = (grouped.get(day) ?? []).filter(isMovable)
  const filterNote = ch !== 'all' ? ` on ${chName ?? 'this channel'}` : ws !== 'all' ? ` in ${wsName}` : ''
  const shiftDay = (to: string) => {
    const items = shiftDayItems(movable, to)
    if (items.some(item => Date.parse(item.dateTime) <= Date.now() + 60_000)) {
      act.toast(`Some of those times on ${dayLabel(to)} have already passed; pick a later day`)
      return
    }
    if (items.length > 100) {
      act.toast('Social Champ moves at most 100 posts at once; filter to a workspace or channel first')
      return
    }
    void act.propose({
      kind: 'shift-day', tool: 'queue_reorder', args: { items }, scope: `day-${day}`,
      summary: `Move ${plural(items.length, 'unpublished post')}${filterNote} from ${dayLabel(day)} to ${dayLabel(to)}, keeping their times.`,
      inverse: {
        kind: 'shift-day', tool: 'queue_reorder', scope: 'toolbar',
        args: { items: movable.filter(isMovable).map(p => ({ postId: p.id, dateTime: p.dateTime })) },
        summary: `Undo: move ${plural(items.length, 'post')} back to ${dayLabel(day)}.`,
        expect: movable.filter(isMovable).map(p => ({ ...snapshotOf(p), dateTime: onDay(p.dateTime, to) })),
      },
    })
  }

  const actionOptions = [
    { value: '', label: 'Actions…' },
    { value: 'compose', label: '📝 New post…' },
    { value: 'pause', label: '⏸ Pause publishing' },
    { value: 'resume', label: '🟢 Resume publishing' },
    { value: 'share', label: '🔗 Share as a link…' },
    ...(v === 'day' && movable.length > 0 ? [{ value: 'move', label: "📅 Move this day's posts…" }] : []),
    ...(v === 'week' ? [{ value: 'review', label: '✨ Ask Claude to review this week' }] : []),
    ...(v === 'day' ? [{ value: 'fill-day', label: '✨ Ask Claude to draft posts for this day' }] : []),
  ]
  const onAction = (value: string) => {
    if (value === 'pause' || value === 'resume') {
      void act.propose({
        kind: value, tool: value === 'pause' ? 'queue_pause' : 'queue_resume', args: scopeArgs, scope: 'toolbar',
        summary: value === 'pause'
          ? `Pause publishing on ${scopeName}. Upcoming posts are held until you resume.`
          : `Resume publishing on ${scopeName}. Held posts go out at their scheduled times.`,
      })
    } else if (value === 'share' || value === 'move') {
      void act.patch({ panel: value, confirm: null })
      if (value === 'share') void act.loadShares(ws)
    } else if (value === 'compose') {
      void act.openCompose(v === 'day' ? day : undefined)
    } else if (value === 'review') {
      void act.handToClaude(reviewWeekRequest())
    } else if (value === 'fill-day') {
      void act.handToClaude(fillDayRequest(day))
    }
  }

  const channelsInScope = chs.filter(c => scopeIds.includes(c.id))
  const channelList = channelsInScope.map(c => `${c.name} (${platform(c.type)})`).join(', ')
  const postLine = (p: Post) => `${timeOf(p.dateTime)} · ${platform(p.socialType)} · ${p.status}` +
    (isHandOffSafe(p) ? `: ${clip(snippet(p.text), 80)}` : ' (feed post; its words are left out)')

  const fillDayRequest = (d: string) => {
    const existing = (grouped.get(d) ?? []).map(postLine)
    const holiday = holidaysOn(d).map(holiday => holiday.name).join(', ')
    return [
      `Draft social posts for ${dayLabel(d)} for ${scopeName} in Social Champ.`,
      `Channels: ${channelList || 'none found'}.`,
      ...(holiday ? [`It is a public holiday: ${holiday}. Take that into account.`] : []),
      existing.length > 0 ? `Already on that day:\n${fenced(existing.map(line => `- ${line}`).join('\n'))}` : 'Nothing is on that day yet.',
      `Write them in my brand voice (Social Champ generate_post, workspace ${ws}) and suggest a time for each.`,
      'Show me the drafts and times first. Do not schedule or save anything until I confirm.',
    ].join('\n\n')
  }

  const reviewWeekRequest = () => {
    const week = days(rangeFor('week', day).from, rangeFor('week', day).to).map(d => {
      const list = grouped.get(d) ?? []
      const byPlatform = new Map<string, number>()
      for (const p of list) byPlatform.set(platform(p.socialType), (byPlatform.get(platform(p.socialType)) ?? 0) + 1)
      const parts = [...byPlatform].map(([name, n]) => `${name} ${n}`).join(', ')
      const issues = counts(list)
      const holiday = holidaysOn(d).map(holiday => holiday.name).join(', ')
      return `- ${dayLabel(d)}${holiday ? ` (holiday: ${holiday})` : ''}: ${plural(list.length, 'post')}${parts ? ` (${parts})` : ''}` +
        (issues.failed ? `, ${issues.failed} failed` : '') + (issues.pending ? `, ${issues.pending} waiting for approval` : '')
    })
    return [
      `Review my Social Champ week, ${rangeText}, for ${scopeName}.`,
      `Channels: ${channelList || 'all channels'}.`,
      `What is on it:\n${week.join('\n')}`,
      'Point out empty days, days with too much, channels that go quiet, and failures. Suggest what to add or move.',
      'Do not change anything in Social Champ until I confirm.',
    ].join('\n\n')
  }

  const closePanel = <Button key="close-panel" plain label="✕ Close" onPress={() => void act.set('panel', null)} />

  const sharePanel = panel === 'share' && ws !== 'all' && (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>🔗 Share as a link</Text>
        {closePanel}
      </Box>
      {ui.shares !== null && ui.shares.workspaceId === ws && ui.shares.items.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Links already shared from {wsName}:</Text>
          {ui.shares.items.slice(0, 8).map(link => (
            <Box key={`share-${link.id}`} flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
              <Text color={link.isActive ? undefined : 'subtle'} wrap="truncate-end">{`${link.isActive ? '🟢' : '⚪'} ${clip(link.name, 34)}${link.hasPassword ? ' 🔒' : ''}`}</Text>
              {link.link !== null && link.isActive && (
                <Button key={`share-copy-${link.id}`} plain label="📋 Copy" onPress={press => void act.copy({ text: link.link ?? '', surface: press.surface })} />
              )}
              <Button key={`share-toggle-${link.id}`} plain label={link.isActive ? 'Turn off' : 'Turn on'}
                onPress={() => void act.propose({
                  kind: 'share-toggle', tool: 'update_shareable_calendar', scope: 'toolbar',
                  args: { calendarId: link.id, isActive: !link.isActive, workspaceId: ws },
                  summary: `${link.isActive ? 'Turn off' : 'Turn on'} the share link "${link.name}"${link.isActive ? ': it stops working for anyone who has it' : ''}.`,
                })} />
            </Box>
          ))}
        </Box>
      )}
      <Text dimColor wrap="wrap">A new public calendar of {rangeText} for {scopeName}.</Text>
      {Input === null ? <Text dimColor>Open the pane in the desktop app or terminal to create a link.</Text> : (
        <Input key="share-pass" label="Password" placeholder="optional, 8–20 characters" submitLabel="Create link"
          onSubmit={(value: string) => {
            const password = value.trim()
            if (!isValidPassword(password)) {
              act.toast('A password is 8 to 20 characters, or leave it empty')
              return
            }
            const name = `${chName ?? wsName} · ${rangeText}`
            void act.propose({
              kind: 'share', tool: 'create_public_calendar_link', scope: 'toolbar',
              args: { workspaceId: ws, name, profileIds: scopeIds, ...isoRange(range.from, range.to), ...(password ? { password } : {}) },
              summary: `Create the public link "${name}"${password ? ', password protected' : ', open to anyone who has it'}.`,
            })
          }} />
      )}
    </Box>
  )

  const movePanel = panel === 'move' && v === 'day' && movable.length > 0 && (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>📅 Move this day's {plural(movable.length, 'unpublished post')}</Text>
        {closePanel}
      </Box>
      <Text dimColor wrap="wrap">Each post keeps its time{filterNote ? `; only posts${filterNote}` : ''}.</Text>
      <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
        <Button key="shift-next" label="To next day" onPress={() => shiftDay(addDays(day, 1))} />
        {Input !== null && (
          <Input key="shift-to" label="or to" placeholder="2026-10-12" submitLabel="Move"
            onSubmit={(value: string) => {
              const to = value.trim()
              if (/^\d{4}-\d{2}-\d{2}$/.test(to)) shiftDay(to)
              else act.toast('Type a date as YYYY-MM-DD')
            }} />
        )}
      </Box>
      {confirmBar(`day-${day}`)}
    </Box>
  )

  const compose = ui.compose
  const composeChannel = compose === null ? undefined : byId.get(compose.channelId)
  const composeLimit = composeChannel === undefined ? undefined : charLimit(composeChannel.type)
  const isTooLong = (text: string) => composeLimit !== undefined && text.length > composeLimit
  /** A form row: every label in one column, so the fields start at the same edge. */
  const field = (label: string, control: RenderElement | false) => (
    <Box flexDirection="row" alignItems="center">
      <Box width={14}><Text dimColor>{label}</Text></Box>
      {control}
    </Box>
  )
  const composePanel = panel === 'compose' && compose !== null && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor={BRAND} paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>📝 New post</Text>
        {closePanel}
      </Box>
      {field('Channel', Select !== null && (
        <Select key="compose-channel" value={compose.channelId}
          options={channelOptions(chs, ws).filter(o => o.value !== 'all')}
          onSelect={(value: string) => void (async () => {
            await act.updateCompose({ channelId: value })
            await act.patch({ slots: null })
            void act.loadSlots(value)
          })()} />
      ))}
      {field('Written by', (
        <Box flexDirection="row" gap={1}>
          {(['claude', 'socialchamp'] as const).map(writer => (
            <Button key={`writer-${writer}`} label={writer === 'claude' ? '✨ Claude' : '🧡 Social Champ AI'}
              variant={compose.writer === writer ? 'primary' : 'secondary'}
              onPress={() => void (async () => {
                await act.updateCompose({ writer })
                await act.saveWriter(writer)
              })()} />
          ))}
        </Box>
      ))}
      {field('Draft about', Input !== null && (
        <Input key="compose-topic" placeholder="what it's about" submitLabel="Draft"
          onSubmit={(value: string) => { if (value.trim() !== '') void act.aiDraft(value.trim()) }} />
      ))}
      {field('Or type it', Input !== null && (
        <Input key="compose-text" placeholder="type the post" value={compose.text}
          submitLabel="Set" onInput={(value: string) => { act.setTypedText(value) }}
          onSubmit={(value: string) => { act.setTypedText(undefined); void act.updateCompose({ text: value }) }} />
      ))}
      <Box borderStyle="round" borderDimColor paddingX={2} paddingY={1} flexDirection="column" gap={1}>
        {compose.text === ''
          ? <Text dimColor>The post appears here as you set or draft it.</Text>
          : <Text wrap="wrap">{compose.text}</Text>}
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{composeChannel ? `${platform(composeChannel.type)} · ${composeChannel.name}` : 'No channel'}</Text>
          {composeLimit !== undefined && compose.text.length > composeLimit
            ? <Text color="error" bold>{`${compose.text.length} / ${composeLimit} · too long for ${platform(composeChannel?.type ?? '')}`}</Text>
            : <Text dimColor>{lengthNote(compose.text.length, composeLimit)}</Text>}
        </Box>
      </Box>
      {compose.text !== '' && (
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          <Text dimColor>{compose.writer === 'claude' ? '✨ Claude:' : '🧡 Social Champ AI:'}</Text>
          <Button key="ai-shorten" label="✂ Shorten" onPress={() => void act.aiRewrite('shorten')} />
          <Button key="ai-expand" label="➕ Expand" onPress={() => void act.aiRewrite('expand')} />
          <Button key="ai-rephrase" label="🔁 Rephrase" onPress={() => void act.aiRewrite('rephrase')} />
          <Button key="ai-tags" label="# Hashtags" onPress={() => void act.aiHashtags()} />
        </Box>
      )}
      {field('🖼 Image', Input !== null && (
        <Box flexDirection="column" gap={1}>
          {compose.imageUrl !== undefined
            ? (
              <Box flexDirection="row" gap={1} alignItems="center">
                <Link href={compose.imageUrl} label="↗ The image going with this post" />
                <Button key="image-remove" plain label="✕ Remove" onPress={() => void act.updateCompose({ imageUrl: undefined })} />
              </Box>
            )
            : (
              <Input key="image-prompt" placeholder="describe an image to generate" submitLabel="Generate…"
                onSubmit={(value: string) => void (async () => {
                  const prompt = value.trim()
                  if (prompt === '') return
                  const cap = (await act.readSettings()).imagesPerSession
                  if (act.imagesThisSession() >= cap) {
                    act.toast(`This session's image limit (${cap}) is used. Raise it in 🔧 Settings.`)
                    return
                  }
                  await act.propose({
                    kind: 'image-generate', tool: 'generate_image', scope: 'compose',
                    args: { workspaceId: ws, prompt, count: 1 },
                    summary: `Generate one image of "${clip(prompt, 60)}" with Social Champ AI. It uses 1 of your monthly AI images.`,
                  })
                })()} />
            )}
          {compose.imageUrl === undefined && ui.generated.length > 0 && (
            <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
              {ui.generated.map((url, i) => (
                <Box key={`gen-${i}`} flexDirection="row" gap={1}>
                  <Link href={url} label={`↗ Image ${i + 1}`} />
                  <Button key={`gen-use-${i}`} label="Use it" onPress={() => void act.updateCompose({ imageUrl: url })} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
      {field('🕒 When', Input !== null && (
        <Input key="compose-when" placeholder="2026-10-12 09:30" submitLabel="Set"
          onSubmit={(value: string) => {
            const at = parseWhen(value, compose.when || new Date(`${compose.day || day}T12:00:00`).toISOString())
            if (at === null) act.toast('Type a time as HH:MM or YYYY-MM-DD HH:MM')
            else if (Date.parse(at) <= Date.now() + 60_000) act.toast('Pick a time at least a minute from now')
            else void act.updateCompose({ when: at })
          }} />
      ))}
      {ui.slots !== null && ui.slots.channelId === compose.channelId && ui.slots.items.length > 0 && (
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          <Text dimColor>Open queue slots:</Text>
          {ui.slots.items.map(at => (
            <Button key={`slot-${at}`} label={whenLabel(at)} variant={compose.when === at ? 'primary' : 'secondary'}
              onPress={() => void act.updateCompose({ when: at })} />
          ))}
        </Box>
      )}
      <Text color={compose.when ? 'suggestion' : undefined} dimColor={!compose.when}>
        {compose.when ? `Goes out ${whenLabel(compose.when)} · ${relativeTime(compose.when)}` : 'No time set: it can still be saved as a draft'}
      </Text>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Button key="compose-schedule" label="📅 Schedule…" variant="primary"
          onPress={() => void (async () => {
            const text = await act.composeText()
            if (text === '' || compose.channelId === '') act.toast('A post needs a channel and some text')
            else if (!compose.when) act.toast('Set a time first, or save it as a draft')
            else if (isTooLong(text)) act.toast(`Too long for ${platform(composeChannel?.type ?? '')}: ${text.length} of ${composeLimit} characters. Shorten it first.`)
            else if (compose.imageUrl !== undefined) await act.propose({
              kind: 'image-post', tool: 'create_image_post', scope: 'compose',
              args: { text, imageUrls: [compose.imageUrl], channelIds: [compose.channelId], isScheduled: true, dateTime: compose.when },
              summary: `Schedule "${clip(snippet(text), 50)}" with its image on ${composeChannel?.name ?? 'this channel'} for ${whenLabel(compose.when)}.`,
            })
            else await act.propose({
              kind: 'create-post', tool: 'create_text_post', scope: 'compose',
              args: { text, channelIds: [compose.channelId], isScheduled: true, dateTime: compose.when },
              summary: `Schedule "${clip(snippet(text), 50)}" on ${composeChannel?.name ?? 'this channel'} for ${whenLabel(compose.when)}.`,
            })
          })()} />
        <Button key="compose-draft" label="💾 Save as draft…"
          onPress={() => void (async () => {
            const text = await act.composeText()
            if (text === '' || compose.channelId === '') act.toast('A post needs a channel and some text')
            else await act.propose({
              kind: 'save-draft', tool: compose.imageUrl !== undefined ? 'create_image_post' : 'create_text_post', scope: 'compose',
              args: {
                text, channelIds: [compose.channelId], saveAsDraft: true, ...(compose.when ? { dateTime: compose.when } : {}),
                ...(compose.imageUrl !== undefined ? { imageUrls: [compose.imageUrl] } : {}),
              },
              summary: `Save "${clip(snippet(text), 50)}" as a draft for ${composeChannel?.name ?? 'this channel'}. Nothing is published.`,
            })
          })()} />
      </Box>
      {confirmBar('compose')}
    </Box>
  )

  const sharedBox = shared !== null && (
    <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color="success" bold>✅ Link created</Text>
        <Button key="close-share" plain label="✕ Close" onPress={() => void act.set('shared', null)} />
      </Box>
      <Text dimColor>{shared.name}</Text>
      {shared.link !== '' && <Link href={shared.link} label={shared.link} />}
      {shared.link !== '' && (
        <Box flexDirection="row">
          <Button key="copy-share" label="📋 Copy link" onPress={press => void act.copy({ text: shared.link, surface: press.surface })} />
        </Box>
      )}
    </Box>
  )

  const issueRange = loadRange('issues', day)
  const inIssueRange = shown.filter(p => dayOf(p.dateTime) >= issueRange.from && dayOf(p.dateTime) <= issueRange.to)
  const pickWorkspace = async (value: string) => {
    await act.patch({ workspace: value, channel: 'all', panel: null, confirm: null, labelFilter: '', selectedDraft: null })
    void act.remember()
    const range = (await act.current()).loaded
    if (range !== null) await act.loadHolidays(range.from, range.to)
    if (value !== 'all') void act.loadLabels(value)
    if ((await act.current()).view === 'drafts') await act.load()
  }
  const pickChannel = async (value: string) => {
    await act.patch({ channel: value, panel: null, confirm: null })
    void act.remember()
  }
  const settingsPanel = ui.showSettings && (
    <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={BRAND}>🔧 Settings</Text>
        <Button key="close-settings" plain label="✕ Close" onPress={() => void act.patch({ showSettings: false })} />
      </Box>
      {Select === null ? <Text dimColor>Settings open on the desktop app.</Text> : (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={18}><Text dimColor>Status line check</Text></Box>
            <Select key="set-poll" value=""
              options={[{ value: '', label: 'Choose…' }, { value: '0', label: 'Off' },
                ...[2, 5, 10, 15, 30].map(n => ({ value: String(n), label: `Every ${n} minutes` }))]}
              onSelect={(value: string) => value !== '' && void act.saveSettings({ pollMinutes: Number(value), showStatus: Number(value) > 0 })} />
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={18}><Text dimColor>New posts written by</Text></Box>
            <Select key="set-writer" value=""
              options={[{ value: '', label: 'Choose…' }, { value: 'claude', label: '✨ Claude' }, { value: 'socialchamp', label: '🧡 Social Champ AI' }]}
              onSelect={(value: string) => value !== '' && void act.saveSettings({ writer: value as Writer })} />
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={18}><Text dimColor>AI images a session</Text></Box>
            <Select key="set-images" value=""
              options={[{ value: '', label: 'Choose…' }, ...[0, 1, 2, 3, 5].map(n => ({ value: String(n), label: n === 0 ? 'None' : `${n}` }))]}
              onSelect={(value: string) => value !== '' && void act.saveSettings({ imagesPerSession: Number(value) })} />
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={18}><Text dimColor>Open on workspace</Text></Box>
            <Select key="set-ws" value="" options={[{ value: '', label: 'Choose…' }, ...workspaceOptions(wss, chs)]}
              onSelect={(value: string) => value !== '' && void act.saveSettings({ defaultWorkspace: value })} />
          </Box>
        </Box>
      )}
    </Box>
  )

  const attention = inIssueRange.filter(p => p.status === 'failed' || p.status === 'pending').length
  // Outside the Issues view only part of its two weeks may be held: the count is then a floor, and says so.
  const issuesCounts = ui.issuesSummary !== null && covers(ui.issuesSummary, issueRange.from, issueRange.to)
    ? sumCounts(summaryByDay(ui.issuesSummary.rows, chs, ws, ch), issueRange.from, issueRange.to) : null
  const attentionCount = issuesCounts !== null && !covers(lastLoad, issueRange.from, issueRange.to)
    ? issuesCounts.failed + issuesCounts.pending : attention
  const attentionLabel = `${attentionCount}${issuesCounts !== null || covers(lastLoad, issueRange.from, issueRange.to) ? '' : '+'}`
  const toolbar = (
    <Box flexDirection="column" gap={1}>
      {/* Room on the right: the pane's own close button sits over the last cells of the first line. */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingRight={2}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Button key="prev" label="‹" onPress={() => void act.shift(-1)} />
          <Button key="today" label="Today" onPress={() => void act.go({ anchor: today })} />
          <Button key="next" label="›" onPress={() => void act.shift(1)} />
          <Text bold color={BRAND}>{rangeLabel(v, day)}</Text>
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          {Select !== null && ws !== 'all' && <Select key="actions" value="" options={actionOptions} onSelect={onAction} />}
          <Box key="refresh-hover">
            <Button key="refresh" plain label={loading ? '↻ Loading…' : '↻ Refresh'} hover={{ color: 'suggestion' }}
              onPress={() => void act.load(true)} />
          </Box>
          <Box key="settings-hover">
            <Button key="settings" plain label="🔧" hover={{ color: 'suggestion' }}
              onPress={() => void act.patch({ showSettings: !ui.showSettings })} />
          </Box>
        </Box>
      </Box>
      <Box flexDirection="row" gap={1}>
        {/* Issues last: its count arrives after the first draw, and a tab shifted right by it can leave a sliver of
            its old emoji behind in a terminal. */}
        {(['week', 'month', 'day', 'drafts', 'issues'] as const).map(name => (
          <Button key={`view-${name}`} label={TAB_LABELS[name] + (name === 'issues' && attentionCount > 0 ? ` (${attentionLabel})` : '')}
            variant={v === name ? 'primary' : 'secondary'} onPress={() => void act.go({ view: name })} />
        ))}
      </Box>
      {Select !== null && (
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          <Select key="ws" value={ws} options={workspaceOptions(wss, chs)} onSelect={(value: string) => void pickWorkspace(value)} />
          <Select key="ch" value={ch} options={channelOptions(chs, ws)} onSelect={(value: string) => void pickChannel(value)} />
          {Input !== null && v !== 'month' && v !== 'drafts' && (
            <Input key="search" placeholder="Search posts" submitLabel="Search"
              onSubmit={(value: string) => void act.patch({ search: value.trim() })} />
          )}
          {v !== 'month' && v !== 'drafts' && ws !== 'all' && (labels[ws]?.length ?? 0) > 0 && (
            <Select key="label-filter" value={ui.labelFilter}
              options={[{ value: '', label: '🏷 Any label' }, ...(labels[ws] ?? []).slice(0, 62).map(l => ({ value: l.id, label: `🏷 ${l.title}` }))]}
              onSelect={(value: string) => void act.patch({ labelFilter: value })} />
          )}
        </Box>
      )}
      {Select === null && (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="chip-ws-all" label="🌐 All" variant={ws === 'all' ? 'primary' : 'secondary'} onPress={() => void pickWorkspace('all')} />
            {wss.slice(0, 12).map(w => (
              <Button key={`chip-ws-${w.id}`} label={w.name} variant={ws === w.id ? 'primary' : 'secondary'} onPress={() => void pickWorkspace(w.id)} />
            ))}
          </Box>
          {ws !== 'all' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="chip-ch-all" label="All channels" variant={ch === 'all' ? 'primary' : 'secondary'} onPress={() => void pickChannel('all')} />
              {channelOptions(chs, ws).filter(o => o.value !== 'all').slice(0, 20).map(o => (
                <Button key={`chip-ch-${o.value}`} label={o.label} variant={ch === o.value ? 'primary' : 'secondary'} onPress={() => void pickChannel(o.value)} />
              ))}
            </Box>
          )}
          {ws !== 'all' && (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="m-pause" label="⏸ Pause" onPress={() => onAction('pause')} />
              <Button key="m-resume" label="🟢 Resume" onPress={() => onAction('resume')} />
              {v === 'week' && <Button key="m-review" label="✨ Review this week" onPress={() => onAction('review')} />}
              {v === 'day' && <Button key="m-fill" label="✨ Draft posts for this day" onPress={() => onAction('fill-day')} />}
            </Box>
          )}
        </Box>
      )}
      {isFiltering && v !== 'month' && v !== 'drafts' && (
        <Box flexDirection="row" gap={1} alignItems="center">
          {ui.search !== '' && <Text color="suggestion">🔎 “{clip(ui.search, 30)}”</Text>}
          {ui.labelFilter !== '' && <Text color="suggestion">🏷 {(labels[ws] ?? []).find(l => l.id === ui.labelFilter)?.title ?? 'label'}</Text>}
          <Button key="clear-filters" plain label="✕ Clear" onPress={() => void act.patch({ search: '', labelFilter: '' })} />
        </Box>
      )}
      {settingsPanel}
      {(v === 'week' || v === 'day') && brief}
      {stagedPanel}
      {bulkBar}
      {undoBar('toolbar')}
      {pausedHere > 0 && <Text color="warning">⏸ {plural(pausedHere, 'channel')} paused from this pane</Text>}
      {confirmBar('toolbar')}
      {sharePanel}
      {movePanel}
      {composePanel}
      {sharedBox}
      {busy !== null && <Text color="suggestion" wrap="wrap">Working: {busy}…</Text>}
      {err !== null && covers(lastLoad, loadRange(v, day).from, loadRange(v, day).to) && (
        <Text color="error">Refresh failed: {err}</Text>
      )}
      {rule}
    </Box>
  )

  // Post detail replaces the body while a post is selected.
  const post = sel === null ? undefined : all.find(p => p.id === sel)
  if (post !== undefined) {
    const postWs = byId.get(post.channelId)?.workspaceId ?? ''
    const wsLabels = labels[postWs]
    if (postWs !== '' && wsLabels === undefined) act.queueLabels(postWs)
    const titleOf = (id: string) => wsLabels?.find(l => l.id === id)?.title ?? post.labels[post.labelIds.indexOf(id)] ?? 'label'
    const what = `"${clip(snippet(post.text), 40)}" on ${nameOf(post)}`
    const move = (to: string) => {
      if (Date.parse(to) <= Date.now() + 60_000) {
        act.toast('Pick a time at least a minute from now')
        return
      }
      void act.propose({
        kind: 'reschedule', tool: 'update_post', args: { postId: post.id, dateTime: to }, scope: post.id,
        summary: `Move ${what} from ${whenLabel(post.dateTime)} to ${whenLabel(to)}.`,
        inverse: {
          kind: 'reschedule', tool: 'update_post', args: { postId: post.id, dateTime: post.dateTime }, scope: 'toolbar',
          summary: `Undo: move ${what} back to ${whenLabel(post.dateTime)}.`,
          expect: [{ ...snapshotOf(post), dateTime: to }],
        },
      })
    }
    const sorted = (ids: string[]) => [...new Set(ids)].sort()
    const labelUndo = (after: string[], args: Record<string, unknown>, kind: 'label-add' | 'label-remove', summary: string): Pending => ({
      kind, tool: kind === 'label-add' ? 'label_apply' : 'label_remove', args, scope: 'toolbar', summary,
      expect: [{ ...snapshotOf(post), labelIds: sorted(after) }],
    })
    const canEdit = post.status === 'scheduled' || post.status === 'failed'
    const isIgPost = post.socialType === 'IG_BUSINESS' && (post.status === 'scheduled' || post.status === 'posted')
    const editLimit = charLimit(post.socialType)
    const editText = act.typedEdit() ?? (ui.editing?.postId === post.id ? ui.editing.text : '')
    const addable = wsLabels === undefined ? [] : labelOptions(wsLabels, post)
    return ((
      <Box flexDirection="column" gap={2}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box key="back-hover">
            <Button key="back" plain label="← Back" hover={{ color: 'suggestion', underline: true }}
              onPress={() => void act.patch({ selected: null, confirm: null, detailPanel: null, editing: null })} />
          </Box>
          {isPaused(post.channelId) && <Text color="warning">⏸ channel paused</Text>}
        </Box>
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} alignItems="center">
            {pill(post.socialType)}
            <Text bold>{nameOf(post)}</Text>
          </Box>
          <Text dimColor>{wss.find(w => w.id === postWs)?.name ?? ''}</Text>
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text backgroundColor={STATUS_CHIP[post.status]} color="#FFFFFF" bold>{` ${STATUS_WORDS[post.status].toUpperCase()} `}</Text>
          <Text dimColor>{`· ${dayLabel(dayOf(post.dateTime))}, ${timeOf(post.dateTime)} · ${relativeTime(post.dateTime)}` +
            (post.media > 0 ? ` · ${plural(post.media, 'attachment')}` : '') +
            (post.source === 'AUTO_RSS' ? ' · from an RSS feed' : '')}</Text>
        </Box>
        {post.error !== null && (
          <Box borderStyle="round" borderColor="error" paddingX={2} paddingY={1}>
            <Text color="error" wrap="wrap">❗ {post.error}</Text>
          </Box>
        )}
        <Box borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
          <Text wrap="wrap">{post.text || '(no text)'}</Text>
        </Box>
        <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
          <Button key="ask" label={post.status === 'failed' ? '✨ Ask Claude why it failed' : '✨ Ask Claude to review it'}
            onPress={() => void act.askClaude(post, nameOf(post))} />
          {(() => {
            const link = networkLink(post.permalink)
            return link !== null && <Link href={link.href} label={`↗ Open on ${platform(post.socialType)} (${link.host})`} />
          })()}
          <Link href={post.appUrl ?? CALENDAR_URL} label={post.appUrl ? '↗ Open in Social Champ' : '↗ Open Social Champ calendar'} />
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {canEdit && Input !== null && (
            <Button key="tool-edit" label="📝 Edit text" variant={ui.detailPanel === 'edit' ? 'primary' : 'secondary'}
              onPress={() => { act.setTypedEdit(undefined); void act.patch({ detailPanel: 'edit', editing: { postId: post.id, text: post.text } }) }} />
          )}
          {isIgPost && Input !== null && (
            <Button key="tool-comment" label="💬 First comment" variant={ui.detailPanel === 'comment' ? 'primary' : 'secondary'}
              onPress={() => { act.setTypedEdit(undefined); void act.patch({ detailPanel: 'comment', editing: { postId: post.id, text: '' } }) }} />
          )}
          {Select !== null && Input !== null && isMovable(post) && (
            <Button key="tool-copy" label="📄 Duplicate…" variant={ui.detailPanel === 'copy' ? 'primary' : 'secondary'}
              onPress={() => void act.patch({ detailPanel: 'copy', copyChannel: post.channelId })} />
          )}
          {Select !== null && (
            <Button key="tool-recycle" label="🔄 Recycle…" variant={ui.detailPanel === 'recycle' ? 'primary' : 'secondary'}
              onPress={() => {
                void act.patch({ detailPanel: 'recycle' })
                if (postWs !== '' && ui.collections[postWs] === undefined) void act.loadCollections(postWs)
              }} />
          )}
          <Button key="tool-delete" label="🗑 Delete…"
            onPress={() => void act.propose({
              kind: 'delete-post', tool: 'delete_post', args: { postId: post.id }, scope: post.id,
              summary: post.status === 'posted'
                ? `Delete ${what} from Social Champ. What was already published on ${platform(post.socialType)} stays there; remove it on ${platform(post.socialType)} if needed.`
                : `Delete ${what}. It will not be published.`,
              expect: [snapshotOf(post)],
            })} />
          {post.status === 'pending' && (
            <Button key="tool-remind" label="🔔 Send reminder"
              onPress={() => void act.propose({
                kind: 'remind', tool: 'approval_assign', args: { postId: post.id }, scope: post.id,
                summary: `Remind the approvers of ${what}. (At most once an hour.)`,
              })} />
          )}
        </Box>
        {ui.detailPanel === 'edit' && ui.editing?.postId === post.id && Input !== null && (
          <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
            <Text bold color={BRAND}>📝 Edit text</Text>
            <Input key="edit-text" value={ui.editing.text} placeholder="the post's words" submitLabel="Set"
              onInput={(value: string) => { act.setTypedEdit(value) }}
              onSubmit={(value: string) => { act.setTypedEdit(undefined); void act.patch({ editing: { postId: post.id, text: value } }) }} />
            <Text color={editLimit !== undefined && editText.length > editLimit ? 'error' : undefined} dimColor={!(editLimit !== undefined && editText.length > editLimit)}>
              {lengthNote(editText.length, editLimit)}
            </Text>
            <Box flexDirection="row" gap={1}>
              <Button key="edit-save" label="Save text…" variant="primary"
                onPress={() => {
                  const text = (act.typedEdit() ?? ui.editing?.text ?? '').trim()
                  if (text === '' || text === post.text) {
                    act.toast(text === '' ? 'A post needs some text' : 'The text is unchanged')
                    return
                  }
                  if (editLimit !== undefined && text.length > editLimit) {
                    act.toast(`Too long for ${platform(post.socialType)}: ${text.length} of ${editLimit} characters`)
                    return
                  }
                  void act.propose({
                    kind: 'edit-text', tool: 'update_post', args: { postId: post.id, text }, scope: post.id,
                    summary: `Change the words of ${what} to "${clip(snippet(text), 60)}". If an approval workflow covers it, it may go back to pending.`,
                    expect: [snapshotOf(post)],
                    inverse: {
                      kind: 'edit-text', tool: 'update_post', args: { postId: post.id, text: post.text }, scope: 'toolbar',
                      summary: `Undo: put back the earlier words of ${what}.`,
                      expect: [{ ...snapshotOf(post), text: textHash(text) }],
                    },
                  })
                }} />
              <Button key="edit-cancel" plain label="Cancel" onPress={() => void act.patch({ detailPanel: null, editing: null })} />
            </Box>
          </Box>
        )}
        {ui.detailPanel === 'comment' && ui.editing?.postId === post.id && Input !== null && (
          <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
            <Text bold color={BRAND}>💬 Instagram first comment</Text>
            <Text dimColor wrap="wrap">Hashtags and a call to action under the post. Setting it replaces any first comment already set; the pane cannot show the current one.</Text>
            <Input key="first-comment" value={ui.editing.text} placeholder="the first comment" submitLabel="Set"
              onInput={(value: string) => { act.setTypedEdit(value) }}
              onSubmit={(value: string) => { act.setTypedEdit(undefined); void act.patch({ editing: { postId: post.id, text: value } }) }} />
            <Text dimColor>{`${editText.length} / ${FIRST_COMMENT_LIMIT}`}</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="comment-write" label="✨ Write it" onPress={() => void act.writeFirstComment(post)} />
              <Button key="comment-save" label="Set first comment…" variant="primary"
                onPress={() => {
                  const firstComment = (act.typedEdit() ?? ui.editing?.text ?? '').trim()
                  if (firstComment === '') return void act.toast('Write the comment first')
                  void act.propose({
                    kind: 'first-comment', tool: 'instagram_first_comment', scope: post.id,
                    args: { postId: post.id, firstComment, workspaceId: postWs },
                    summary: `Set the first comment of ${what} to "${clip(snippet(firstComment), 60)}".`,
                  })
                }} />
              <Button key="comment-cancel" plain label="Cancel" onPress={() => void act.patch({ detailPanel: null, editing: null })} />
            </Box>
          </Box>
        )}
        {ui.detailPanel === 'copy' && Select !== null && Input !== null && (
          <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
            <Text bold color={BRAND}>📄 Duplicate</Text>
            {post.media > 0
              ? <Text dimColor wrap="wrap">This post has {plural(post.media, 'attachment')}; copy it in Social Champ so the media come along.</Text>
              : (
                <Box flexDirection="column" gap={1}>
                  <Select key="copy-channel" value={ui.copyChannel}
                    options={channelOptions(chs, postWs).filter(o => o.value !== 'all')}
                    onSelect={(value: string) => void act.patch({ copyChannel: value })} />
                  <Input key="copy-when" label="When" placeholder="2026-10-12 09:30" submitLabel="Duplicate…"
                    onSubmit={(value: string) => {
                      const at = parseWhen(value, post.dateTime)
                      const target = byId.get(ui.copyChannel)
                      if (at === null) return void act.toast('Type a time as HH:MM or YYYY-MM-DD HH:MM')
                      if (target === undefined) return void act.toast('Pick a channel')
                      if (Date.parse(at) <= Date.now() + 60_000) return void act.toast('Pick a time at least a minute from now')
                      const limit = charLimit(target.type)
                      if (limit !== undefined && post.text.length > limit) {
                        return void act.toast(`Too long for ${platform(target.type)}: ${post.text.length} of ${limit} characters`)
                      }
                      void act.propose({
                        kind: 'duplicate', tool: 'create_text_post', scope: post.id,
                        args: { text: post.text, channelIds: [target.id], isScheduled: true, dateTime: at },
                        summary: `Schedule a copy of ${what} on ${target.name} for ${whenLabel(at)}.`,
                      })
                    }} />
                </Box>
              )}
          </Box>
        )}
        {ui.detailPanel === 'recycle' && Select !== null && (
          <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
            <Text bold color={BRAND}>🔄 Recycle into a collection</Text>
            {ui.collections[postWs] === undefined ? <Text dimColor>Loading collections…</Text>
              : ui.collections[postWs].length === 0
                ? <Text dimColor wrap="wrap">This workspace has no recycle collections. Create one in Social Champ (Publish › Recycle).</Text>
                : (
                  <Select key="recycle-collection" value=""
                    options={[{ value: '', label: 'Choose a collection…' },
                      ...ui.collections[postWs].slice(0, 62).map(c => ({ value: c.id, label: `🔄 ${c.title} · ${plural(c.postCount, 'post')}` }))]}
                    onSelect={(value: string) => {
                      const collection = ui.collections[postWs]?.find(c => c.id === value)
                      if (collection === undefined) return
                      void act.propose({
                        kind: 'recycle', tool: 'recycle_post', scope: post.id, args: { postId: post.id, collectionId: collection.id },
                        summary: `Copy ${what} into the recycle collection "${collection.title}". The post itself stays as it is.`,
                      })
                    }} />
                )}
          </Box>
        )}
        {undoBar(post.id)}
        {insightCard(post.id, post)}
        {confirmBar(post.id)}
        {busy !== null && <Text color="suggestion" wrap="wrap">Working: {busy}…</Text>}
        {isMovable(post) && (
          <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
            <Text bold color={BRAND}>🕒 Reschedule</Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="minus-hour" label="−1 hour" onPress={() => move(addMinutes(post.dateTime, -60))} />
              <Button key="plus-hour" label="+1 hour" onPress={() => move(addMinutes(post.dateTime, 60))} />
              <Button key="plus-day" label="+1 day" onPress={() => move(onDay(post.dateTime, addDays(dayOf(post.dateTime), 1)))} />
              {post.status === 'failed' && (
                <Button key="retry" label="Retry in 15 min" variant="primary" onPress={() => move(addMinutes(new Date().toISOString(), 15))} />
              )}
            </Box>
            {Input !== null && (
              <Input key="when" label="Or move to" placeholder="21:00" submitLabel="Move"
                onSubmit={(value: string) => {
                  const to = parseWhen(value, post.dateTime)
                  if (to === null) act.toast('Type a time as HH:MM or YYYY-MM-DD HH:MM')
                  else move(to)
                }} />
            )}
            {Input !== null && <Text dimColor>A time on the same day (21:00), or a date and time (2026-10-12 09:30).</Text>}
          </Box>
        )}
        <Box flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
          <Text bold color={BRAND}>🏷 Labels</Text>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {post.labelIds.length === 0 && <Text dimColor>None</Text>}
            {post.labelIds.map(id => (
              <Button key={`unlabel-${id}`} label={`🏷 ${titleOf(id)}  ×`}
                onPress={() => void act.propose({
                  kind: 'label-remove', tool: 'label_remove', scope: post.id,
                  args: { postId: post.id, labelIds: [id], workspaceId: postWs },
                  summary: `Remove the label "${titleOf(id)}" from ${what}.`,
                  inverse: labelUndo(post.labelIds.filter(x => x !== id),
                    { postId: post.id, labelIds: post.labelIds, workspaceId: postWs }, 'label-add', `Undo: put "${titleOf(id)}" back on ${what}.`),
                })} />
            ))}
          </Box>
          {act.isLabelsFailed(postWs) ? (
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text color="warning">Labels didn't load.</Text>
              <Button key="labels-retry" label="Retry" onPress={() => void act.loadLabels(postWs, true)} />
            </Box>
          ) : wsLabels === undefined ? <Text dimColor>Loading labels…</Text> : busy !== null ? null : (
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {Select === null && addable.slice(0, 8).map(option => (
                <Button key={`addlabel-${option.value}`} label={`+ ${option.label}`}
                  onPress={() => void act.propose({
                    kind: 'label-add', tool: 'label_apply', scope: post.id,
                    args: { postId: post.id, labelIds: [...post.labelIds, option.value], workspaceId: postWs },
                    summary: `Add the label "${wsLabels.find(l => l.id === option.value)?.title ?? option.value}" to ${what}.`,
                    inverse: labelUndo([...post.labelIds, option.value], { postId: post.id, labelIds: [option.value], workspaceId: postWs },
                      'label-remove', `Undo: take "${wsLabels.find(l => l.id === option.value)?.title ?? 'the label'}" off ${what}.`),
                  })} />
              ))}
              {Select !== null && addable.length > 0 && (
                <Select key="add-label" label="Add label" value=""
                  options={[{ value: '', label: 'Choose a label…' }, ...addable]}
                  onSelect={(value: string) => value !== '' && void act.propose({
                    kind: 'label-add', tool: 'label_apply', scope: post.id,
                    args: { postId: post.id, labelIds: [...post.labelIds, value], workspaceId: postWs },
                    summary: `Add the label "${wsLabels.find(l => l.id === value)?.title ?? value}" to ${what}.`,
                    inverse: labelUndo([...post.labelIds, value], { postId: post.id, labelIds: [value], workspaceId: postWs },
                      'label-remove', `Undo: take "${wsLabels.find(l => l.id === value)?.title ?? 'the label'}" off ${what}.`),
                  })} />
              )}
              {Input !== null && (
                <Input key="new-label" label="or new" placeholder="label name" submitLabel="Create"
                  onSubmit={(value: string) => {
                    const title = value.trim().slice(0, 40)
                    if (title === '') return
                    void act.propose({
                      kind: 'label-create', tool: 'label_create', scope: post.id, postId: post.id,
                      args: { title, workspaceId: postWs },
                      summary: `Create the label "${title}" in this workspace and add it to ${what}.`,
                    })
                  }} />
              )}
            </Box>
          )}
        </Box>
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1} flexWrap="wrap">
          {post.status === 'pending' && canApprove === false && <Text dimColor>{SCOPE_HINT}</Text>}
          {post.status === 'pending' && canApprove === true && (
            <Box flexDirection="row" gap={1}>
              <Button key="approve" label="Approve" variant="primary"
                onPress={() => {
                  // Approval that clears the last stage publishes at the time given, or at once without one.
                  if (Date.parse(post.dateTime) <= Date.now() + 60_000) {
                    act.toast('Its time has passed: reschedule it first, then approve')
                    return
                  }
                  void act.propose({
                    kind: 'approve', tool: 'approval_approve', args: { postId: post.id, dateTime: post.dateTime }, scope: post.id,
                    summary: `Approve ${what} to publish ${whenLabel(post.dateTime)}.`,
                  })
                }} />
              <Button key="reject" label="Reject"
                onPress={() => void act.propose({
                  kind: 'reject', tool: 'approval_reject', args: { postId: post.id }, scope: post.id,
                  summary: `Reject ${what}. Its owner is notified.`,
                })} />
            </Box>
          )}
          </Box>
        </Box>
      </Box>
    ))
  }

  const drafts = ui.drafts !== null && ui.drafts.workspaceId === ws ? ui.drafts : null
  const draftShown = (drafts?.items ?? []).filter(d => ui.draftFilter === '' || d.text.toLowerCase().includes(ui.draftFilter.toLowerCase()))
  const draftsBody = ws === 'all'
    ? <Text dimColor>📝 Pick a workspace to see its drafts.</Text>
    : drafts === null || (drafts.isLoading && drafts.items.length === 0)
      ? <Text dimColor>Loading drafts…</Text>
      : drafts.error !== null && drafts.items.length === 0
        ? <Text color="warning">{drafts.error}</Text>
        : (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
              <Text bold>{plural(drafts.items.length, 'draft')}{drafts.hasMore ? '+' : ''}</Text>
              {Input !== null && (
                <Input key="draft-filter" placeholder="Filter drafts" submitLabel="Filter"
                  onSubmit={(value: string) => void act.patch({ draftFilter: value.trim() })} />
              )}
              {ui.draftFilter !== '' && <Button key="clear-draft-filter" plain label="✕ Clear" onPress={() => void act.patch({ draftFilter: '' })} />}
            </Box>
            {draftShown.length === 0 && <Text dimColor>No drafts{ui.draftFilter !== '' ? ' match that' : ' in this workspace'}.</Text>}
            {draftShown.map(d => (
              <Box key={`draft-${d.id}`} flexDirection="row" gap={1}>
                <Box width={14}><Text dimColor>{d.dateTime !== null ? dayLabel(dayOf(d.dateTime)) : 'No date'}</Text></Box>
                <Box width={nameWidth}><Text dimColor wrap="truncate-end">{d.createdBy ?? ''}</Text></Box>
                <Button key={`open-draft-${d.id}`} plain label={`${clip(snippet(d.text), Math.max(20, width - nameWidth - 22))} ›`}
                  hover={{ color: 'suggestion', underline: true }} onPress={() => void act.patch({ selectedDraft: d.id, insight: null })} />
              </Box>
            ))}
            {drafts.hasMore && (
              <Box flexDirection="row">
                <Button key="drafts-more" label={drafts.isLoading ? 'Loading…' : 'Load more'} onPress={() => void act.loadDrafts(ws, true)} />
              </Box>
            )}
          </Box>
        )
  const draft = v === 'drafts' && ui.selectedDraft !== null ? drafts?.items.find(d => d.id === ui.selectedDraft) : undefined
  if (draft !== undefined) {
    return ((
      <Box flexDirection="column" gap={2}>
        <Box key="back-draft-hover">
          <Button key="back-draft" plain label="← Back to drafts" hover={{ color: 'suggestion', underline: true }}
            onPress={() => void act.patch({ selectedDraft: null, insight: null })} />
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text backgroundColor="#6B7280" color="#FFFFFF" bold>{' DRAFT '}</Text>
          <Text dimColor>{`${draft.dateTime !== null ? `for ${dayLabel(dayOf(draft.dateTime))}` : 'no date'}` +
            (draft.createdBy !== null ? ` · by ${draft.createdBy}` : '') +
            (draft.attachments > 0 ? ` · ${plural(draft.attachments, 'attachment')}` : '')}</Text>
        </Box>
        <Box borderStyle="round" borderDimColor paddingX={2} paddingY={1}>
          <Text wrap="wrap">{draft.text || '(no text)'}</Text>
        </Box>
        <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
          <Button key="polish-draft" label="✨ Ask Claude to polish it" onPress={() => void act.polishDraft(draft.id, draft.text)} />
          <Link href={CALENDAR_URL} label="↗ Open Social Champ (Publish > Drafts)" />
        </Box>
        {/* delete_post answers success for a draft id and deletes nothing, and bulk_delete needs manage_team:
            the connector cannot delete drafts yet (checked live 2026-10-10), so the pane does not pretend to. */}
        <Text dimColor wrap="wrap">To delete a draft, open it in Social Champ: its connector cannot delete drafts yet.</Text>
        {confirmBar(draft.id)}
        {busy !== null && <Text color="suggestion" wrap="wrap">Working: {busy}…</Text>}
        {insightCard(draft.id, null)}
      </Box>
    ))
  }

  const need = loadRange(v, day)
  // The footer counts what this view covers, not everything loaded for a wider range.
  const isInView = (p: Post) => dayOf(p.dateTime) >= need.from && dayOf(p.dateTime) <= need.to
  const shownInView = shown.filter(isInView).length
  const allInView = all.filter(isInView).length
  const monthCounts = v === 'month' && ui.summary !== null && covers(ui.summary, need.from, need.to)
    ? summaryByDay(ui.summary.rows, chs, ws, ch) : null
  const ZERO = { total: 0, scheduled: 0, posted: 0, failed: 0, pending: 0, other: 0 }
  let body
  if (v === 'drafts') {
    body = draftsBody
  } else if (monthCounts === null && !covers(lastLoad, need.from, need.to)) {
    body = err !== null && !loading
      ? (
        <Box flexDirection="column">
          <Text color="error">❗ Couldn't load {rangeLabel(v, day)}.</Text>
          <Text dimColor wrap="wrap">{err}</Text>
        </Box>
      )
      : <Text dimColor>Loading {rangeLabel(v, day)} from Social Champ…</Text>
  } else if (v === 'month') {
    const cell = Math.max(5, Math.floor((width - 2) / 7))
    // Seven equal shares of the width where the surface lays out by percent; whole cells elsewhere.
    const column = e.surface === 'desktop' ? '14%' : cell
    body = (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <Box key={`h-${d}`} width={column} paddingX={cell >= 10 ? 1 : 0}><Text dimColor bold>{d}</Text></Box>
          ))}
        </Box>
        {monthGrid(day).map((week, i) => (
          <Box key={`w-${i}`} flexDirection="row">
            {week.map((d, j) => {
              if (d === null) return <Box key={`e-${i}-${j}`} width={column} />
              const c = monthCounts !== null ? (monthCounts.get(d) ?? ZERO) : counts(grouped.get(d) ?? [])
              const isWide = cell >= 10
              return (
                <Box key={`d-${d}`} width={column} flexDirection="column" borderStyle="round"
                  {...(isToday(d) ? { borderColor: BRAND } : { borderDimColor: true })}
                  hover={{ borderColor: BRAND }} paddingX={isWide ? 1 : 0}>
                  <Button key={`m-${d}`} plain label={String(Number(d.slice(8)))}
                    hover={{ color: BRAND, bold: true }} onPress={() => void act.go({ view: 'day', anchor: d })} />
                  <Box flexDirection="column" paddingLeft={1}>
                    {c.total === 0
                      ? <Text dimColor>·</Text>
                      : <Text color={c.scheduled > 0 ? 'suggestion' : undefined} dimColor={c.scheduled === 0}>
                          {isWide ? plural(c.total, 'post') : String(c.total)}
                        </Text>}
                    {c.failed > 0 && <Text color="error">✕ {c.failed}{isWide ? ' failed' : ''}</Text>}
                    {holidaysOn(d).map(holiday => (
                      <Box key={`mhol-${d}-${holiday.name}`}>
                        <Text color={BRAND} wrap="truncate-end">{isWide ? `🎉 ${holiday.name}` : '🎉'}</Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )
            })}
          </Box>
        ))}
        {(() => {
          const m = monthCounts !== null ? sumCounts(monthCounts, need.from, need.to) : counts(shown)
          return (
            <Box flexDirection="row" gap={1} marginTop={1} flexWrap="wrap">
              <Text bold>{plural(m.total, 'post')} this month</Text>
              <Text color="suggestion">· {m.scheduled} scheduled</Text>
              <Text color={m.failed > 0 ? 'error' : undefined} dimColor={m.failed === 0}>· {m.failed} failed</Text>
              {m.pending > 0 && <Text color="warning">· {m.pending} pending</Text>}
            </Box>
          )
        })()}
      </Box>
    )
  } else if (v === 'issues') {
    const failed = inIssueRange.filter(p => p.status === 'failed').sort((a, b) => b.dateTime.localeCompare(a.dateTime))
    const pending = inIssueRange.filter(p => p.status === 'pending').sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    body = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {/* A cell of room on the right: the ballot box in "Select" is drawn wider than it is counted in some terminals. */}
          <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
            <Text bold color={failed.length > 0 ? 'error' : undefined}>❌ Failed · {failed.length}</Text>
            {failed.length + pending.length > 0 && selectToggle}
          </Box>
          {failed.length === 0 ? <Text color="success">✅ Nothing failed in these two weeks</Text> : failed.map(p => (
            <Box key={`f-${p.id}`} flexDirection="column">
              {row(p, true)}
              <Box paddingLeft={3}><Text color="error" dimColor wrap="truncate-end">{p.error ?? ''}</Text></Box>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold color={pending.length > 0 ? 'warning' : undefined}>⏳ Waiting for approval · {pending.length}</Text>
          {pending.length === 0 ? <Text color="success">✅ Nothing waiting for approval</Text> : pending.map(p => row(p, true))}
          {pending.length > 0 && canApprove === false && <Text dimColor>{SCOPE_HINT}</Text>}
        </Box>
      </Box>
    )
  } else {
    const list = v === 'day' ? [day] : days(rangeFor('week', day).from, rangeFor('week', day).to)
    const movableWeek = list.flatMap(d => (grouped.get(d) ?? []).filter(isMovable))
    const dragRows = Math.min(14, Math.max(1, ...list.map(d => (grouped.get(d) ?? []).filter(isMovable).length))) + 1
    if (v === 'week' && ui.dragMode && Client !== null) body = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor>Press a post and drag it onto another day; it keeps its time. You confirm before it moves.</Text>
          <Button key="drag-off" label="Done dragging" onPress={() => void act.patch({ dragMode: false })} />
        </Box>
        <Client key="week-drag" module="./drag.tsx" width="100%" height={dragRows}
          props={{
            days: list.map(d => ({ day: d, label: dayLabel(d), isToday: isToday(d) })),
            posts: movableWeek.map(p => ({ id: p.id, day: dayOf(p.dateTime), label: `${timeOf(p.dateTime)} ${badge(p.socialType)} ${snippet(p.text)}`, color: platformColor(p.socialType) })),
          }} />
      </Box>
    )
    else body = (
      <Box flexDirection="column" gap={2}>
        {v === 'week' && (() => {
          const weekPosts = list.flatMap(d => grouped.get(d) ?? [])
          const c = counts(weekPosts)
          const published = c.total - c.scheduled - c.failed - c.pending
          return (
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text bold>{plural(c.total, 'post')} this week</Text>
                {c.scheduled > 0 && <Text color="suggestion">· {c.scheduled} scheduled</Text>}
                {published > 0 && <Text dimColor>· {published} published</Text>}
                {c.failed > 0 && <Text color="error">· {c.failed} failed</Text>}
                {c.pending > 0 && <Text color="warning">· {c.pending} pending</Text>}
              </Box>
              {Client !== null && movableWeek.length > 0 && (
                <Button key="drag-on" label="✋ Drag to reschedule" onPress={() => void act.patch({ dragMode: true })} />
              )}
            </Box>
          )
        })()}
        {list.map(d => {
          const dayPosts = grouped.get(d) ?? []
          const c = counts(dayPosts)
          const visible = v === 'day' ? dayPosts : pickForDay(dayPosts, WEEK_ROWS_PER_DAY, nowIso)
          return (
            <Box key={`day-${d}`} flexDirection="column">
              {v === 'week' && (
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Box flexDirection="row" gap={1} alignItems="center">
                    <Text bold={c.total > 0 || isToday(d)} dimColor={c.total === 0 && !isToday(d)}
                      color={isToday(d) ? BRAND : undefined}>{dayLabel(d)}</Text>
                    {isToday(d) && <Text backgroundColor={BRAND} color="#FFFFFF" bold> TODAY </Text>}
                    {c.total > 0 && <Text dimColor>· {plural(c.total, 'post')}</Text>}
                    {c.failed > 0 && <Text color="error">· {c.failed} failed</Text>}
                    {c.pending > 0 && <Text color="warning">· {c.pending} pending</Text>}
                    {holidaysOn(d).map(holiday => (
                      <Box key={`hol-${d}-${holiday.name}`}><Text color={BRAND}>🎉 {holiday.name}</Text></Box>
                    ))}
                  </Box>
                  <Box key={`dh-hover-${d}`} flexDirection="row" gap={2}>
                    {ws !== 'all' && d >= today && (
                      <Button key={`dh-new-${d}`} plain label="+ Post" hover={{ color: BRAND, underline: true }}
                        onPress={() => void act.openCompose(d)} />
                    )}
                    {c.total > 0 && (
                      <Button key={`dh-${d}`} plain label="View day ›" hover={{ color: BRAND, underline: true }}
                        onPress={() => void act.go({ view: 'day', anchor: d })} />
                    )}
                  </Box>
                </Box>
              )}
              {v === 'day' && holidaysOn(d).map(holiday => (
                <Box key={`dhol-${holiday.name}`} borderStyle="round" borderColor={BRAND} paddingX={2} marginBottom={1}>
                  <Text color={BRAND} bold>🎉 {holiday.name}</Text>
                  <Text dimColor> · public holiday</Text>
                </Box>
              ))}
              {v === 'day' && (
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} marginBottom={1}>
                  {dayPosts.length === 0
                    ? <Text dimColor>📭 Nothing scheduled on {dayLabel(d)}{filterNote}.</Text>
                    : (
                      <Box flexDirection="row" gap={1} flexWrap="wrap">
                        <Text bold>{plural(c.total, 'post')}</Text>
                        {c.scheduled > 0 && <Text color="suggestion">· {c.scheduled} scheduled</Text>}
                        {c.total - c.scheduled - c.failed - c.pending > 0 && (
                          <Text dimColor>· {c.total - c.scheduled - c.failed - c.pending} published</Text>
                        )}
                        {c.failed > 0 && <Text color="error">· {c.failed} failed</Text>}
                        {c.pending > 0 && <Text color="warning">· {c.pending} pending</Text>}
                      </Box>
                    )}
                  {ws !== 'all' && d >= today && (
                    <Box flexDirection="row" gap={1}>
                      {dayPosts.some(isMovable) && selectToggle}
                      <Button key="day-new" label="+ New post" variant="primary" onPress={() => void act.openCompose(d)} />
                      <Button key="day-claude" label="✨ Ask Claude to draft posts"
                        onPress={() => void act.handToClaude(fillDayRequest(d))} />
                    </Box>
                  )}
                </Box>
              )}
              {visible.map(p => row(p))}
              {dayPosts.length > visible.length && (
                <Button key={`more-${d}`} plain label={`+ ${dayPosts.length - visible.length} more on ${dayLabel(d)} ›`}
                  hover={{ color: BRAND, underline: true }}
                  onPress={() => void act.go({ view: 'day', anchor: d })} />
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  return ((
    <Box flexDirection="column" gap={1}>
      {toolbar}
      {body}
      {lastLoad !== null && (
        <Box flexDirection="column">
          {rule}
          <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap">
            <Text dimColor>
              {`Updated ${timeOf(new Date(lastLoad.at).toISOString())}` + (v === 'month' || v === 'drafts' ? '' : ' · ' +
                (shownInView === allInView ? plural(allInView, 'post') : `${shownInView} of ${plural(allInView, 'post')} (filtered)`))}
            </Text>
            <Text dimColor>{v === 'month' ? 'Click a day to open it' : v === 'drafts' ? 'Click a draft for details' : 'Click a post for details'}</Text>
          </Box>
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            <Text color="suggestion">• scheduled</Text>
            <Text dimColor>✓ posted</Text>
            <Text color="error">✕ failed</Text>
            <Text color="warning">◷ pending</Text>
            {paused.length > 0 && <Text color="warning">⏸ paused</Text>}
          </Box>
        </Box>
      )}
    </Box>
  ))
}
