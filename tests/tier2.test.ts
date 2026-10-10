import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const base = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const at = (days: number, h: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, h, 0).toISOString()
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Call = { tool: string; args: Record<string, unknown> }
type FakePost = Record<string, unknown> & { id: string }

/** A Social Champ that remembers changes, so Undo and the check at Yes see what a real one would. */
const setup = (on: On, refuse: Record<string, string> = {}) => {
  const calls: Call[] = []
  const toasts: string[] = []
  const posts: FakePost[] = [
    { id: 's1', channelId: 'c1', text: 'Launch teaser', dateTime: at(1, 10), socialType: 'IN_PAGE', sourceType: 'QUEUE', labelIds: [] },
    { id: 'ig', channelId: 'c3', text: 'Reel from the reef', dateTime: at(1, 12), socialType: 'IG_BUSINESS', sourceType: 'QUEUE', labelIds: [] },
    { id: 'pd', channelId: 'c1', text: 'Needs a yes', dateTime: at(1, 15), socialType: 'IN_PAGE', sourceType: 'QUEUE', approvalStatus: 'PENDING', labelIds: [] },
  ]
  mock.store(on)
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
    if (refuse[e.tool] !== undefined) return reply(refuse[e.tool], true)
    if (e.tool === 'update_post') {
      const post = posts.find(p => p.id === args.postId)
      if (post && typeof args.text === 'string') post.text = args.text
      if (post && typeof args.dateTime === 'string') post.dateTime = args.dateTime
      return reply({ ok: true })
    }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts, pagination: { totalPages: 1 } },
      get_channels: { items: [
        { id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' },
        { id: 'c2', name: 'Harbor Cafe on X', type: 'TW', workspaceId: 'w1' },
        { id: 'c3', name: 'Reef Insta', type: 'IG_BUSINESS', workspaceId: 'w1' },
      ] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 3 }] },
      approval_list_pending: { items: [] },
      label_list: { labels: [] },
      list_collections: { collections: [{ id: 'k1', title: 'Evergreen', postCount: 4, workspaceId: 'w1' }] },
      get_shareable_calendars: { items: [{ _id: 'db1', name: 'April plan', isActive: true, link: 'https://publish.socialchamp.com/app/client/calendar?id=x' }] },
    }
    return reply(answers[e.tool] ?? { ok: true })
  })
  on('model.complete', () => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return { value: { isAnswered: true as const, text: 'Dive in 🌊 #reef #karachi', usage } }
  })
  const writes = () => calls.filter(c => !/^(get_|label_list|list_collections|approval_list_pending)/.test(c.tool))
  return { calls, toasts, posts, clock, writes }
}

const openPost = async ($: Engine, id: string) => {
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: `open-${id}` })
  return ui
}

test('edit a post\'s words: checked again at Yes, sent, and undone in one press', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-edit' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'edit-text', text: 'Launch teaser, now with a date' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'edit-save' })
  expect(await ui.find({ text: /may go back to pending/ })).toBeDefined()
  expect(await ui.find({ text: /You can undo this here/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'update_post', args: { postId: 's1', text: 'Launch teaser, now with a date' } }])
  await ui.press({ plugin: 'socialchamp-calendar', key: 'undo' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes().at(-1)).toEqual({ tool: 'update_post', args: { postId: 's1', text: 'Launch teaser' } })
})

test('a post changed in Social Champ after the proposal is not overwritten', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-edit' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'edit-text', text: 'My new words' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'edit-save' })
  fake.posts[0]!.text = 'Someone else edited this meanwhile'
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([])
  expect(fake.toasts.some(t => /changed in Social Champ since/.test(t))).toBe(true)
})

test('a move is undone back to its old time', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  const before = String(fake.posts[0]!.dateTime)
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-hour' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'undo' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes().map(w => w.args.dateTime)).toEqual([new Date(Date.parse(before) + 3600_000).toISOString(), before])
})

test('Instagram first comment: Claude writes it, the person sets it', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 'ig')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-comment' })
  expect(await ui.find({ text: /cannot show the current one/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'comment-write' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'comment-save' })
  expect(await ui.find({ text: /This cannot be undone/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-ig' })
  expect(fake.writes()).toEqual([{ tool: 'instagram_first_comment', args: { postId: 'ig', firstComment: 'Dive in 🌊 #reef #karachi', workspaceId: 'w1' } }])
})

test('the first-comment tool is only offered on Instagram posts', async ($, on) => {
  setup(on)
  const ui = await openPost($, 's1')
  expect(await ui.find({ key: 'tool-comment' })).toBeUndefined()
})

test('duplicate to another channel, scheduled, never published at once', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-copy' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'copy-channel', value: 'c2' })
  const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 3, 9, 30)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'copy-when', text: `${dayOf(target.toISOString())} 09:30` })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'create_text_post', args: { text: 'Launch teaser', channelIds: ['c2'], isScheduled: true, dateTime: target.toISOString() } }])
})

test('recycle into a collection', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-recycle' })
  await fake.clock.advance(10)
  await ui.select({ plugin: 'socialchamp-calendar', key: 'recycle-collection', value: 'k1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'recycle_post', args: { postId: 's1', collectionId: 'k1' } }])
})

test('approval reminder, and the hourly limit said plainly', async ($, on) => {
  const fake = setup(on, { approval_assign: 'ALREADY_NOTIFIED: a reminder was sent less than an hour ago' })
  const ui = await openPost($, 'pd')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-remind' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-pd' })
  expect(fake.writes()).toEqual([{ tool: 'approval_assign', args: { postId: 'pd' } }])
  expect(fake.toasts).toContain('Already reminded in the last hour')
})

test('share links: the existing ones are listed and can be turned off', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'share' })
  await fake.clock.advance(10)
  expect(await ui.find({ text: /April plan/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'share-toggle-db1' })
  expect(await ui.find({ text: /stops working for anyone who has it/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-toolbar' })
  expect(fake.writes()).toEqual([{ tool: 'update_shareable_calendar', args: { calendarId: 'db1', isActive: false, workspaceId: 'w1' } }])
})

test('Claude can move the pane and read what it shows, never the post words', async ($, on) => {
  const fake = setup(on)
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  const shown = await $.tool.call({ tool: 'mcp__socialchamp-calendar__show_in_calendar', view: 'day', day: dayOf(at(1, 10)), postId: 's1' })
  expect(JSON.stringify(shown)).toMatch(/Opened post s1/)
  expect(await ui.find({ text: /^Launch teaser$/ })).toBeDefined()
  const context = await $.tool.call({ tool: 'mcp__socialchamp-calendar__calendar_context' })
  const text = JSON.stringify(context)
  expect(text).toMatch(/selectedPostId\\":\\"s1/)
  expect(text).not.toMatch(/Launch teaser|Reel from the reef|Bring Pandas Back/)
  expect(fake.writes()).toEqual([])
  const bad = await $.tool.call({ tool: 'mcp__socialchamp-calendar__show_in_calendar', view: 'year' })
  expect(JSON.stringify(bad)).toMatch(/Unknown view/)
})

test('delete a post from the pane: only after Yes, and the bar says it cannot be undone', async ($, on) => {
  const fake = setup(on)
  const ui = await openPost($, 's1')
  await ui.press({ plugin: 'socialchamp-calendar', key: 'tool-delete' })
  expect(fake.writes()).toEqual([])
  expect(await ui.find({ text: /It will not be published/ })).toBeDefined()
  expect(await ui.find({ text: /This cannot be undone/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(fake.writes()).toEqual([{ tool: 'delete_post', args: { postId: 's1' } }])
  expect(await ui.find({ key: 'tool-delete' })).toBeUndefined()
})
