/**
 * client.test.mjs — tests for the Expert Marketplace CLIENT (browser) half.
 * Run: node --test test/client.test.mjs
 *
 * The browser half is the risky one: if `apply()` throws, the plugin fails to
 * mount in the Web UI. These tests prove:
 *   1. `apply()` never throws, with or without the composer (chat input) slot.
 *   2. The VERIFIED Settings tab (`settings.plugins.tab`) is always registered.
 *   3. If the composer slot is undeclared (register throws — Cordis behavior),
 *      the integration degrades silently and the Settings tab still works.
 *   4. Components are NOT imported in Node (no `react` resolution) — proving the
 *      browser-only import path keeps the module loadable for tests/CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/client.js'

function makeCtx({ registerThrowsFor } = {}) {
  const injectCalls = []
  const registerCalls = []
  const localeReg = []
  const effects = []
  const slots = {
    inject(slot, factory) {
      injectCalls.push({ slot, factory })
      // Simulate the framework invoking the factory lazily.
      return factory()
    },
    register(opts, component) {
      registerCalls.push({ opts, component })
      if (registerThrowsFor && registerThrowsFor(opts)) {
        throw new Error('undeclared slot') // Cordis throws on undeclared slot
      }
      return () => {}
    },
  }
  const ctx = {
    slots,
    locale: {
      register(ns, dict) { localeReg.push({ ns, dict }) },
      bind(ns) { return (k) => String(k) },
    },
    effect(fn, id) { effects.push(id) },
  }
  return { ctx, injectCalls, registerCalls, localeReg, effects }
}

test('apply() registers the Settings tab and never throws (happy path)', async () => {
  const { ctx, injectCalls, registerCalls, localeReg, effects } = makeCtx()
  await assert.doesNotReject(() => apply(ctx))

  assert.ok(injectCalls.some((c) => c.slot === 'settings.plugins.tab'), 'settings tab injected')
  assert.ok(injectCalls.some((c) => c.slot === 'composer.toolbar'), 'composer entry injected')

  const settingsReg = registerCalls.find((c) => c.opts.id === 'expert-marketplace')
  assert.ok(settingsReg, 'settings tab registered')
  assert.equal(typeof settingsReg.component, 'function', 'registered component is callable')

  const composerReg = registerCalls.find((c) => c.opts.id === 'expert-picker')
  assert.ok(composerReg, 'composer entry registered')

  assert.ok(localeReg.some((l) => l.ns === 'settings.expertMarketplace'), 'locale dictionaries registered')
  assert.ok(effects.includes('expert-marketplace.client'), 'client cleanup effect registered')
})

test('apply() degrades gracefully when the composer slot is undeclared', async () => {
  // Only the composer registration throws; the settings tab must survive.
  const { ctx, registerCalls } = makeCtx({
    registerThrowsFor: (opts) => opts.id === 'expert-picker',
  })
  await assert.doesNotReject(() => apply(ctx), 'apply must not throw when composer slot is missing')

  const settingsReg = registerCalls.find((c) => c.opts.id === 'expert-marketplace')
  assert.ok(settingsReg, 'settings tab still registered after composer failure')
  assert.equal(typeof settingsReg.component, 'function')
})

test('apply() degrades gracefully when slots service is entirely absent', async () => {
  const ctx = {
    locale: { register() {}, bind: () => (k) => String(k) },
    effect() {},
    // no ctx.slots at all
  }
  await assert.doesNotReject(() => apply(ctx), 'apply must not throw without slots service')
})

test('apply() degrades gracefully when locale service is absent', async () => {
  const ctx = {
    slots: {
      inject() { return undefined },
      register() { return () => {} },
    },
    effect() {},
    // no ctx.locale
  }
  await assert.doesNotReject(() => apply(ctx), 'apply must not throw without locale service')
})

test('apply() does not import react in a Node environment', async () => {
  // isBrowser() is false in Node, so the dynamic import of components.js (which
  // imports react) must never run. If it did, apply would throw "Cannot find
  // package react". Reaching this assertion proves the browser-only path holds.
  const { ctx } = makeCtx()
  await apply(ctx)
  assert.ok(true, 'apply completed without resolving react')
})
