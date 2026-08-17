/**
 * catalog.test.mjs — unit tests for the pure catalog model.
 * Run: node --test test/catalog.test.mjs
 * No external dependencies; proves the model never throws on bad input.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  normalizeConfig,
  safeJsonParse,
  validateCatalog,
  queryList,
  getEntry,
  listPacks,
  getPack,
  groupByCategory,
  digestOf,
} from '../src/catalog.js'

const seedText = readFileSync(fileURLToPath(new URL('../src/catalog-seed.json', import.meta.url)), 'utf8')

test('normalizeConfig fills safe defaults and tolerates garbage', () => {
  const c = normalizeConfig(undefined)
  assert.equal(typeof c.catalogUrl, 'string')
  assert.ok(c.maxAgeMs > 0)
  assert.equal(c.composerIntegration, true)
  assert.equal(c.agentTools, true)

  const c2 = normalizeConfig({ composerSlot: '', maxAgeMs: 'x', timeoutMs: -5 })
  assert.equal(c2.composerSlot, '', 'empty composerSlot disables integration')
  assert.equal(c2.maxAgeMs, 48 * 60 * 60 * 1000, 'invalid number falls back')
  assert.equal(c2.timeoutMs, 15000)
})

test('safeJsonParse never throws', () => {
  assert.equal(safeJsonParse('{bad').ok, false)
  assert.equal(safeJsonParse(42).ok, false)
  assert.equal(safeJsonParse('{"a":1}').ok, true)
})

test('validateCatalog on real seed yields entries and no crash', () => {
  const { ok, data } = safeJsonParse(seedText)
  assert.ok(ok)
  const { entries, errors } = validateCatalog(data)
  assert.ok(entries.length >= 7, `expected >=7 entries, got ${entries.length}`)
  assert.ok(Array.isArray(errors))
  // every entry has the required normalized fields
  for (const e of entries) {
    assert.equal(typeof e.id, 'string')
    assert.equal(typeof e.name, 'string')
    assert.ok(['expert', 'pack'].includes(e.kind))
    assert.equal(typeof e.dsh_integration, 'object')
  }
})

test('validateCatalog skips invalid / non-object / duplicate entries', () => {
  const raw = {
    categories: {
      coding: [
        { id: 'a', name: 'A', kind: 'expert', category: 'coding', author: 'x' },
        { id: 'b' }, // missing name/kind -> still ok (defaults), but has id
        'not-an-object',
        { name: 'no id', kind: 'expert' }, // missing id -> skipped
        { id: 'a', name: 'dup', kind: 'expert', category: 'coding' }, // duplicate -> skipped
      ],
    },
  }
  const { entries, errors } = validateCatalog(raw)
  const ids = entries.map((e) => e.id)
  assert.ok(ids.includes('a'))
  assert.ok(ids.includes('b'))
  assert.ok(!ids.includes(undefined))
  assert.equal(ids.filter((i) => i === 'a').length, 1, 'duplicate removed')
  assert.ok(errors.some((e) => e.code === 'entry-missing-id'))
})

test('validateCatalog on null / non-object input is safe', () => {
  assert.deepEqual(validateCatalog(null).entries, [])
  assert.deepEqual(validateCatalog('nope').entries, [])
  assert.deepEqual(validateCatalog(42).entries, [])
})

test('queryList filters, searches, paginates, and never throws', () => {
  const { entries } = validateCatalog(safeJsonParse(seedText).data)
  const all = queryList(entries, { page: 1, pageSize: 1000 })
  assert.equal(all.items.length, entries.length)

  const packs = queryList(entries, { kind: 'pack', pageSize: 1000 })
  assert.ok(packs.items.every((e) => e.kind === 'pack'))

  const search = queryList(entries, { query: 'code', pageSize: 1000 })
  assert.ok(search.items.length >= 1)

  const bad = queryList(entries, { page: -1, pageSize: 'x', category: 'nonsense', sort: 'weird' })
  assert.ok(Array.isArray(bad.items))
  assert.equal(bad.page, 1)
})

test('getEntry / listPacks / getPack resolve members safely', () => {
  const { entries } = validateCatalog(safeJsonParse(seedText).data)
  assert.equal(getEntry(entries, 'code-reviewer').id, 'code-reviewer')
  assert.equal(getEntry(entries, 'missing'), null)

  const packs = listPacks(entries)
  assert.ok(packs.length >= 1)
  const pack = getPack(entries, 'software-team')
  assert.ok(pack && pack.pack.kind === 'pack')
  assert.ok(Array.isArray(pack.members))
  assert.ok(pack.members.length >= 4, 'software-team has 4 members')
  // unknown pack id
  assert.equal(getPack(entries, 'nope'), null)
})

test('groupByCategory buckets entries and includes all categories', () => {
  const { entries } = validateCatalog(safeJsonParse(seedText).data)
  const groups = groupByCategory(entries)
  const total = Object.values(groups).reduce((n, arr) => n + arr.length, 0)
  assert.equal(total, entries.length)
  assert.ok('team' in groups && 'coding' in groups)
})

test('digestOf is stable and never throws', () => {
  const { entries } = validateCatalog(safeJsonParse(seedText).data)
  assert.equal(digestOf(entries), digestOf(entries.slice()))
  assert.equal(typeof digestOf([]), 'string')
  assert.equal(digestOf(null), '00000000')
})
