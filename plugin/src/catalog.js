/**
 * catalog.js — pure, dependency-free catalog model for the Expert Marketplace.
 *
 * This module intentionally has ZERO imports from DSH or any external package
 * so it can be unit-tested in plain Node and reused by both the host half and
 * the (browser) client half. Every function is defensive: it never throws on
 * malformed input — it returns a safe structure and records problems in an
 * `errors` array instead. That Guarantee is what keeps the plugin from
 * crashing the host process when the upstream catalog is broken.
 */

export const CATEGORIES = [
  'coding', 'writing', 'design', 'data', 'devops',
  'legal', 'education', 'multimodal', 'general', 'team', 'uncategorized',
]

export const KINDS = ['expert', 'pack']

const VALID_CATEGORY = new Set(CATEGORIES)
const VALID_KIND = new Set(KINDS)

/** Coerce an unknown value into a finite, non-negative integer with a fallback. */
function toInt(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** Normalize the bundle config with safe defaults. Never throws. */
export function normalizeConfig(config) {
  const c = config && typeof config === 'object' ? config : {}
  const catalogUrl = typeof c.catalogUrl === 'string' && c.catalogUrl.length > 0
    ? c.catalogUrl
    : 'https://raw.githubusercontent.com/fuchao2pku/awesome-dsh-experts/main/catalog.json'
  let composerSlot = typeof c.composerSlot === 'string' ? c.composerSlot : 'composer.toolbar'
  // Empty string disables the composer integration explicitly.
  if (composerSlot === '') composerSlot = ''
  return {
    catalogUrl,
    maxAgeMs: toInt(c.maxAgeMs, 48 * 60 * 60 * 1000),
    timeoutMs: toInt(c.timeoutMs, 15000),
    maxBytes: toInt(c.maxBytes, 5_000_000),
    composerSlot,
    composerIntegration: c.composerIntegration !== false,
    agentTools: c.agentTools !== false,
  }
}

/** Parse JSON text without throwing. Returns { ok, data, error }. */
export function safeJsonParse(text) {
  if (typeof text !== 'string') return { ok: false, data: null, error: 'input is not a string' }
  try {
    return { ok: true, data: JSON.parse(text), error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : 'invalid JSON' }
  }
}

/** True when value is a non-empty string. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Flatten a raw catalog object (the shape produced by awesome-dsh-experts'
 * scan.mjs) into a flat, validated `entries` array. Invalid entries are
 * skipped and reported in `errors`. Never throws.
 */
export function validateCatalog(raw) {
  const errors = []
  if (raw === null || typeof raw !== 'object') {
    return { entries: [], errors: [{ code: 'catalog-empty', message: 'catalog is not an object' }] }
  }
  const categories = raw.categories
  const sourceEntries = []
  if (categories && typeof categories === 'object') {
    for (const key of Object.keys(categories)) {
      const bucket = categories[key]
      if (Array.isArray(bucket)) sourceEntries.push(...bucket)
    }
  } else if (Array.isArray(raw.entries)) {
    sourceEntries.push(...raw.entries)
  }

  const entries = []
  for (const item of sourceEntries) {
    if (!item || typeof item !== 'object') {
      errors.push({ code: 'entry-invalid', message: 'skipped a non-object entry' })
      continue
    }
    const id = typeof item.id === 'string' ? item.id : ''
    if (!isNonEmptyString(id)) {
      errors.push({ code: 'entry-missing-id', message: 'skipped an entry without id' })
      continue
    }
    const kind = KINDS.includes(item.kind) ? item.kind : 'expert'
    const category = VALID_CATEGORY.has(item.category) ? item.category : 'uncategorized'
    const dsh = item.dsh_integration && typeof item.dsh_integration === 'object' ? item.dsh_integration : {}
    const entry = {
      id,
      name: isNonEmptyString(item.name) ? item.name : id,
      kind,
      summary: typeof item.summary === 'string' ? item.summary : '',
      description: typeof item.description === 'string' ? item.description : '',
      category,
      tags: Array.isArray(item.tags) ? item.tags.filter(isNonEmptyString) : [],
      author: typeof item.author === 'string' ? item.author : 'unknown',
      homepage: typeof item.homepage === 'string' ? item.homepage : '',
      license: typeof item.license === 'string' ? item.license : 'MIT',
      version: typeof item.version === 'string' ? item.version : '0.0.0',
      created: typeof item.created === 'string' ? item.created : '',
      updated: typeof item.updated === 'string' ? item.updated : '',
      path: typeof item.path === 'string' ? item.path : '',
      dsh_integration: {
        type: isNonEmptyString(dsh.type) ? dsh.type : 'prompt-only',
        profile: typeof dsh.profile === 'string' ? dsh.profile : '',
        entry: typeof dsh.entry === 'string' ? dsh.entry : '',
        notes: typeof dsh.notes === 'string' ? dsh.notes : '',
        members: Array.isArray(dsh.members) ? dsh.members.filter(isNonEmptyString) : [],
        orchestration: typeof dsh.orchestration === 'string' ? dsh.orchestration : '',
      },
    }
    // Duplicate id guard.
    if (entries.some((e) => e.id === id)) {
      errors.push({ code: 'entry-duplicate', message: `duplicate id "${id}" skipped` })
      continue
    }
    entries.push(entry)
  }
  return { entries, errors }
}

/** Stable digest of the entry set (used by refresh to detect changes). */
export function digestOf(entries) {
  try {
    const ids = entries.map((e) => e.id).sort().join(',')
    // Cheap, dependency-free hash (FNV-1a-ish) — good enough for change detection.
    let h = 0x811c9dc5
    for (let i = 0; i < ids.length; i++) {
      h ^= ids.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8)
  } catch {
    return '00000000'
  }
}

/** Case-insensitive substring match over the searchable fields. */
function matchesQuery(entry, query) {
  if (!query) return true
  const q = query.toLowerCase()
  const hay = [entry.id, entry.name, entry.summary, entry.description, entry.author, ...entry.tags]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

const SORTERS = {
  recommended: (a, b) => a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => (b.created || '').localeCompare(a.created || ''),
  category: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
}

/**
 * Query the flat entry list. Always returns a well-formed result object.
 * Never throws.
 */
export function queryList(entries, opts = {}) {
  const {
    query = '',
    category = 'all',
    kind = 'all',
    sort = 'recommended',
    page = 1,
    pageSize = 50,
  } = opts || {}

  let items = entries.slice()
  if (typeof category === 'string' && category !== 'all' && VALID_CATEGORY.has(category)) {
    items = items.filter((e) => e.category === category)
  }
  if (typeof kind === 'string' && kind !== 'all' && VALID_KIND.has(kind)) {
    items = items.filter((e) => e.kind === kind)
  }
  if (typeof query === 'string' && query.trim() !== '') {
    items = items.filter((e) => matchesQuery(e, query.trim()))
  }
  const sorter = SORTERS[sort] || SORTERS.recommended
  items.sort(sorter)

  const total = items.length
  const ps = toInt(pageSize, 50) > 0 ? toInt(pageSize, 50) : 50
  const p = toInt(page, 1) > 0 ? toInt(page, 1) : 1
  const start = (p - 1) * ps
  const pageItems = items.slice(start, start + ps)

  return {
    total,
    page: p,
    pageSize: ps,
    items: pageItems,
    digest: digestOf(items),
  }
}

/** Find a single entry by id. Returns null if absent. */
export function getEntry(entries, id) {
  if (!isNonEmptyString(id)) return null
  return entries.find((e) => e.id === id) || null
}

/** All expert groups (packs). */
export function listPacks(entries) {
  return entries.filter((e) => e.kind === 'pack')
}

/**
 * Resolve a pack together with its member entries. Members that are not found
 * in the catalog are still listed by id (so the UI can show "missing").
 */
export function getPack(entries, id) {
  const pack = getEntry(entries, id)
  if (pack === null || pack.kind !== 'pack') return null
  const memberIds = pack.dsh_integration.members || []
  const members = memberIds.map((mid) => {
    const found = getEntry(entries, mid)
    return found || { id: mid, name: mid, missing: true }
  })
  return { pack, members }
}

/** Group entries by category for the browse view. */
export function groupByCategory(entries) {
  const groups = {}
  for (const cat of CATEGORIES) groups[cat] = []
  for (const e of entries) {
    const key = VALID_CATEGORY.has(e.category) ? e.category : 'uncategorized'
    groups[key].push(e)
  }
  return groups
}
