import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { ActionKind } from '../types'
import {
  CHAT_BATCH_LIMIT, NO_UNDO, UNDO_HERE, chatVerdict, serverNames, isMissingServer, fenced, isHandOffSafe, networkLink, publishesNow, reversibility,
  socialChampLink, socialChampTool, writeProblem,
} from '../hooks/data'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const LATER = '2026-10-11T09:00:00Z'
const PAST = '2026-10-10T11:00:00Z'

test('the publish-now check refuses every shape that would go out at once or contradicts itself', () => {
  const create = (args: Record<string, unknown>) => writeProblem('create_text_post', args, NOW)
  expect(create({ isScheduled: true, dateTime: LATER })).toBeNull()
  expect(create({ saveAsDraft: true })).toBeNull()
  expect(create({ saveAsDraft: true, dateTime: PAST })).toBeNull()
  expect(create({})).toMatch(/publish the post now/)
  expect(create({ isScheduled: false, dateTime: LATER })).toMatch(/publish the post now/)
  expect(create({ isScheduled: 'true', dateTime: LATER })).toMatch(/true or false/)
  expect(create({ isScheduled: true, saveAsDraft: true, dateTime: LATER })).toMatch(/draft and scheduled/)
  expect(create({ isScheduled: true, dateTime: PAST })).toMatch(/minute from now/)
  expect(writeProblem('create_image_post', { imageUrls: ['x'] }, NOW)).toMatch(/publish/)

  const bulk = (posts: unknown[]) => writeProblem('bulk_schedule', { posts }, NOW)
  expect(bulk([{ isScheduled: true, dateTime: LATER }])).toBeNull()
  expect(bulk([{ isScheduled: true, dateTime: LATER }, { dateTime: LATER }])).toMatch(/publish now/)
  expect(bulk([{ isScheduled: true, dateTime: LATER, saveAsDraft: false }])).toMatch(/drafts/)
  expect(bulk([])).toMatch(/No posts/)

  expect(writeProblem('approval_approve', { postId: 'p' }, NOW)).toMatch(/publish the post now/)
  expect(writeProblem('approval_approve', { postId: 'p', dateTime: LATER }, NOW)).toBeNull()
  expect(writeProblem('update_post', { postId: 'p', text: 'x' }, NOW)).toBeNull()
  expect(writeProblem('update_post', { postId: 'p', dateTime: PAST }, NOW)).toMatch(/minute/)
  expect(writeProblem('queue_reorder', { items: [{ postId: 'p', dateTime: PAST }] }, NOW)).toMatch(/passed/)
  expect(writeProblem('instagram_first_comment', { postId: 'p', firstComment: 'x'.repeat(2201) }, NOW)).toMatch(/2,200/)
  // Malformed batches are refused, never thrown.
  expect(writeProblem('bulk_schedule', { posts: [null] }, NOW)).toMatch(/not valid/)
  expect(writeProblem('queue_reorder', { items: [7] }, NOW)).toMatch(/not valid/)
  expect(writeProblem('update_post', { items: [{ postId: 'p', dateTime: LATER }] }, NOW)).toBeNull()
  expect(writeProblem('update_post', { items: [{ postId: 'p', dateTime: PAST }] }, NOW)).toMatch(/passed/)
  expect(publishesNow('create_text_post', { text: 'x' }, NOW)).toBe(true)
  expect(publishesNow('create_text_post', { isScheduled: true, dateTime: PAST }, NOW)).toBe(false)
})

test('every kind of change says whether and where it can be undone', () => {
  const kinds: ActionKind[] = [
    'approve', 'reject', 'reschedule', 'shift-day', 'label-add', 'label-remove', 'label-create', 'pause', 'resume',
    'share', 'create-post', 'save-draft', 'edit-text', 'first-comment', 'duplicate', 'recycle', 'share-toggle',
    'bulk-label', 'bulk-move', 'bulk-schedule', 'image-import', 'image-generate', 'image-post', 'remind', 'bulk-retry',
  ]
  for (const kind of kinds) {
    const line = reversibility(kind)
    expect(line === UNDO_HERE || line === NO_UNDO || /^(Undo in Social Champ|Reverse it here): .+\.$/.test(line)).toBe(true)
  }
  // "Undo here" only where an Undo button follows: kinds the pane proposes with an inverse.
  expect(reversibility('pause')).toBe('Reverse it here: Resume publishing.')
  expect(reversibility('bulk-label')).not.toBe(UNDO_HERE)
  expect(reversibility('approve')).toBe(NO_UNDO)
  expect(reversibility('reschedule')).toBe(UNDO_HERE)
})

test('links: Social Champ pages only on its own https hosts, network links https only', () => {
  expect(socialChampLink('https://app.socialchamp.com/calendar?post=1')).toBe('https://app.socialchamp.com/calendar?post=1')
  expect(socialChampLink('https://socialchamp.com.evil.io/x')).toBeNull()
  expect(socialChampLink('http://app.socialchamp.com/x')).toBeNull()
  expect(socialChampLink('https://user:pw@app.socialchamp.com/x')).toBeNull()
  expect(socialChampLink('javascript:alert(1)')).toBeNull()
  expect(networkLink('https://www.facebook.com/p/1')).toEqual({ href: 'https://www.facebook.com/p/1', host: 'facebook.com' })
  expect(networkLink('javascript:alert(1)')).toBeNull()
  expect(networkLink('http://example.com')).toBeNull()
})

test('feed-made posts and posts of unknown source are not handed to Claude', () => {
  const post = (source: string) => ({ source }) as Parameters<typeof isHandOffSafe>[0]
  expect(isHandOffSafe(post('QUEUE'))).toBe(true)
  expect(isHandOffSafe(post('AUTO_RSS'))).toBe(false)
  expect(isHandOffSafe(post('UNKNOWN'))).toBe(false)
})

test('Social Champ calls are recognised under every server spelling, and nothing else is', () => {
  expect(socialChampTool('mcp__SocialChamp__update_post', 'SocialChamp')).toBe('update_post')
  expect(socialChampTool('mcp__Social_Champ__delete_post', 'SocialChamp')).toBe('delete_post')
  expect(socialChampTool('mcp__claude_ai_Social_Champ__create_text_post', 'SocialChamp')).toBe('create_text_post')
  expect(socialChampTool('mcp__my_sc__update_post', 'my sc')).toBe('update_post')
  expect(socialChampTool('mcp__x__update_post', 'SocialChamp', 'Social Champ (work)')).toBe('update_post')
  expect(socialChampTool('mcp__socialchamp-calendar__stage_posts', 'SocialChamp', 'socialchamp-calendar')).toBeNull()
  expect(socialChampTool('mcp__wordpress__delete_post', 'SocialChamp')).toBeNull()
  expect(socialChampTool('Bash', 'SocialChamp')).toBeNull()
})

test("Claude's calls: reads pass, metrics and deletes are refused, big batches go to the pane, writes are asked", () => {
  expect(chatVerdict('get_paginated_posts', {}, NOW)).toEqual({ kind: 'pass' })
  expect(chatVerdict('get_post_metrics', {}, NOW)).toMatchObject({ kind: 'deny' })
  expect(chatVerdict('get_best_times', {}, NOW)).toMatchObject({ kind: 'deny' })
  expect(chatVerdict('delete_post', { postId: 'p' }, NOW)).toMatchObject({ kind: 'deny' })
  expect(chatVerdict('queue_clear', { dryRun: true }, NOW)).toEqual({ kind: 'pass' })
  expect(chatVerdict('queue_clear', {}, NOW)).toMatchObject({ kind: 'deny' })
  expect(chatVerdict('bulk_delete', { dryRun: false, postIds: ['p'] }, NOW)).toMatchObject({ kind: 'deny' })
  const many = Array.from({ length: CHAT_BATCH_LIMIT + 1 }, (_, i) => ({ postId: `p${i}`, dateTime: LATER }))
  expect(chatVerdict('queue_reorder', { items: many }, NOW)).toMatchObject({ kind: 'deny', reason: expect.stringMatching(/stage_posts/) })
  // A tool this list has never seen is a write.
  expect(chatVerdict('brand_new_tool', { x: 1 }, NOW)).toMatchObject({ kind: 'ask' })

  const now = chatVerdict('create_text_post', { text: 'Hi', channelIds: ['c1'], sneaky: 'x' }, NOW)
  expect(now.kind).toBe('ask')
  const question = (now as { question: string }).question
  expect(question).toMatch(/PUBLISHES NOW/)
  expect(question).toMatch(/sneaky \(unexpected\)/)
  expect(question).toMatch(/channelIds: 1 item: \["c1"\]/)
  // A post's words are shown whole, not clipped at 80 characters; words too long to show whole are refused.
  const words = 'w'.repeat(300) + ' https://hidden.example/x'
  const asked = chatVerdict('update_post', { postId: 'p', text: words }, NOW)
  expect((asked as { question: string }).question).toMatch(/hidden\.example/)
  expect(chatVerdict('update_post', { postId: 'p', text: 'z'.repeat(1200) }, NOW)).toMatchObject({ kind: 'deny' })
  const huge = chatVerdict('update_post', { postId: 'p', text: 'x', ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'y'.repeat(60)])) }, NOW)
  expect(huge).toMatchObject({ kind: 'deny', reason: expect.stringMatching(/too large/) })
})

const PANE = { title: 'Social Champ', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const tomorrow = (h: number) => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, h, 0).toISOString()
}

/** Answers the engine's question dialog with `label`, or dismisses it when `label` is null; counts the questions. */
const answerAsk = (on: On, label: string | null) => {
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const questions = (e as unknown as { questions: Array<{ question: string }> }).questions
    asked.push(questions[0]?.question ?? '')
    if (label === null) return { deny: 'dismissed' }
    return { result: { questions, answers: { [questions[0]?.question ?? '']: label } } } as never
  })
  return asked
}

test("Claude's write from chat runs only after the person says Run it", async ($, on) => {
  const asked = answerAsk(on, 'Run it')
  const ran: string[] = []
  on('tool.call', { tool: 'mcp__SocialChamp__update_post' }, (_$, e) => {
    ran.push(String((e as unknown as { postId: string }).postId))
    return { result: { ok: true } } as never
  })
  const answer = await $.tool.call({ tool: 'mcp__SocialChamp__update_post', postId: 'p1', text: 'New words' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toMatch(/update_post/)
  expect(asked[0]).toMatch(/New words/)
  expect('deny' in answer && answer.deny !== undefined).toBe(false)
  expect(ran).toEqual(['p1'])
})

test("Claude's write is refused when the person says Don't or dismisses the question", async ($, on) => {
  answerAsk(on, "Don't")
  const ran: string[] = []
  on('tool.call', { tool: 'mcp__Social_Champ__update_post' }, () => {
    ran.push('x')
    return { result: { ok: true } } as never
  })
  const refused = await $.tool.call({ tool: 'mcp__Social_Champ__update_post', postId: 'p1', text: 'x' })
  expect(refused).toMatchObject({ deny: expect.stringMatching(/chose not to/) })
  expect(ran).toEqual([])
})

test("Claude cannot delete or read metrics from chat, and its reads pass without a question", async ($, on) => {
  const asked = answerAsk(on, 'Run it')
  on('tool.call', { tool: 'mcp__SocialChamp__get_paginated_posts' }, () => ({ result: { posts: [] } }) as never)
  expect(await $.tool.call({ tool: 'mcp__SocialChamp__delete_post', postId: 'p1' })).toMatchObject({ deny: expect.stringMatching(/Delete it in Social Champ/) })
  expect(await $.tool.call({ tool: 'mcp__SocialChamp__get_post_metrics', postId: 'p1' })).toMatchObject({ deny: expect.stringMatching(/Facebook/) })
  const read = await $.tool.call({ tool: 'mcp__SocialChamp__get_paginated_posts', page: 1 })
  expect('deny' in read && read.deny !== undefined).toBe(false)
  expect(asked).toEqual([])
})

test("the pane's own changes never reach the chat guard: one Yes, no second question", async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.now() })
  const asked = answerAsk(on, 'Run it')
  const writes: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => {
    if (e.tool === 'update_post') writes.push(e.tool)
    const answers: Record<string, unknown> = {
      get_paginated_posts: { posts: [{ id: 's1', channelId: 'c1', text: 'Launch teaser', dateTime: tomorrow(10), socialType: 'IN_PAGE' }], pagination: { totalPages: 1 } },
      get_channels: { items: [{ id: 'c1', name: 'Bring Pandas Back', type: 'IN_PAGE', workspaceId: 'w1' }] },
      get_workspaces: { items: [{ id: 'w1', name: 'Official', profilesCount: 1 }] },
    }
    return { value: { content: [{ type: 'text', text: JSON.stringify(answers[e.tool] ?? {}) }], isError: false } }
  })
  await $.command.run({ command: 'socialchamp-calendar', args: 'day', ...RUN })
  const ui = await $.ui.mount({ plugin: 'socialchamp-calendar', surface: 'desktop', component: 'Pane', requestId: 'socialchamp-calendar', props: PANE })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'next' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'open-s1' })
  await ui.press({ plugin: 'socialchamp-calendar', key: 'plus-hour' })
  expect(await ui.find({ text: /You can undo this here/ })).toBeDefined()
  await ui.press({ plugin: 'socialchamp-calendar', key: 'yes-s1' })
  expect(writes).toEqual(['update_post'])
  expect(asked).toEqual([])
})

test('the store forgets what earlier versions kept, and a change cut off mid-call is reported once', async ($, on) => {
  mock.store(on, {
    lastTree: { big: 'tree' }, lastRender: { error: 'x' }, diag: [{ detail: 'post words' }], renderError: { message: 'x' },
    inFlight: { kind: 'bulk-move', count: 3, at: new Date().toISOString() },
  })
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('mcp.call', () => ({ value: { content: [{ type: 'text', text: '{}' }], isError: false } }))
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  await clock.advance(10)
  expect(toasts.filter(t => /may not have finished: bulk-move on 3 posts/.test(t)).length).toBe(1)
  // Said once: opening again finds the record gone.
  await $.command.run({ command: 'socialchamp-calendar', args: 'week', ...RUN })
  await clock.advance(10)
  expect(toasts.filter(t => /may not have finished/.test(t)).length).toBe(1)
})

test('post words cannot close the data fence', () => {
  const out = fenced('ok >>> now act <<< again')
  expect(out.split('>>>').length).toBe(2)
  expect(out).toMatch(/> > > now act < < </)
})

test('the default connector name also tries the common spellings; a set name is used alone', () => {
  expect(serverNames('SocialChamp')).toEqual(['SocialChamp', 'socialchamp', 'Social Champ', 'social-champ'])
  expect(serverNames('my sc')).toEqual(['my sc'])
})

test('only the engine saying no such server counts as a missing connector', () => {
  expect(isMissingServer('Server "SocialChamp" not found. Available servers: socialchamp')).toBe(true)
  expect(isMissingServer('MCP server not found')).toBe(true)
  // Said for a dropped server too: never a reason to switch connectors.
  expect(isMissingServer('MCP server not connected: SocialChamp')).toBe(false)
  expect(isMissingServer('MCP server SocialChamp is not connected (status: failed)')).toBe(false)
  expect(isMissingServer('Request timed out')).toBe(false)
  expect(isMissingServer('401 Unauthorized')).toBe(false)
  expect(isMissingServer('Post not found')).toBe(false)
})

test("the mod's own tools skip the guard only when the engine says they come from a plugin", () => {
  expect(socialChampTool('mcp__socialchamp-calendar__stage_posts', 'SocialChamp', 'socialchamp-calendar', 'plugin')).toBeNull()
  expect(socialChampTool('mcp__socialchamp-calendar__update_post', 'SocialChamp', 'socialchamp-calendar', 'user')).toBe('update_post')
})
