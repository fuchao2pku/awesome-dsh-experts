/**
 * catalog-client.test.mjs — tests for the browser-side catalog client.
 * Run: node --test test/catalog-client.test.mjs
 *
 * The client half is the riskiest (a throw here can break the Web UI), so we
 * prove that `buildInvocationBlock` — the text users copy into the chat input —
 * never throws on malformed or partial entries, and produces a sane block.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInvocationBlock } from '../src/client/catalog-client.js'

test('buildInvocationBlock returns empty string for nullish input', () => {
  assert.equal(buildInvocationBlock(null), '')
  assert.equal(buildInvocationBlock(undefined), '')
  assert.equal(buildInvocationBlock(0), '')
  assert.equal(buildInvocationBlock(''), '')
})

test('buildInvocationBlock builds a block for a normal expert', () => {
  const entry = {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    summary: 'Reviews pull requests for quality.',
    dsh_integration: { entry: 'dsh plugin --profile web add code-reviewer' },
  }
  const block = buildInvocationBlock(entry)
  assert.ok(block.includes('@expert code-reviewer'))
  assert.ok(block.includes('# Code Reviewer'))
  assert.ok(block.includes('Reviews pull requests for quality.'))
  assert.ok(block.includes('触发方式：dsh plugin --profile web add code-reviewer'))
})

test('buildInvocationBlock tolerates a missing dsh_integration object', () => {
  const entry = { id: 'x', name: 'X', summary: 's' }
  const block = buildInvocationBlock(entry)
  assert.ok(block.includes('@expert x'))
  assert.ok(!block.includes('触发方式'))
})

test('buildInvocationBlock renders pack members and orchestration', () => {
  const entry = {
    id: 'software-team',
    name: 'Software Team',
    summary: 'A full software team.',
    kind: 'pack',
    dsh_integration: {
      members: ['pm', 'architect', 'engineer'],
      orchestration: 'pm → architect → engineer',
    },
  }
  const block = buildInvocationBlock(entry)
  assert.ok(block.includes('专家团成员：pm, architect, engineer'))
  assert.ok(block.includes('协作方式：pm → architect → engineer'))
})

test('buildInvocationBlock handles a pack with no members and missing fields', () => {
  const entry = { id: 'empty-pack', name: 'Empty', kind: 'pack', dsh_integration: {} }
  const block = buildInvocationBlock(entry)
  assert.equal(typeof block, 'string')
  assert.ok(block.includes('@expert empty-pack'))
  assert.ok(!block.includes('专家团成员'))
})

test('buildInvocationBlock survives a completely broken entry', () => {
  // The nastiest real-world input: a proxy object with throwing getters.
  const evil = new Proxy({}, { get: () => { throw new Error('boom') } })
  let threw = false
  try {
    buildInvocationBlock(evil)
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'buildInvocationBlock must never throw on broken input')
})
