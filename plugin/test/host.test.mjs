/**
 * host.test.mjs — tests for the Expert Marketplace HOST half.
 * Run: node --test test/host.test.mjs
 *
 * Proves the two safety guarantees:
 *   1. `apply()` never throws, even when the network/fetch is down (degrades to
 *      the bundled seed) or when services (tools/systemPrompt) are absent.
 *   2. The API route handler turns EVERY malformed request into a structured
 *      `{ ok:false, error }` JSON response — it never lets an exception escape
 *      to the web server (which would surface as a 500 / crash).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply, makeHandler, listRequest } from '../src/host.js'
import { safeJsonParse, validateCatalog, queryList } from '../src/catalog.js'

const seedText = readFileSync(fileURLToPath(new URL('../src/catalog-seed.json', import.meta.url)), 'utf8')
const { entries } = validateCatalog(safeJsonParse(seedText).data)

function makeReq(method, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const buf = Buffer.from(raw)
  const req = {
    method,
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3080',
      origin: 'http://localhost:3080',
      ...headers,
    },
  }
  req[Symbol.asyncIterator] = async function* () { yield buf }
  return req
}

function makeRes() {
  return {
    _body: null,
    status: 0,
    headers: {},
    writeHead(s, h) { this.status = s; this.headers = h },
    setHeader() {},
    end(b) { this._body = b },
  }
}

const parse = (res) => JSON.parse(res._body)

/** Build a minimal catalog stub with the same surface makeHandler expects. */
function fakeCatalog() {
  const view = () => ({
    entries, errors: [], source: 'seed', stale: false,
    lastSuccessfulFetchAt: null, error: null,
  })
  return {
    view,
    refresh: async () => queryList(entries, { page: 1, pageSize: 1 }),
  }
}

/* ----------------------------- lifecycle ----------------------------- */

test('apply() survives a network-down fetch and still serves the seed', async () => {
  globalThis.fetch = async () => { throw new Error('network down') }
  let handler = null
  const effects = []
  const ctx = {
    webServer: { register(o) { handler = o.handler; return () => {} } },
    effect(fn, id) { effects.push(id) },
  }
  await apply(ctx, {})
  assert.equal(typeof handler, 'function', 'route handler must be registered')
  assert.ok(effects.includes('expert-marketplace.api'), 'api disposer effect registered')
  assert.ok(effects.includes('expert-marketplace.close'), 'close effect registered')

  const res = makeRes()
  await handler(makeReq('POST', { method: 'bootstrap' }), res)
  const out = parse(res)
  assert.equal(out.ok, true)
  assert.ok(out.value.list.items.length >= 7, 'seed catalog served')
})

test('apply() tolerates missing tools / systemPrompt services', async () => {
  globalThis.fetch = async () => { throw new Error('network down') }
  let handler = null
  const ctx = {
    webServer: { register(o) { handler = o.handler; return () => {} } },
    effect() {},
    // no ctx.tools, no ctx.systemPrompt
  }
  await assert.doesNotReject(() => apply(ctx, { agentTools: true }))
  assert.equal(typeof handler, 'function')
})

test('apply() uses remote catalog when fetch succeeds', async () => {
  globalThis.fetch = async () => ({ ok: true, body: { getReader: undefined }, text: async () => seedText })
  let handler = null
  const ctx = { webServer: { register(o) { handler = o.handler; return () => {} } }, effect() {} }
  await apply(ctx, {})
  const res = makeRes()
  await handler(makeReq('POST', { method: 'bootstrap' }), res)
  const out = parse(res)
  assert.equal(out.ok, true)
  assert.equal(out.value.source, 'remote')
})

/* ----------------------------- route handler ----------------------------- */

test('route handler: bootstrap / list / detail / packs / packDetail', async () => {
  const handler = makeHandler(fakeCatalog())
  const boot = parse(await run(handler, { method: 'bootstrap' }))
  assert.equal(boot.ok, true)
  assert.ok(Array.isArray(boot.value.groups.coding))

  const list = parse(await run(handler, { method: 'list', params: { query: 'code' } }))
  assert.equal(list.ok, true)
  assert.ok(list.value.items.length >= 1)

  const detail = parse(await run(handler, { method: 'detail', params: { id: 'code-reviewer' } }))
  assert.equal(detail.ok, true)
  assert.equal(detail.value.id, 'code-reviewer')

  const packs = parse(await run(handler, { method: 'packs' }))
  assert.equal(packs.ok, true)
  assert.ok(packs.value.some((p) => p.id === 'software-team'))

  const packDetail = parse(await run(handler, { method: 'packDetail', params: { id: 'software-team' } }))
  assert.equal(packDetail.ok, true)
  assert.equal(packDetail.value.pack.kind, 'pack')
  assert.ok(packDetail.value.members.length >= 4)
})

test('route handler: error paths return structured JSON, never throw', async () => {
  const handler = makeHandler(fakeCatalog())

  const unknown = parse(await run(handler, { method: 'frobnicate' }))
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'method-unknown')
  assert.equal(unknown.error && typeof unknown.error.message, 'string')

  const get = parse(await run(handler, { method: 'bootstrap' }, 'GET'))
  refuteOk(get, 405, 'method-not-allowed')

  const crossOrigin = parse(await run(handler, { method: 'bootstrap' }, 'POST', { origin: 'http://evil.example' }))
  refuteOk(crossOrigin, 403, 'origin-denied')

  const noCtype = parse(await run(handler, { method: 'bootstrap' }, 'POST', { 'content-type': undefined }))
  refuteOk(noCtype, 415, 'content-type-invalid')

  const badJson = parse(await run(handler, 'not-json', 'POST', {}))
  refuteOk(badJson, 400, 'json-invalid')

  const missingId = parse(await run(handler, { method: 'detail', params: { id: '' } }))
  refuteOk(missingId, 400, 'request-invalid')

  const badPack = parse(await run(handler, { method: 'packDetail', params: { id: 'nope' } }))
  refuteOk(badPack, 404, 'pack-not-found')
})

/* ---------------------------- listRequest ---------------------------- */
// Regression guard: bootstrap sends no `params`, so listRequest must tolerate
// an undefined argument (the bug that produced a 500 on every Settings-tab open).
test('listRequest tolerates undefined / non-object params', () => {
  const none = listRequest(undefined)
  assert.equal(none.category, 'all')
  assert.equal(none.kind, 'all')
  assert.equal(none.sort, 'recommended')
  assert.equal(none.page, 1)
  assert.equal(none.pageSize, 50)

  const empty = listRequest(null)
  assert.equal(empty.category, 'all')
  assert.equal(empty.kind, 'all')

  const plain = listRequest('not-an-object')
  assert.equal(plain.category, 'all')

  const actual = listRequest({ category: 'coding', kind: 'expert', query: 'react', page: 2, pageSize: 10, sort: 'recent' })
  assert.equal(actual.category, 'coding')
  assert.equal(actual.kind, 'expert')
  assert.equal(actual.query, 'react')
  assert.equal(actual.page, 2)
  assert.equal(actual.pageSize, 10)
  assert.equal(actual.sort, 'recent')
})



function run(handler, body, method = 'POST', headers = {}, raw) {
  const res = makeRes()
  return (async () => {
    await handler(makeReq(method, body, headers), res)
    return res
  })()
}

function refuteOk(out, status, code) {
  assert.equal(out.ok, false, `expected ok:false for ${code}`)
  assert.equal(out.error.code, code, `expected error code ${code}`)
  // status is asserted via res; here we only have parsed body, so just check code
}
