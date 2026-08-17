/**
 * host.js — DSH Expert Marketplace, HOST half (runs in the Node process).
 *
 * Safety contract (mirrors dsh-plugin-marketplace, hardened for "never crash
 * on install"):
 *  - `apply()` swallows all errors internally; a broken catalog or missing
 *    service degrades the plugin but never takes down the host.
 *  - The API route handler wraps every request in try/catch and answers with a
 *    structured `{ ok:false, error }` JSON — it never lets an exception escape
 *    to the web server.
 *  - All DSH-only peer dependencies (@deepseek-ai/*) are imported lazily inside
 *    try/catch, so this module loads fine even when those packages are absent
 *    (e.g. in unit tests, or in a profile that does not provide them).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
} from './catalog.js'

const API_PATH = '/api/expert-marketplace'
const MAX_API_BODY_BYTES = 32 * 1024
const SEED = loadSeed()

export const name = 'expert-marketplace'
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Read the bundled seed catalog once at module load. Never throws. */
function loadSeed() {
  try {
    const url = new URL('./catalog-seed.json', import.meta.url)
    const text = readFileSync(fileURLToPath(url), 'utf8')
    const { data } = safeJsonParse(text)
    if (data) {
      const { entries, errors } = validateCatalog(data)
      return { entries, errors, source: 'seed' }
    }
  } catch {
    /* fall through to empty */
  }
  return { entries: [], errors: [], source: 'seed' }
}

/**
 * Catalog source: in-memory entries seeded from the bundle, refreshed from a
 * remote URL with timeout / size guards and a best-effort on-disk cache.
 * All network/cache failures are swallowed; the seed (or last good) wins.
 */
class CatalogSource {
  constructor(cfg) {
    this.cfg = cfg
    this.entries = SEED.entries
    this.errors = SEED.errors
    this.source = SEED.source
    this.stale = false
    this.lastSuccessfulFetchAt = null
    this.error = null
  }

  view() {
    return {
      entries: this.entries,
      errors: this.errors,
      source: this.source,
      stale: this.stale,
      lastSuccessfulFetchAt: this.lastSuccessfulFetchAt,
      error: this.error,
    }
  }

  async refresh() {
    const { catalogUrl, timeoutMs, maxBytes } = this.cfg
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let text = ''
      let bytes = 0
      const response = await fetch(catalogUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'application/json' },
      })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
      // Stream with a hard byte cap to avoid OOM on a bad endpoint.
      const reader = response.body?.getReader ? response.body.getReader() : null
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > maxBytes) throw new Error('catalog too large')
          text += new TextDecoder().decode(value, { stream: true })
        }
      } else {
        text = await response.text()
        if (text.length > maxBytes) throw new Error('catalog too large')
      }
      const { ok, data, error } = safeJsonParse(text)
      if (!ok || !data) throw new Error(error || 'catalog parse failed')
      const { entries, errors } = validateCatalog(data)
      if (entries.length === 0) throw new Error('catalog contained no usable entries')
      this.entries = entries
      this.errors = errors
      this.source = 'remote'
      this.stale = false
      this.error = null
      this.lastSuccessfulFetchAt = new Date().toISOString()
      this.persist(text)
    } catch (e) {
      // Keep the seed / last-good entries; mark stale and record the reason.
      this.stale = true
      this.error = e instanceof Error ? e.message : String(e)
    }
    return queryList(this.entries, { page: 1, pageSize: 1 })
  }

  /** Best-effort on-disk cache; never throws. */
  persist(text) {
    try {
      const dir = join(tmpdir(), 'dsh-expert-marketplace')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'catalog.json'), text, 'utf8')
    } catch {
      /* ignore cache failures */
    }
  }

  close() {
    /* nothing to release in this lightweight implementation */
  }
}

/* ----------------------------- API plumbing ----------------------------- */

class ApiFailure extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function readJson(req) {
  const ct = req.headers && req.headers['content-type']
  if (typeof ct !== 'string' || !ct.toLowerCase().startsWith('application/json')) {
    throw new ApiFailure(415, 'content-type-invalid', 'Expected application/json.')
  }
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buf.byteLength
    if (bytes > MAX_API_BODY_BYTES) throw new ApiFailure(413, 'request-too-large', 'Request too large.')
    chunks.push(buf)
  }
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiFailure(400, 'json-invalid', 'Body is not valid JSON.')
  }
  if (!isRecord(value)) throw new ApiFailure(400, 'request-invalid', 'Body must be an object.')
  return value
}

function verifySameOrigin(req) {
  const host = req.headers && req.headers.host
  const origin = req.headers && req.headers.origin
  let originUrl = null
  try {
    originUrl = origin === undefined ? null : new URL(origin)
  } catch {
    originUrl = null
  }
  if (host === undefined || originUrl === null
    || (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:')
    || originUrl.host !== host) {
    throw new ApiFailure(403, 'origin-denied', 'Expert Marketplace API accepts same-origin requests only.')
  }
}

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}\n`
  if (res.writeHead) {
    res.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'x-content-type-options': 'nosniff',
    })
  }
  res.end(body)
}

function str(v, max = 256) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function listRequest(v) {
  const r = isRecord(v) ? v : {}
  const category = str(r.category, 32) || 'all'
  const kind = str(r.kind, 16) || 'all'
  const sort = str(r.sort, 16) || 'recommended'
  const page = Number.isFinite(Number(r.page)) ? Number(r.page) : 1
  return {
    query: str(r.query, 256),
    category,
    kind,
    sort,
    page: page < 1 ? 1 : page,
    pageSize: Number.isFinite(Number(r.pageSize)) ? Number(r.pageSize) : 50,
  }
}

function idRequest(v) {
  const id = str(v && v.id, 128)
  if (id.length === 0) throw new ApiFailure(400, 'request-invalid', 'Missing id.')
  return id
}

/** Build the route handler bound to a catalog source. Pure-ish + defensive. */
export function makeHandler(catalog) {
  return async (req, res) => {
    try {
      if (req.method !== 'POST') {
        if (res.setHeader) res.setHeader('allow', 'POST')
        throw new ApiFailure(405, 'method-not-allowed', 'Use POST for the Expert Marketplace API.')
      }
      verifySameOrigin(req)
      const body = await readJson(req)
      const method = body.method
      const view = catalog.view()
      let value
      switch (method) {
        case 'bootstrap': {
          if (view.entries.length === 0) await catalog.refresh()
          value = {
            list: queryList(catalog.view().entries, listRequest(body.params)),
            groups: groupByCategory(catalog.view().entries),
            digest: digestOf(catalog.view().entries),
            source: catalog.view().source,
            stale: catalog.view().stale,
            error: catalog.view().error,
          }
          break
        }
        case 'list':
          value = queryList(catalog.view().entries, listRequest(body.params))
          break
        case 'detail':
          value = getEntry(catalog.view().entries, idRequest(body.params))
          break
        case 'groups':
          value = groupByCategory(catalog.view().entries)
          break
        case 'refresh': {
          const refreshed = await catalog.refresh()
          const currentDigest = str(body.params && body.params.currentDigest, 32)
          const changed = refreshed.digest !== currentDigest
          value = {
            changed,
            list: changed ? refreshed : null,
            source: catalog.view().source,
            stale: catalog.view().stale,
            lastSuccessfulFetchAt: catalog.view().lastSuccessfulFetchAt,
            error: catalog.view().error,
          }
          break
        }
        case 'packs':
          value = listPacks(catalog.view().entries)
          break
        case 'packDetail': {
          const pack = getPack(catalog.view().entries, idRequest(body.params))
          if (pack === null) throw new ApiFailure(404, 'pack-not-found', 'Expert group not found.')
          value = pack
          break
        }
        default:
          throw new ApiFailure(404, 'method-unknown', 'Unknown Expert Marketplace method.')
      }
      sendJson(res, 200, { ok: true, value })
    } catch (error) {
      const failure = error instanceof ApiFailure
        ? error
        : new ApiFailure(500, 'request-failed', 'The Expert Marketplace request could not be completed.')
      sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } })
    }
  }
}

/* --------------------------- Agent-facing tools --------------------------- */

async function registerAgentTools(ctx, catalog) {
  let defineTool = null
  try {
    const mod = await import('@deepseek-ai/dsh-tools')
    defineTool = mod && mod.defineTool
  } catch {
    defineTool = null
  }
  if (typeof defineTool !== 'function' || !ctx.tools || typeof ctx.tools.register !== 'function') {
    return // graceful skip — tools are an optional enhancement
  }

  ctx.tools.register(defineTool({
    name: 'expert_list',
    description: 'List experts and expert groups from the Awesome DSH Experts catalog. Read-only.',
    parameters: {
      query: { type: 'string', description: 'Optional free-text search over names, summaries, descriptions, authors, tags.' },
      category: { type: 'string', description: 'Optional category filter: coding | writing | design | data | devops | legal | education | multimodal | general | team | uncategorized | all.' },
      kind: { type: 'string', description: 'Optional: expert | pack | all.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          available: { type: 'boolean', required: true },
          total: { type: 'number' },
          items: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const a = args || {}
      const list = queryList(catalog.view().entries, {
        query: typeof a.query === 'string' ? a.query : '',
        category: typeof a.category === 'string' ? a.category : 'all',
        kind: typeof a.kind === 'string' ? a.kind : 'all',
        page: 1,
        pageSize: 20,
      })
      return {
        available: true,
        total: list.total,
        items: list.items.map((e) => ({
          id: e.id, name: e.name, kind: e.kind, category: e.category, summary: e.summary, author: e.author,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'expert_detail',
    description: 'Full details of one expert or expert group: role, instructions summary, DSH integration, and (for packs) member list. Read-only.',
    parameters: {
      id: { type: 'string', required: true, description: 'The expert id from expert_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          detail: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String((value && value.detail) || '') }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const id = typeof (args || {}).id === 'string' ? (args || {}).id : ''
      if (!id) return { found: false, detail: 'id is required.' }
      const entry = getEntry(catalog.view().entries, id)
      if (entry === null) return { found: false, detail: `No expert "${id}" in the catalog.` }
      if (entry.kind === 'pack') {
        const pack = getPack(catalog.view().entries, id)
        const members = (pack ? pack.members : []).map((m) => (m.missing ? `${m.id} (missing)` : m.name)).join(', ')
        return {
          found: true,
          detail: [
            `[Expert Group] ${entry.name} (${entry.id})`,
            entry.summary,
            `Author ${entry.author} · license ${entry.license} · ★category ${entry.category}`,
            `Integration: ${entry.dsh_integration.type}${entry.dsh_integration.entry ? ` · entry: ${entry.dsh_integration.entry}` : ''}`,
            `Members: ${members}`,
            entry.dsh_integration.orchestration ? `Orchestration: ${entry.dsh_integration.orchestration}` : '',
          ].filter(Boolean).join('\n'),
        }
      }
      return {
        found: true,
        detail: [
          `[Expert] ${entry.name} (${entry.id})`,
          entry.summary,
          entry.description,
          `Author ${entry.author} · license ${entry.license} · category ${entry.category}`,
          `Integration: ${entry.dsh_integration.type}${entry.dsh_integration.entry ? ` · entry: ${entry.dsh_integration.entry}` : ''}`,
          entry.dsh_integration.notes ? `Notes: ${entry.dsh_integration.notes}` : '',
        ].filter(Boolean).join('\n'),
      }
    },
  }))
}

/* ------------------------------- Lifecycle ------------------------------- */

export { listRequest }
export async function apply(ctx, config = {}) {
  const cfg = normalizeConfig(config)
  const catalog = new CatalogSource(cfg)

  // Best-effort eager load of the remote catalog (non-blocking for startup).
  try {
    await catalog.refresh()
  } catch {
    /* seed already in place */
  }

  try {
    if (ctx.webServer && typeof ctx.webServer.register === 'function') {
      const dispose = ctx.webServer.register({
        kind: 'exact',
        path: API_PATH,
        handler: makeHandler(catalog),
      })
      if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'expert-marketplace.api')
    }
  } catch {
    /* if routing is unavailable, the plugin simply offers no HTTP API */
  }

  try {
    if (cfg.agentTools && ctx.tools) {
      await registerAgentTools(ctx, catalog)
    }
  } catch {
    /* tools are optional */
  }

  try {
    if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
      ctx.systemPrompt.section({
        name: 'tool:expert-marketplace',
        order: 112,
        text: 'The expert_list and expert_detail tools expose the Awesome DSH Experts catalog (community experts and expert groups). Use them when the user asks for a DSH expert, role, or expert group. They are read-only.',
      })
    }
  } catch {
    /* system prompt section is optional */
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      try { catalog.close() } catch { /* ignore */ }
    }, 'expert-marketplace.close')
  }
}
