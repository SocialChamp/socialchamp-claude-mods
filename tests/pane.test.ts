import { expect, mock, test } from 'claude-code/testing'

const today = new Date()
const at = (h: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, 0).toISOString()

const POSTS = [
  { id: 'p1', channelId: 'c1', text: 'Launch day is here', dateTime: at(9), socialType: 'IN_PAGE', isPosted: true, permalinkUrl: 'https://www.linkedin.com/feed/update/1' },
  { id: 'p2', channelId: 'c2', text: 'Shark clip trick', dateTime: at(11), socialType: 'YT', hasError: true, error: 'Token expired' },
  { id: 'p3', channelId: 'c1', text: 'Waiting on review', dateTime: at(15), socialType: 'IN_PAGE', approvalStatus: 'PENDING' },
]

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 70, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

test('the pane draws the week from Social Champ and opens a post', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const calls: string[] = []
  on('mcp.call', (_$, e) => {
    calls.push(e.tool)
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: POSTS, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [
        { id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' },
        { id: 'c2', name: 'Harbor Cafe', type: 'YT', workspaceId: 'w2' },
      ] },
      get_workspaces: { items: [{ id: 'w1', name: 'Social Champ', profilesCount: 1 }, { id: 'w2', name: 'Official', profilesCount: 1 }] },
    }
    if (e.tool === 'approval_list_pending') {
      return { value: { content: [{ type: 'text', text: 'Insufficient scope: tool "approval_list_pending" requires manage_team.' }], isError: true } }
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })

  await $.command.run({ command: 'socialchamp-calendar', args: 'week', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })

  expect(await ui.find({ text: /Launch day is here/ })).toBeDefined()
  expect(calls).toContain('get_paginated_posts')
  expect(await ui.find({ text: /1 failed/ })).toBeDefined()
  expect(await ui.find({ text: /1 pending/ })).toBeDefined()

  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-p2' })
  expect(await ui.find({ text: /Token expired/ })).toBeDefined()
  expect(await ui.find({ key: 'ask' })).toBeDefined()

  await ui.press({ plugin: 'socialchamp-calendar', key: 'back' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-p3' })
  expect(await ui.find({ key: 'approve' })).toBeUndefined()
  expect(await ui.find({ text: /manage_team/ })).toBeDefined()

  await ui.press({ plugin: 'socialchamp-calendar', key: 'back' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'view-month' })
  expect(await ui.find({ text: /this month/ })).toBeDefined()
  expect(await ui.find({ text: /3 posts/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'view-issues' })
  expect(await ui.find({ text: /Failed · 1/ })).toBeDefined()
  expect(await ui.find({ text: /Needs attention · / })).toBeDefined()
})

test('a busy day still shows its failure, and a range that fails to load says so', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const busy = Array.from({ length: 20 }, (_, i) => ({
    id: `b${i}`, channelId: 'c1', text: `Post ${i}`, dateTime: at(i), socialType: 'IN_PAGE', isPosted: i < 12,
    hasError: i === 19, error: i === 19 ? 'Token expired' : null,
  }))
  let isDown = false
  on('mcp.call', (_$, e) => {
    if (isDown) return { value: { content: [{ type: 'text', text: 'upstream timeout' }], isError: true } }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: busy, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [] }, get_workspaces: { items: [] }, approval_list_pending: { items: [] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })

  await $.command.run({ command: 'socialchamp-calendar', args: 'week', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  expect(await ui.find({ key: 'open-b19' })).toBeDefined()
  expect(await ui.find({ text: /\+ 14 more/ })).toBeDefined()
  expect(await ui.find({ text: /TODAY/ })).toBeDefined()

  isDown = true
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  expect(await ui.find({ text: /Couldn't load/ })).toBeDefined()
  expect(await ui.find({ text: /Nothing scheduled/ })).toBeUndefined()
})

test('a range spread over many small pages loads every post once', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const many = Array.from({ length: 140 }, (_, i) => ({
    id: `m${i}`, channelId: 'c1', text: `Post ${i}`, dateTime: at(i % 24), socialType: 'IN_PAGE', isPosted: true,
  }))
  const asked: number[] = []
  on('mcp.call', (_$, e) => {
    const a = e.args as { page?: number; pageSize?: number }
    const size = a.pageSize ?? 20
    const page = a.page ?? 1
    if (e.tool === 'get_paginated_posts') asked.push(size)
    const answers: Record<string, unknown> = {
      // The last post repeats on the next page, as a page boundary can while posts are added.
      get_paginated_posts: { posts: many.slice((page - 1) * size, page * size + 1), pagination: { page, totalPages: Math.ceil(many.length / size) } },
      get_channels: { items: [] }, get_workspaces: { items: [] }, approval_list_pending: { items: [] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  expect(asked.every(size => size <= 25)).toBe(true)
  expect(await ui.find({ text: /140 posts/ })).toBeDefined()
  expect(await ui.find({ key: 'open-m139' })).toBeDefined()
})

test('a connector still starting is retried, so the pane does not open on an error', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  let isUp = false
  on('mcp.call', (_$, e) => {
    if (!isUp) return { value: { content: [{ type: 'text', text: `$.mcp.call: no connected MCP tool "${e.tool}" on a server named "${e.server}"` }], isError: true } }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: POSTS, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Social Champ', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? { items: [] }) }], isError: false } }
  })
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  expect(await ui.find({ text: /Couldn't load/ })).toBeUndefined()
  isUp = true
  await clock.advance(3_000)
  expect(await ui.find({ text: /Launch day is here/ })).toBeDefined()
  expect(await ui.find({ text: /Couldn't load/ })).toBeUndefined()
})

test('a connector that never answers says how to set its name', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => ({ value: { content: [{ type: 'text', text: `$.mcp.call: no connected MCP tool "${e.tool}" on a server named "${e.server}"` }], isError: true } }))
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  for (let i = 0; i < 5; i++) await clock.advance(3_000)
  expect(await ui.find({ text: /Couldn't load/ })).toBeDefined()
  expect(await ui.find({ text: /plugin configure socialchamp-calendar@socialchamp-mods/ })).toBeDefined()
})

test('names cached from another connector are not shown: they may be another account', async ($, on) => {
  mock.store(on, {
    storeVersion: 2,
    meta: { channels: [{ id: 'x1', name: 'Cached Elsewhere', type: 'FB_PAGE', workspaceId: 'wx' }], workspaces: [{ id: 'wx', name: 'Other Account' }], at: Date.now(), server: 'demo' },
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const calls: string[] = []
  on('mcp.call', (_$, e) => {
    calls.push(e.tool)
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: POSTS, pagination: { page: 1, totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Social Champ', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? { items: [] }) }], isError: false } }
  })
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  expect(calls).toContain('get_channels')
  expect(await ui.find({ text: /Other Account|Cached Elsewhere/ })).toBeUndefined()
})
