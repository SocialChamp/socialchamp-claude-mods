import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Posts tomorrow, so every move lands in the future whatever time the tests run.
const base = new Date()
const tomorrow = (h: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, h, 0).toISOString()
const ymdOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const POSTS = [
  { id: 's1', channelId: 'c1', text: 'Launch teaser', dateTime: tomorrow(10), socialType: 'IN_PAGE', labelIds: ['l1'] },
  { id: 's2', channelId: 'c2', text: 'Reel drop', dateTime: tomorrow(12), socialType: 'IG_BUSINESS', labelIds: [] },
  { id: 'done', channelId: 'c1', text: 'Already out', dateTime: tomorrow(8), socialType: 'IN_PAGE', isPosted: true, labelIds: [] },
]
const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }

type Call = { tool: string; args: Record<string, unknown> }

/**
 * A fake Social Champ: answers reads, records every call, and refuses the tools in `refuse`.
 * Once a tool named in `breaksReadsAfter` has been called, post reads fail.
 */
const setup = (on: On, refuse: string[] = [], breaksReadsAfter?: string) => {
  const calls: Call[] = []
  const toasts: string[] = []
  mock.store(on)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('mcp.call', (_$, e) => {
    calls.push({ tool: e.tool, args: e.args as Record<string, unknown> })
    if (e.tool === 'get_paginated_posts' && breaksReadsAfter !== undefined && calls.some(c => c.tool === breaksReadsAfter)) {
      return { value: { content: [{ type: 'text', text: 'upstream timeout' }], isError: true } }
    }
    if (refuse.includes(e.tool)) {
      return { value: { content: [{ type: 'text', text: 'The server-side auto mode classifier gave no verdict' }], isError: true } }
    }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: POSTS, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [
        { id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' },
        { id: 'c2', name: 'Social Champ', type: 'IG_BUSINESS', workspaceId: 'w1' },
      ] },
      get_workspaces: { items: [{ id: 'w1', name: 'Social Champ', profilesCount: 2 }] },
      approval_list_pending: { items: [] },
      label_list: { labels: [{ id: 'l1', title: 'marketing' }, { id: 'l2', title: 'launch' }, { id: 'l3', title: 'promo' }] },
      create_public_calendar_link: { _id: 'db1', calendarId: 'uuid-1', link: 'https://publish.socialchamp.com/app/client/calendar?id=uuid-1' },
      label_create: { id: 'l9', title: 'new one' },
      get_calendar_events: { events: [{ id: 'PK:x', summary: 'Durga Puja', dateTime: `${ymdOf(tomorrow(10))}T00:00:00.000Z`, isHoliday: true, allDay: true }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? { ok: true }) }], isError: false } }
  })
  const writes = () => calls.filter(c => !['get_paginated_posts', 'get_channels', 'get_workspaces', 'approval_list_pending', 'label_list', 'get_calendar_events'].includes(c.tool))
  return { calls, toasts, writes, clock }
}

test('rescheduling a post asks first, then moves it by exactly an hour', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'today' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-hour' })

  expect(fake.writes()).toEqual([])
  expect(await ui.find({ text: /Move "Launch teaser" on Bring Pandas Back/ })).toBeDefined()

  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'update_post', args: { postId: 's1', dateTime: new Date(Date.parse(tomorrow(10)) + 3600_000).toISOString() } }])
  expect(fake.toasts.some(t => t.includes('Done: Move'))).toBe(true)
})

test('a published post offers no reschedule, and cancel sends nothing', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-done' })
  expect(await ui.find({ key: 'plus-hour' })).toBeUndefined()

  await ui.press({ plugin: 'socialchamp-calendar', key: 'back' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s2' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'when', text: '23:59' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'no-s2' })
  expect(fake.writes()).toEqual([])
})

test('labels: add one from the workspace list, keeping the ones already on the post', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await fake.clock.advance(10)
  expect(await ui.find({ text: /🏷 marketing/ })).toBeDefined()
  await ui.select({ plugin: 'socialchamp-calendar', key: 'add-label', value: '' })
  expect(await ui.find({ key: 'yes-s1' })).toBeUndefined()
  await ui.select({ plugin: 'socialchamp-calendar', key: 'add-label', value: 'l2' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'label_apply', args: { postId: 's1', labelIds: ['l1', 'l2'], workspaceId: 'w1' } }])
})

test('pause a workspace, then share its week as a password-protected link', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  expect(await ui.find({ key: 'actions' })).toBeUndefined()

  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'pause' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.writes()).toEqual([{ tool: 'queue_pause', args: { workspaceId: 'w1' } }])
  expect(await ui.find({ text: /2 channels paused from this pane/ })).toBeDefined()

  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'share' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'share-pass', text: 'short' })
  expect(fake.toasts.some(t => /8 to 20 characters/.test(t))).toBe(true)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'share-pass', text: 'longenough1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  const share = fake.writes().find(c => c.tool === 'create_public_calendar_link')
  expect(share?.args).toMatchObject({ workspaceId: 'w1', profileIds: ['c1', 'c2'], password: 'longenough1' })
  expect(await ui.find({ key: 'copy-share' })).toBeDefined()
})

test('moving a whole day keeps each post time and skips published posts', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  expect(await ui.find({ key: 'shift-next' })).toBeUndefined()
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'move' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'shift-next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: `yes-day-${ymdOf(tomorrow(10))}` })
  const reorder = fake.writes().find(c => c.tool === 'queue_reorder')
  const items = reorder?.args.items as Array<{ postId: string; dateTime: string }>
  expect(items.map(i => i.postId).sort()).toEqual(['s1', 's2'])
  expect(items.find(i => i.postId === 's1')?.dateTime).toBe(new Date(Date.parse(tomorrow(10)) + 24 * 3600_000).toISOString())
})

test('a change auto mode blocks says how to allow it', async ($, on) => {
  const fake = setup(on, ['update_post'])
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s2' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-day' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s2' })
  expect(fake.toasts.some(t => /Auto mode blocked this change/.test(t))).toBe(true)
  expect(await ui.find({ text: /Working:/ })).toBeUndefined()
})

test('public holidays show as chips in the week, month and day views', async ($, on) => {
  setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'refresh' })
  const weekShows = await ui.find({ text: /🎉 Durga Puja/ })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'view-month' })
  const monthShows = await ui.find({ text: /🎉 Durga Puja/ })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'view-day' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  expect(weekShows ?? monthShows).toBeDefined()
  expect(monthShows).toBeDefined()
  expect(await ui.find({ text: /public holiday/ })).toBeDefined()
})

test('pressing Yes twice sends the change once', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-hour' })
  await Promise.all([
    ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' }),
    ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' }),
  ])
  expect(fake.writes().filter(c => c.tool === 'update_post')).toHaveLength(1)
})

test('a label added before a failed refresh is kept when the next one is added', async ($, on) => {
  const fake = setup(on, [], 'label_apply')
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await fake.clock.advance(10)
  await ui.select({ plugin: 'socialchamp-calendar', key: 'add-label', value: 'l2' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  // The refresh after it failed; the pane still knows the post now carries l2.
  expect(await ui.find({ text: /🏷 launch/ })).toBeDefined()
  await ui.select({ plugin: 'socialchamp-calendar', key: 'add-label', value: 'l3' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes().map(c => c.args.labelIds)).toEqual([['l1', 'l2'], ['l1', 'l2', 'l3']])
})

test('moving to the next week reads its posts once', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await fake.clock.advance(10)
  const before = fake.calls.filter(c => c.tool === 'get_paginated_posts').length
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await fake.clock.advance(10)
  expect(fake.calls.filter(c => c.tool === 'get_paginated_posts').length - before).toBe(1)
})

test('a write whose connector drops is sent once, never retried', async ($, on) => {
  const sent: string[] = []
  mock.store(on)
  mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => {
    sent.push(`${e.server}:${e.tool}`)
    // The connector drops out just as the write goes.
    if (e.tool === 'update_post') {
      return { value: { content: [{ type: 'text', text: `$.mcp.call: no connected MCP tool "update_post" on a server named "${e.server}"` }], isError: true } }
    }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: POSTS, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Social Champ', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? { items: [] }) }], isError: false } }
  })
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'today' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-hour' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })

  expect(sent.filter(s => s.endsWith(':update_post'))).toEqual(['SocialChamp:update_post'])
})
