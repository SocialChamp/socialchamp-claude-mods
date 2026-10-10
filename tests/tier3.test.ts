import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { bulkFailures, checkStaged, matchedAfter, retryItems } from '../hooks/data'

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 110, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 100 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const base = new Date()
const at = (days: number, h: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, h, 0).toISOString()

type Call = { tool: string; args: Record<string, unknown> }
type FakePost = Record<string, unknown> & { id: string }

const setup = (on: On, options: { refuse?: Record<string, string>; replies?: Record<string, unknown>; store?: Record<string, unknown> } = {}) => {
  const calls: Call[] = []
  const toasts: string[] = []
  const posts: FakePost[] = [
    { id: 's1', channelId: 'c1', text: 'First', dateTime: at(1, 10), socialType: 'IN_PAGE', sourceType: 'QUEUE', labelIds: [] },
    { id: 's2', channelId: 'c2', text: 'Second', dateTime: at(1, 11), socialType: 'TW', sourceType: 'QUEUE', labelIds: [] },
    { id: 'o1', channelId: 'c9', text: 'Other workspace', dateTime: at(1, 12), socialType: 'TW', sourceType: 'QUEUE', labelIds: [] },
    { id: 'f1', channelId: 'c1', text: 'Broke', dateTime: at(0, 0), socialType: 'IN_PAGE', sourceType: 'QUEUE', hasError: true, error: 'Token expired', labelIds: [] },
    { id: 'f2', channelId: 'c2', text: 'Broke too', dateTime: at(0, 0), socialType: 'TW', sourceType: 'QUEUE', hasError: true, error: 'Rate limit', labelIds: [] },
  ]
  mock.store(on, options.store)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('mcp.call', (_$, e) => {
    const args = e.args as Record<string, unknown>
    calls.push({ tool: e.tool, args })
    const reply = (value: unknown, isError = false) =>
      ({ value: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError } })
    if (options.refuse?.[e.tool] !== undefined) {
      if (e.tool === 'bulk_schedule') {
        // It went in after all, for the first entry only.
        const first = (args.posts as Array<{ text: string; channelIds: string[]; dateTime: string }>)[0]!
        posts.push({ id: 'new1', channelId: first.channelIds[0]!, text: first.text, dateTime: first.dateTime, socialType: 'TW', sourceType: 'QUEUE', labelIds: [] })
      }
      return reply(options.refuse[e.tool], true)
    }
    if (e.tool === 'queue_reorder') {
      for (const item of args.items as Array<{ postId: string; dateTime: string }>) {
        const post = posts.find(p => p.id === item.postId)
        if (post) post.dateTime = item.dateTime
      }
    }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts, pagination: { totalPages: 1 } },
      get_channels: { items: [
        { id: 'c1', name: 'Pandas', type: 'IN_PAGE', workspaceId: 'w1' },
        { id: 'c2', name: 'Harbor Cafe on X', type: 'TW', workspaceId: 'w1' },
        { id: 'c9', name: 'Elsewhere', type: 'TW', workspaceId: 'w2' },
      ] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 2 }, { id: 'w2', name: 'Other', profilesCount: 1 }] },
      approval_list_pending: { items: [] },
      label_list: { labels: [{ id: 'l1', title: 'launch' }] },
      ...options.replies,
    }
    return reply(answers[e.tool] ?? { ok: true })
  })
  const writes = () => calls.filter(c => !/^(get_|label_list|approval_list_pending)/.test(c.tool))
  return { calls, toasts, posts, clock, writes }
}

const mount = async ($: Engine, view: string) => {
  await $.command.run({ command: 'socialchamp-calendar', args: view, ...RUN })
  return $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
}

test('Claude stages posts; bad ones are refused with reasons; the ticked ones are scheduled after one Yes', async ($, on) => {
  const fake = setup(on)
  const ui = await mount($, 'week')
  const answer = await $.tool.call({ tool: 'mcp__socialchamp-calendar__stage_posts', posts: [
    { channelId: 'c1', dateTime: at(2, 9), text: 'Monday reel' },
    { channelId: 'c2', dateTime: at(2, 13), text: 'Monday thread' },
    { channelId: 'c9', dateTime: at(2, 15), text: 'Wrong workspace' },
    { channelId: 'c1', dateTime: at(-1, 9), text: 'In the past' },
    { channelId: 'nope', dateTime: at(2, 9), text: 'Unknown' },
  ] })
  const said = JSON.stringify(answer)
  expect(said).toMatch(/Staged 2 posts/)
  expect(said).toMatch(/#3: channel is in another workspace/)
  expect(said).toMatch(/#4: time has passed/)
  expect(said).toMatch(/#5: unknown channel/)
  expect(await ui.find({ text: /2 of 2 ticked/ })).toBeDefined()
  const ticks = (await ui.findAll({ type: 'Button' })).filter((b: { key?: unknown }) => String(b.key).startsWith('staged-tick-'))
  await ui.press({ plugin: 'socialchamp-calendar', key: String(ticks[1]!.key) })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'staged-schedule' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.writes()).toEqual([{ tool: 'bulk_schedule', args: { posts: [
    { text: 'Monday reel', channelIds: ['c1'], isScheduled: true, dateTime: new Date(at(2, 9)).toISOString() },
  ] } }])
  expect(await ui.find({ text: /ticked/ })).toBeUndefined()
})

test('an unclear batch outcome is reported from what can be seen, and no retry is offered', async ($, on) => {
  const fake = setup(on, { refuse: { bulk_schedule: 'Gateway timeout' } })
  const ui = await mount($, 'week')
  await $.tool.call({ tool: 'mcp__socialchamp-calendar__stage_posts', posts: [
    { channelId: 'c1', dateTime: at(2, 9), text: 'One' },
    { channelId: 'c2', dateTime: at(2, 10), text: 'Two' },
  ] })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'staged-schedule' })
  // Ticks change while the Yes bar is open: the batch already holds both posts.
  const ticks = (await ui.findAll({ type: 'Button' })).filter((b: { key?: unknown }) => String(b.key).startsWith('staged-tick-'))
  await ui.press({ plugin: 'socialchamp-calendar', key: String(ticks[0]!.key) })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.toasts.some(t => /Outcome unclear: 1 of 2 posts can be seen in Social Champ and are off the list/.test(t))).toBe(true)
  // "One" went in and is off the list, whatever the ticks said by then; "Two" stays, unticked.
  expect(await ui.find({ text: /One$/ })).toBeUndefined()
  expect(await ui.find({ text: /Two$/ })).toBeDefined()
  // The one that went in is off the list; the other is unticked, so one more press sends nothing.
  expect(await ui.find({ text: /0 of 1 ticked/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'staged-schedule' })
  expect(fake.toasts).toContain('Tick at least one post')
  expect(fake.writes().filter(w => w.tool === 'bulk_schedule').length).toBe(1)
})

test('select several posts of one workspace and move them an hour, then undo', async ($, on) => {
  const fake = setup(on)
  const ui = await mount($, 'day')
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'all' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'select-toggle' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-s2' })
  expect(await ui.find({ text: /2 posts selected/ })).toBeDefined()
  const s1 = String(fake.posts[0]!.dateTime)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'bulk-hour' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  const moved = fake.writes()[0]!
  expect(moved.tool).toBe('queue_reorder')
  expect((moved.args.items as Array<{ dateTime: string }>)[0]!.dateTime).toBe(new Date(Date.parse(s1) + 3600_000).toISOString())
  await ui.press({ plugin: 'socialchamp-calendar', key: 'undo' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect((fake.writes()[1]!.args.items as Array<{ dateTime: string }>)[0]!.dateTime).toBe(s1)
})

test('a post of another workspace cannot join a selection', async ($, on) => {
  const fake = setup(on)
  const ui = await mount($, 'day')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'select-toggle' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-s1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'all' })
  expect(await ui.find({ key: 'pick-o1' })).toBeUndefined()
})

test('retry every failed post from the Issues view, a minute apart', async ($, on) => {
  const fake = setup(on)
  const ui = await mount($, 'issues')
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'select-toggle' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-f1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-f2' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'bulk-retry' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  // One update_post per post, as the single retry does.
  const retried = fake.writes()
  expect(retried.map(w => [w.tool, w.args.postId])).toEqual([['update_post', 'f1'], ['update_post', 'f2']])
  expect(Date.parse(String(retried[1]!.args.dateTime)) - Date.parse(String(retried[0]!.args.dateTime))).toBe(60_000)
})

test('a label added to several posts reports the ones that failed and keeps them selected', async ($, on) => {
  const fake = setup(on, { replies: { bulk_label: { updated: ['s1'], failed: [{ postId: 's2', error: 'locked' }] } } })
  const ui = await mount($, 'day')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'select-toggle' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'pick-s2' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'bulk-label', value: 'l1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.writes()[0]).toEqual({ tool: 'bulk_label', args: { postIds: ['s1', 's2'], labelIds: ['l1'], mode: 'add' } })
  expect(fake.toasts.some(t => /1 of 2 failed; they are still selected/.test(t))).toBe(true)
  expect(await ui.find({ text: /1 post selected/ })).toBeDefined()
})

test('the morning brief shows once a day', async ($, on) => {
  const fake = setup(on)
  const ui = await mount($, 'week')
  await fake.clock.advance(10)
  await fake.clock.advance(10)
  expect(await ui.find({ key: 'brief-dismiss' })).toBeDefined()
  expect(await ui.find({ text: /2 failed since yesterday/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'brief-dismiss' })
  await $.command.run({ command: 'socialchamp-calendar', args: 'refresh', ...RUN })
  await fake.clock.advance(10)
  expect(await ui.find({ key: 'brief-dismiss' })).toBeUndefined()
})

test('staged posts, retries and batch reconciliation, one by one', () => {
  const channels = [{ id: 'c1', name: 'a', type: 'TW', workspaceId: 'w1' }]
  const now = Date.parse('2026-10-10T12:00:00Z')
  expect(checkStaged({ posts: [], extra: 1 }, channels, 'all', now).rejected[0]).toMatch(/unexpected fields: extra/)
  expect(checkStaged({ posts: [{ channelId: 'c1', dateTime: '2026-10-11', text: 'x' }] }, channels, 'all', now).rejected[0]).toMatch(/ISO date and time/)
  expect(checkStaged({ posts: [{ channelId: 'c1', dateTime: '2026-10-11T09:00:00', text: 'x' }] }, channels, 'all', now).rejected[0]).toMatch(/time zone/)
  expect(checkStaged({ posts: [{ channelId: 'c1', dateTime: '2026-10-11T09:00:00+05:00', text: 'x' }] }, channels, 'all', now).accepted.length).toBe(1)
  expect(checkStaged({ posts: [{ channelId: 'c1', dateTime: '2026-10-11T09:00:00Z', text: 'x'.repeat(281) }] }, channels, 'all', now).rejected[0]).toMatch(/over/)
  expect(checkStaged({ posts: [{ channelId: 'c1', dateTime: '2026-10-11T09:00:00Z', text: 'ok', sneaky: 1 }] }, channels, 'all', now).rejected[0]).toMatch(/unexpected fields sneaky/)
  const posts = [{ id: 'a' }, { id: 'b' }] as Parameters<typeof retryItems>[0]
  expect(retryItems(posts, now).map(i => i.dateTime)).toEqual(['2026-10-10T12:15:00.000Z', '2026-10-10T12:16:00.000Z'])
  expect(bulkFailures({ updated: ['a'], failures: [{ postId: 'b' }, 'c'] })).toEqual(['b', 'c'])
  const entries = [{ text: 'x', channelIds: ['c1'], dateTime: '2026-10-11T09:00:00Z' }, { text: 'x', channelIds: ['c1'], dateTime: '2026-10-11T09:00:00Z' }]
  const one = [{ id: 'n1', channelId: 'c1', text: 'x', dateTime: '2026-10-11T09:00:00.000Z' }] as Parameters<typeof matchedAfter>[2]
  expect(matchedAfter(entries, new Set(), one)).toBe(1)
  expect(matchedAfter(entries, new Set(['n1']), one)).toBe(0)
})

test('a delete that Social Champ answers "already deleted" is not reported as done', async ($, on) => {
  const fake = setup(on, { replies: { delete_post: { alreadyDeleted: true } } })
  const ui = await mount($, 'day')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-delete' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.toasts.some(t => /found nothing to delete/.test(t))).toBe(true)
})
