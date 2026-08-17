/**
 * catalog-client.js — browser-side same-origin API client for the Expert
 * Marketplace host route. Kept tiny and defensive: every call rejects on
 * transport failure (so the UI can show a message), but never crashes the
 * host. Runs only in the browser half.
 */

async function apiCall(method, params) {
  const response = await fetch('/api/expert-marketplace', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, ...(params === undefined ? {} : { params }) }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result || !result.ok) {
    const message = result && result.error ? result.error.message : `HTTP ${String(response.status)}`
    throw new Error(message)
  }
  return result.value
}

export function bootstrap() {
  return apiCall('bootstrap')
}

export function listExperts(opts) {
  return apiCall('list', opts)
}

export function getGroups() {
  return apiCall('groups')
}

export function getDetail(id) {
  return apiCall('detail', { id })
}

export function getPacks() {
  return apiCall('packs')
}

export function getPackDetail(id) {
  return apiCall('packDetail', { id })
}

export function refresh(currentDigest) {
  return apiCall('refresh', { currentDigest })
}

/**
 * Build the human-facing "invocation block" for an expert/pack. This is what
 * gets copied into the chat input so the user can enable the expert without a
 * fragile composer API. Safe against missing fields.
 */
export function buildInvocationBlock(entry) {
  try {
    if (!entry) return ''
    const lines = []
    lines.push(`@expert ${entry.id}`)
    lines.push(`# ${entry.name}`)
    if (entry.summary) lines.push(entry.summary)
    if (entry.dsh_integration && entry.dsh_integration.entry) {
      lines.push(`触发方式：${entry.dsh_integration.entry}`)
    }
    if (entry.kind === 'pack') {
      const members = (entry.dsh_integration && entry.dsh_integration.members) || []
      if (members.length) lines.push(`专家团成员：${members.join(', ')}`)
      if (entry.dsh_integration && entry.dsh_integration.orchestration) {
        lines.push(`协作方式：${entry.dsh_integration.orchestration}`)
      }
    }
    return lines.join('\n')
  } catch {
    // Any malformed/partial entry degrades to an empty block rather than
    // throwing inside a user click handler.
    return ''
  }
}
