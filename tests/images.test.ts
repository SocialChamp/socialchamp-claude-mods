import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { generatedImageUrls } from '../hooks/data'

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 100 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const base = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const later = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 3, 9, 30)
const laterText = `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())} 09:30`
const GOOD = 'https://media.socialchamp.io/ai/images/sea.png'

const setup = (on: On, generate: { text: string; isError?: boolean }) => {
  const writes: Array<{ tool: string; args: Record<string, unknown> }> = []
  const toasts: string[] = []
  mock.store(on)
  mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('mcp.call', (_$, e) => {
    if (!/^(get_|approval_list_pending|label_list)/.test(e.tool)) writes.push({ tool: e.tool, args: e.args as Record<string, unknown> })
    if (e.tool === 'generate_image') return { value: { content: [{ type: 'text', text: generate.text }], isError: generate.isError ?? false } }
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: [], pagination: { totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Reef Insta', type: 'IG_BUSINESS', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })
  return { writes, toasts }
}

const compose = async ($: Engine) => {
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'ws', value: 'w1' })
  await ui.select({ plugin: 'socialchamp-calendar', key: 'actions', value: 'compose' })
  return ui
}

test('generate an image behind Yes, use the Social Champ one, and schedule it with the words', async ($, on) => {
  const fake = setup(on, { text: JSON.stringify({ images: [{ url: GOOD }, { url: 'https://evil.example.com/x.png' }] }) })
  const ui = await compose($)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'image-prompt', text: 'turquoise sea at sunrise' })
  expect(await ui.find({ text: /uses 1 of your monthly AI images/ })).toBeDefined()
  expect(fake.writes).toEqual([])
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-compose' })
  expect(fake.writes[0]).toEqual({ tool: 'generate_image', args: { workspaceId: 'w1', prompt: 'turquoise sea at sunrise', count: 1 } })
  expect(await ui.find({ key: 'gen-use-0' })).toBeDefined()
  expect(await ui.find({ key: 'gen-use-1' })).toBeUndefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'gen-use-0' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'compose-text', text: 'Morning at the reef' })
  await ui.input({ plugin: 'socialchamp-calendar', key: 'compose-when', text: laterText })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'compose-schedule' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-compose' })
  expect(fake.writes[1]).toEqual({ tool: 'create_image_post', args: {
    text: 'Morning at the reef', imageUrls: [GOOD], channelIds: ['c1'], isScheduled: true, dateTime: later.toISOString(),
  } })
})

test('one image a session by default; a timeout is said plainly and still counts', async ($, on) => {
  const fake = setup(on, { text: 'Publisher did not respond before the MCP request deadline (504)', isError: true })
  const ui = await compose($)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'image-prompt', text: 'sea' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-compose' })
  expect(fake.toasts.some(t => /image generator did not answer in time/.test(t))).toBe(true)
  await ui.input({ plugin: 'socialchamp-calendar', key: 'image-prompt', text: 'sea again' })
  expect(fake.toasts.some(t => /image limit \(1\) is used/.test(t))).toBe(true)
  expect(fake.writes.filter(w => w.tool === 'generate_image').length).toBe(1)
})

test('only Social Champ-hosted image links are taken from a reply', () => {
  expect(generatedImageUrls({ data: { images: [GOOD, 'https://media.socialchamp.io/x.mp4', 'http://media.socialchamp.io/y.png'] }, other: 'https://cdn.example.com/z.jpg' }))
    .toEqual([GOOD])
  expect(generatedImageUrls({ url: 'https://app.socialchamp.com/media/a.JPG?size=large' })).toEqual(['https://app.socialchamp.com/media/a.JPG?size=large'])
  expect(generatedImageUrls(null)).toEqual([])
})
