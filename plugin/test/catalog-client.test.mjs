import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClientModule } from './_client-loader.mjs'

// buildInvocationBlock is now defined inside the client bundle (client.js), so
// we load it through the same ModuleLoader contract the Web UI uses.
let buildInvocationBlock
let mod
test('setup: load client bundle', async () => {
  mod = await loadClientModule()
  buildInvocationBlock = mod.buildInvocationBlock
  assert.equal(typeof buildInvocationBlock, 'function')
})

test('plain expert → @expert + name + summary + entry', () => {
  const entry = {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    summary: 'Reviews code for bugs.',
    kind: 'expert',
    dsh_integration: { type: 'prompt', entry: '@code-reviewer' },
  }
  const block = buildInvocationBlock(entry)
  assert.ok(block.includes('@expert code-reviewer'))
  assert.ok(block.includes('# Code Reviewer'))
  assert.ok(block.includes('Reviews code for bugs.'))
  assert.ok(block.includes('@code-reviewer'))
})

test('pack → includes members and orchestration', () => {
  const entry = {
    id: 'software-team',
    name: 'Software Team',
    summary: 'A product team.',
    kind: 'pack',
    dsh_integration: {
      type: 'prompt',
      entry: '@software-team',
      members: ['pm', 'architect', 'engineer', 'qa'],
      orchestration: 'pm plans, engineer builds',
    },
  }
  const block = buildInvocationBlock(entry)
  assert.ok(block.includes('@expert software-team'))
  assert.ok(block.includes('pm, architect, engineer, qa'))
  assert.ok(block.includes('pm plans, engineer builds'))
})

test('graceful against missing fields', () => {
  assert.equal(buildInvocationBlock(null), '')
  assert.equal(buildInvocationBlock(undefined), '')
  assert.equal(buildInvocationBlock({}), '@expert undefined\n# undefined')
})

test('never throws on a malformed proxy entry', () => {
  const evil = {
    get id() { throw new Error('boom') },
    name: 'trap',
  }
  assert.doesNotThrow(() => buildInvocationBlock(evil))
  assert.equal(buildInvocationBlock(evil), '')
})
