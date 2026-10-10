import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { openSlots, parseDrafts, parseSummary, parseTimetable, summaryByDay, sumCounts, zonedInstant } from '../hooks/data'

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 80 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const base = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = ymdOf(base)
const tomorrow = (h: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, h, 0).toISOString()

type Call = { tool: string; args: Record<string, unknown> }

/** A fake Social Champ with the newer tools; `summary` false refuses get_calendar_summary like a delegated login. */
const setup = (on: On, options: { summary?: boolean | 'timeout'; store?: Record<string, unknown> } = {}) => {
  const calls: Call[] = []
  const statuses: Array<string | undefined> = []
  mock.store(on, options.store)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', (_$, e) => {
    statuses.push((e as { text?: string }).text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => {
    calls.push({ tool: e.tool, args: e.args as Record<string, unknown> })
    if (e.tool === 'get_calendar_summary' && options.summary === 'timeout') {
      return { value: { content: [{ type: 'text', text: 'Publisher did not respond before the MCP request deadline (504)' }], isError: true } }
    }
    if (e.tool === 'get_calendar_summary' && options.summary === false) {
      return { value: { content: [{ type: 'text', text: 'Available to owner connections only' }], isError: true } }
    }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: [
        { id: 's1', channelId: 'c1', text: 'Launch teaser', dateTime: tomorrow(10), socialType: 'IN_PAGE', sourceType: 'QUEUE' },
        { id: 's2', channelId: 'c2', text: 'Reel drop for the dive vlog', dateTime: tomorrow(12), socialType: 'FB_PAGE', sourceType: 'QUEUE' },
      ], pagination: { totalPages: 1 } },
      get_channels: { items: [
        { id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' },
        { id: 'c2', name: 'Harbor Cafe', type: 'FB_PAGE', workspaceId: 'w1' },
      ] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 2 }] },
      approval_list_pending: { items: [] },
      get_calendar_summary: { counts: [
        { day: today, channelId: 'c1', status: 'SCHEDULED', count: 3 },
        { day: today, channelId: 'c2', status: 'FAILED', count: 2 },
        { day: today, channelId: 'c2', status: 'HELD', count: 1 },
      ] },
      get_drafts: { items: [
        { _id: 'd1', posts: { ALL: { post: 'Weekend dive teaser', attachments: [] } }, dateTime: tomorrow(9), createdBy: 'Alex' },
        { _id: 'd2', posts: { ALL: { post: 'Undated idea' } }, createdBy: 'Ebad' },
      ] },
      get_queue_slots: { channelId: 'c2', timetable: { timezoneName: 'UTC', days: [
        { type: 'MON', slots: ['2023-03-01T09:00:00.000Z'] }, { type: 'TUE', slots: ['2023-03-01T09:00:00.000Z'] },
        { type: 'WED', slots: ['2023-03-01T09:00:00.000Z'] }, { type: 'THU', slots: ['2023-03-01T09:00:00.000Z'] },
        { type: 'FRI', slots: ['2023-03-01T09:00:00.000Z'] }, { type: 'SAT', slots: ['2023-03-01T09:00:00.000Z'] },
        { type: 'SUN', slots: ['2023-03-01T09:00:00.000Z'] },
      ] } },
      get_posts_for_channels: { items: [] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })
  on('model.complete', () => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return { value: { isAnswered: true as const, text: 'Tighter: "Dive teaser this weekend."', usage } }
  })
  return { calls, statuses, clock }
}

const open = async ($: Engine, view: string) => {
  await $.command.run({ command: 'socialchamp-calendar', args: view, ...RUN })
  return $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
}

const openOnPhone = async ($: Engine, view: string) => {
  await $.command.run({ command: 'socialchamp-calendar', args: view, ...RUN })
  return $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'mobile', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
}

test('the month counts from one summary call, and opening a day loads that day\'s posts', async ($, on) => {
  const fake = setup(on)
  const ui = await open($, 'month')
  await fake.clock.advance(10)
  const summaries = fake.calls.filter(c => c.tool === 'get_calendar_summary')
  expect(summaries.length).toBe(2)
  expect(typeof summaries[0]?.args.timezone).toBe('string')
  // Only the status line's read of today: no paging through the month.
  const wide = (c: Call) => Date.parse(String(c.args.toDate)) - Date.parse(String(c.args.fromDate)) > 2 * 86_400_000
  expect(fake.calls.filter(c => c.tool === 'get_paginated_posts').some(wide)).toBe(false)
  expect(await ui.find({ text: /6 posts this month/ })).toBeDefined()
  expect(await ui.find({ text: /2 failed/ })).toBeDefined()
  // The Issues badge reads the Issues-interval summary: exact, no "+".
  expect(await ui.find({ text: /Issues \(2\)$/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: `m-${today}` })
  await fake.clock.advance(10)
  expect(fake.calls.some(c => c.tool === 'get_paginated_posts')).toBe(true)
})

test('a summary timeout pages this month only; the next month asks the summary again', async ($, on) => {
  const fake = setup(on, { summary: 'timeout' })
  const ui = await open($, 'month')
  await fake.clock.advance(10)
  expect(fake.calls.some(c => c.tool === 'get_paginated_posts')).toBe(true)
  const before = fake.calls.filter(c => c.tool === 'get_calendar_summary').length
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  expect(fake.calls.filter(c => c.tool === 'get_calendar_summary').length).toBeGreaterThan(before)
})

test('a connection that refuses the summary pages through posts as before', async ($, on) => {
  const fake = setup(on, { summary: false })
  const ui = await open($, 'month')
  await fake.clock.advance(10)
  expect(fake.calls.some(c => c.tool === 'get_paginated_posts')).toBe(true)
  expect(await ui.find({ text: /posts? this month/ })).toBeDefined()
})

test('drafts: pick a workspace, see dated and undated drafts, open one and have Claude polish it', async ($, on) => {
  const fake = setup(on)
  const ui = await open($, 'drafts')
  expect(await ui.find({ text: /Pick a workspace to see its drafts/ })).toBeDefined()
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await fake.clock.advance(10)
  expect(fake.calls.find(c => c.tool === 'get_drafts')?.args).toMatchObject({ workspaceId: 'w1', page: 1 })
  expect(await ui.find({ text: /Undated idea/ })).toBeDefined()
  expect(await ui.find({ text: /No date/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-draft-d1' })
  expect(await ui.find({ text: /^Weekend dive teaser$/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'polish-draft' })
  expect(await ui.find({ text: /Dive teaser this weekend/ })).toBeDefined()
  // The connector cannot delete drafts: no Delete button, a pointer to Social Champ instead.
  expect(await ui.find({ key: 'delete-draft' })).toBeUndefined()
  expect(await ui.find({ text: /cannot delete drafts yet/ })).toBeDefined()
})

test('search narrows the week to matching posts, and clears', async ($, on) => {
  const fake = setup(on)
  const ui = await open($, 'week')
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'prev' })
  await fake.clock.advance(10)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'search', text: 'dive' })
  expect(await ui.find({ key: 'open-s2' })).toBeDefined()
  expect(await ui.find({ key: 'open-s1' })).toBeUndefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'clear-filters' })
  expect(await ui.find({ key: 'open-s1' })).toBeDefined()
})

test('New post offers the channel\'s free queue slots, and one press sets the time', async ($, on) => {
  const fake = setup(on)
  const ui = await open($, 'week')
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'compose' })
  await fake.clock.advance(10)
  expect(fake.calls.find(c => c.tool === 'get_queue_slots')?.args).toMatchObject({ channelId: 'c2' })
  const chips = (await ui.findAll({ type: 'Button' })).filter((b: { key?: unknown }) => String(b.key).startsWith('slot-'))
  expect(chips.length).toBeGreaterThan(0)
  await ui.press({ plugin: 'socialchamp-calendar', key: String(chips[0]!.key) })
  expect(await ui.find({ text: /^Goes out / })).toBeDefined()
})

test('settings: turning the status line off clears it; a remembered channel that no longer exists falls back', async ($, on) => {
  const fake = setup(on, { store: { last: { view: 'week', workspace: 'w1', channel: 'gone' } } })
  const ui = await open($, '')
  await fake.clock.advance(10)
  expect((await ui.find({ key: 'ws' }))?.props.value).toBe('w1')
  expect((await ui.find({ key: 'ch' }))?.props.value).toBe('all')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'settings' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'set-poll', value: '0' })
  expect(fake.statuses.at(-1)).toBeUndefined()
})

test('on a phone the pane draws no fields or dropdowns, and its filters are buttons', async ($, on) => {
  const fake = setup(on)
  const ui = await openOnPhone($, 'week')
  await fake.clock.advance(10)
  expect(await ui.find({ key: 'ws' })).toBeUndefined()
  expect(await ui.find({ key: 'search' })).toBeUndefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'chip-ws-w1' })
  expect(await ui.find({ key: 'chip-ch-c1' })).toBeDefined()
  expect(await ui.find({ key: 'm-pause' })).toBeDefined()
})

test('replies are checked field by field', () => {
  expect(() => parseSummary({ nope: true })).toThrow()
  const rows = parseSummary({ counts: [
    { day: '2026-10-10', channelId: 'c1', status: 'scheduled', count: 2 },
    { day: 'bad', channelId: 'c1', status: 'POSTED', count: 1 },
    { day: '2026-10-10', channelId: 'c2', status: 'FAILED', count: 1, extra: 'x' },
  ] })
  expect(rows).toEqual([
    { day: '2026-10-10', channelId: 'c1', status: 'SCHEDULED', count: 2 },
    { day: '2026-10-10', channelId: 'c2', status: 'FAILED', count: 1 },
  ])
  const channels = [{ id: 'c1', name: 'a', type: 'TW', workspaceId: 'w1' }, { id: 'c2', name: 'b', type: 'TW', workspaceId: 'w2' }]
  expect(sumCounts(summaryByDay(rows, channels, 'w1', 'all'), '2026-10-01', '2026-10-31')).toMatchObject({ total: 2, scheduled: 2, failed: 0 })
  expect(() => parseDrafts({ items: 'x' })).toThrow()
  expect(parseDrafts({ items: [{ _id: '', posts: {} }, { _id: 'd', profiles: [{ _id: 'c1' }, 'c2'] }] }))
    .toEqual([{ id: 'd', text: '', dateTime: null, createdBy: null, channelIds: ['c1', 'c2'], attachments: 0, updatedAt: null }])
  expect(parseTimetable({ timetable: null })).toBeNull()
})

test('open slots: the queue\'s own zone, disabled days skipped, taken minutes skipped, across a clock change', () => {
  const table = parseTimetable({ timetable: { timezoneName: 'Asia/Karachi', days: [
    { type: 'MON', slots: ['2023-03-01T04:00:00.000Z'] },
    { type: 'TUE', slots: ['2023-03-01T04:00:00.000Z'], enabled: false },
  ] } })!
  expect(table.days).toEqual({ MON: ['09:00'] })
  // Monday 2026-10-12 09:00 in Karachi (UTC+5) is 04:00 UTC.
  const now = Date.parse('2026-10-10T12:00:00Z')
  expect(openSlots(table, [], now, 7, 2)).toEqual(['2026-10-12T04:00:00.000Z'])
  expect(openSlots(table, ['2026-10-12T04:00:30.000Z'], now, 7, 2)).toEqual([])
  // New York leaves summer time on 1 Nov 2026: 09:00 is 13:00 UTC before, 14:00 UTC after.
  expect(zonedInstant(2026, 10, 30, 9, 0, 'America/New_York').toISOString()).toBe('2026-10-30T13:00:00.000Z')
  expect(zonedInstant(2026, 11, 2, 9, 0, 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z')
  // 02:30 never happens on 8 March 2026 in New York: it moves forward to 03:30 (07:30 UTC), not back.
  expect(zonedInstant(2026, 3, 8, 2, 30, 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z')
  // 01:30 happens twice on 1 November: the first (summer time, 05:30 UTC).
  expect(zonedInstant(2026, 11, 1, 1, 30, 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z')
})
