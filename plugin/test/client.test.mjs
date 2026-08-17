import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClientModule, makeCtx } from './_client-loader.mjs'

test('client bundle registers via window.__ModuleLoader__.load', async () => {
  const mod = await loadClientModule()
  assert.equal(typeof mod.apply, 'function', 'apply must be exported')
  assert.deepEqual(mod.inject, ['slots', 'locale'], 'inject must list slots+locale')
  assert.equal(typeof mod.buildInvocationBlock, 'function', 'buildInvocationBlock must be exported')
})

test('apply() registers the Settings tab and the composer entry', async () => {
  const mod = await loadClientModule()
  const { ctx, registerCalls } = makeCtx()
  await mod.apply(ctx)
  const names = registerCalls.map((c) => c.options.name)
  assert.ok(names.includes('settings.plugins.tab'), 'Settings tab must be registered')
  assert.ok(names.includes('composer.toolbar'), 'composer entry must be registered')
})

test('apply() never throws on the happy path', async () => {
  const mod = await loadClientModule()
  const { ctx } = makeCtx()
  assert.doesNotThrow(() => mod.apply(ctx))
})

test('composer degrades silently when its slot is undeclared (throw swallowed)', async () => {
  const mod = await loadClientModule()
  // DSH throws when registering into an undeclared slot — our double-guard must
  // swallow it and still register the Settings tab.
  const { ctx, registerCalls } = makeCtx({ throwSlot: 'composer.toolbar' })
  assert.doesNotThrow(() => mod.apply(ctx))
  const names = registerCalls.map((c) => c.options.name)
  assert.ok(names.includes('settings.plugins.tab'), 'Settings tab still registered')
  assert.ok(names.includes('composer.toolbar'), 'composer registration was attempted')
})

test('apply() degrades when the slots service is absent', async () => {
  const mod = await loadClientModule()
  const { ctx, registerCalls } = makeCtx({ withSlots: false })
  assert.doesNotThrow(() => mod.apply(ctx))
  assert.equal(registerCalls.length, 0, 'nothing registered without slots')
})

test('apply() degrades when locale is absent', async () => {
  const mod = await loadClientModule()
  const { ctx, registerCalls } = makeCtx({ withLocale: false })
  assert.doesNotThrow(() => mod.apply(ctx))
  const names = registerCalls.map((c) => c.options.name)
  assert.ok(names.includes('settings.plugins.tab'), 'Settings tab still registered')
})

test('apply() survives a missing react (react resolved lazily, never crashes)', async () => {
  // Simulate the loader being unable to provide react.
  const reactStub = {
    createElement: () => ({}),
    useState: () => [null, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
  }
  const mod = await loadClientModule(reactStub)
  const { ctx, registerCalls } = makeCtx()
  assert.doesNotThrow(() => mod.apply(ctx))
  const names = registerCalls.map((c) => c.options.name)
  assert.ok(names.includes('settings.plugins.tab'), 'Settings tab still registered without react')
})
