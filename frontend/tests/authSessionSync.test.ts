import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { computed, effectScope, ref, watch } from 'vue'
import { useAuth, type AuthUser } from '../app/composables/useAuth.ts'
import { useFavorites } from '../app/composables/useFavorites.ts'

const globals = globalThis as any
globals.computed = computed
globals.watch = watch
globals.useAuth = useAuth
globals.defineNuxtPlugin = (plugin: any) => plugin.setup
globals.defineNuxtRouteMiddleware = (middleware: unknown) => middleware
globals.navigateTo = (target: unknown) => target
const { default: observeSession } = await import('../app/plugins/auth-session.client.ts')
const { default: protectRoute } = await import('../app/middleware/auth.ts')
const flush = () => new Promise<void>(done => setImmediate(done))
const member = (id: number): AuthUser => ({ id, name: `Member ${id}`, email: `member-${id}@example.invalid`, role: 'user',
  paid_content_access: true, favorite_questions: [{ id, exam_number: 1, question_number: 1 }],
  membership: { status: 'active', purchased_at: null, expires_at: null } })
const sessionFor = (id: number | null, sessionId = 'session-one') => ({
  data: id === null ? null : { user: { id: String(id) }, session: { id: sessionId } },
  isPending: false, isRefetching: false, error: null as null | { status: number },
})
function harness(initial: AuthUser | null, fetchUser: (path: string) => Promise<unknown>, nativeIdentity = initial?.id ?? null) {
  const native = ref(sessionFor(nativeIdentity))
  const states = new Map()
  const app = { $api: fetchUser, $authClient: {
    useSession: () => native,
    signIn: { email: async () => ({ data: {} }) },
    signUp: { email: async () => ({ data: {} }) },
    signOut: async () => ({ data: {} }),
  } }
  globals.useNuxtApp = () => app
  globals.useState = (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()))
    return states.get(key)
  }
  const auth = useAuth()
  auth.user.value = initial
  auth.authResolved.value = initial !== null
  ;(observeSession as any)(app)
  return { auth, native }
}

test('the initial native session reuses matching SSR application identity', () => {
  let reads = 0
  const { auth } = harness(member(1), async () => { reads += 1; return { data: member(1) } })
  assert.equal(auth.user.value?.id, 1)
  assert.equal(reads, 0)
})

test('a library cross-tab identity change hides old favorites before loading the replacement member', async () => {
  let resolve!: (value: unknown) => void
  const { auth, native } = harness(member(1), async () => new Promise(done => { resolve = done }))
  const favorites = useFavorites()
  native.value = sessionFor(2, 'session-two')
  assert.equal(auth.user.value, null)
  assert.deepEqual(favorites.favoriteIds.value, [])
  resolve({ data: member(2) }); await flush()
  assert.equal(auth.user.value?.id, 2)
  assert.deepEqual(favorites.favoriteIds.value, [2])
})

test('library cross-tab sign-out clears identity and prevents pending me from restoring it', async () => {
  let resolve!: (value: unknown) => void
  let reads = 0
  const { auth, native } = harness(member(1), async () => { reads += 1; return new Promise(done => { resolve = done }) })
  const stale = auth.ensureCurrentUser(true)
  native.value = sessionFor(null)
  assert.equal(auth.user.value, null)
  assert.deepEqual(useFavorites().favoriteIds.value, [])
  resolve({ data: member(1) })
  assert.equal(await stale, null)
  assert.equal(auth.user.value, null)
  assert.equal(reads, 1)
})

test('native session errors do not pretend a valid application session signed out', () => {
  const { auth, native } = harness(member(1), async () => ({ data: member(1) }))
  native.value = { ...sessionFor(null), error: { status: 503 } }
  assert.equal(auth.user.value?.id, 1)
})

test('native notifications wait for local auth mutations instead of superseding their hydration', async () => {
  let reads = 0
  const { auth, native } = harness(member(1), async () => { reads += 1; return { data: member(2) } })
  const login = auth.login({ email: 'member-2@example.invalid', password: 'test-password' })
  assert.equal(auth.authMutationPending.value, 1)
  native.value = sessionFor(2, 'session-two')
  assert.equal(auth.user.value?.id, 1)
  assert.equal(reads, 0)
  assert.equal((await login).id, 2)
  await flush()
  assert.equal(auth.user.value?.id, 2)
  assert.equal(auth.authMutationPending.value, 0)
  assert.equal(reads, 2)
})

test('a deep-link guard waits for app me despite a first empty native snapshot', async () => {
  let resolve!: (value: unknown) => void
  let reads = 0
  const { auth, native } = harness(null, async () => {
    if (++reads === 1) return new Promise(done => { resolve = done })
    return { data: member(1) }
  })
  let settled = false
  const navigation = (protectRoute as any)({ fullPath: '/favorites' }).then((result: unknown) => { settled = true; return result })
  await flush()
  const earlyRedirect = settled
  native.value = sessionFor(1)
  resolve({ data: member(1) })
  assert.equal(await navigation, undefined)
  assert.equal(earlyRedirect, false)
  assert.equal(auth.user.value?.id, 1)
  assert.ok(reads >= 1)
})

test('a first valid native snapshot joins the initial guard lookup without superseding it', async () => {
  let resolve!: (value: unknown) => void
  let reads = 0
  const { auth } = harness(null, async () => { reads += 1; return new Promise(done => { resolve = done }) }, 1)
  const navigation = (protectRoute as any)({ fullPath: '/favorites' })
  assert.equal(reads, 1)
  resolve({ data: member(1) })
  assert.equal(await navigation, undefined)
  assert.equal(auth.user.value?.id, 1)
  assert.equal(reads, 1)
})

test('a guard follows a newer native identity instead of returning an obsolete anonymous result', async () => {
  const responses: ((value: unknown) => void)[] = []
  const { auth, native } = harness(null, async () => new Promise(done => { responses.push(done) }), 1)
  const navigation = (protectRoute as any)({ fullPath: '/favorites' })
  native.value = sessionFor(2, 'session-two')
  responses[0]!({ data: member(1) })
  await flush()
  responses[1]!({ data: member(2) })
  assert.equal(await navigation, undefined)
  assert.equal(auth.user.value?.id, 2)
})


// Run the page's actual setup/watch logic, so the regression covers its real
// request guards rather than a second implementation of the favorites loader.
const favoritesScript = parse(readFileSync(new URL('../app/pages/favorites.vue', import.meta.url), 'utf8')).descriptor.scriptSetup!
const favoritesSetup = new Function('useNuxtApp', 'useAuth', 'useFavorites', 'ref', 'watch', 'onMounted', 'definePageMeta',
  ts.transpileModule(favoritesScript.content, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText + '\nreturn { favorites, meta, loading, loadError, page }')

function favoritePage(t: { after: (cleanup: () => void) => void }) {
  const scope = effectScope()
  t.after(() => scope.stop())
  return scope.run(() => favoritesSetup(globals.useNuxtApp, useAuth, useFavorites, ref, watch, () => {}, () => {}))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const favoriteResponse = (id: number) => ({
  data: [{ id, locked: false, question: { id, exam_number: 1, question_number: 1 }, created_at: '2026-01-01T00:00:00.000Z' }],
  meta: { current_page: 1, per_page: 20, total_count: 1, total_pages: 1 },
})

test('favorites reload when the same member gets a new native session during a pending list request', async t => {
  const requests: ReturnType<typeof deferred<ReturnType<typeof favoriteResponse>>>[] = []
  const { auth, native } = harness(member(1), async path => {
    if (path === '/api/v1/me') return { data: member(1) }
    assert.equal(path, '/api/v1/favorites')
    const pending = deferred<ReturnType<typeof favoriteResponse>>()
    requests.push(pending)
    return pending.promise
  })
  const page = favoritePage(t)
  assert.equal(requests.length, 1)
  native.value = sessionFor(1, 'session-two')
  await flush()
  assert.equal(auth.user.value?.id, 1)
  assert.equal(requests.length, 2, 'a same-member session change must start a replacement request')
  requests[0]!.resolve(favoriteResponse(1))
  await flush()
  assert.deepEqual(page.favorites.value, [])
  assert.equal(page.loading.value, true)
  requests[1]!.resolve(favoriteResponse(2))
  await flush()
  assert.deepEqual(page.favorites.value.map((item: { id: number }) => item.id), [2])
  assert.equal(page.meta.value.total_count, 1)
  assert.equal(page.loading.value, false)
  native.value = sessionFor(1, 'session-two')
  await flush()
  assert.equal(requests.length, 2, 'duplicate native snapshots and favorite hydration must not loop')
})


for (const outcome of ['success', 'forbidden', 'failure'] as const) {
  test(`a stale favorites ${outcome} cannot replace a newer session's list`, async t => {
    const requests: ReturnType<typeof deferred<ReturnType<typeof favoriteResponse>>>[] = []
    const { auth, native } = harness(member(1), async path => {
      if (path === '/api/v1/me') return { data: member(1) }
      const pending = deferred<ReturnType<typeof favoriteResponse>>()
      requests.push(pending)
      return pending.promise
    })
    const page = favoritePage(t)
    native.value = sessionFor(1, 'session-two')
    await flush()
    assert.equal(requests.length, 2)
    requests[1]!.resolve(favoriteResponse(2))
    await flush()
    if (outcome === 'success') requests[0]!.resolve(favoriteResponse(1))
    else requests[0]!.reject({ statusCode: outcome === 'forbidden' ? 403 : 500,
      data: { error: { code: outcome === 'forbidden' ? 'paid_membership_required' : 'internal_error' } } })
    await flush()
    assert.deepEqual(page.favorites.value.map((item: { id: number }) => item.id), [2])
    assert.equal(page.meta.value.total_count, 1)
    assert.equal(page.loading.value, false)
    assert.equal(page.loadError.value, '')
    assert.equal(auth.user.value?.paid_content_access, true)
    assert.deepEqual(useFavorites().favoriteIds.value, [2, 1])
  })
}

test('sign-out hides favorites and a pending old-session list cannot restore them', async t => {
  const requests: ReturnType<typeof deferred<ReturnType<typeof favoriteResponse>>>[] = []
  const { auth, native } = harness(member(1), async path => {
    if (path === '/api/v1/me') return { data: member(1) }
    const pending = deferred<ReturnType<typeof favoriteResponse>>()
    requests.push(pending)
    return pending.promise
  })
  const page = favoritePage(t)
  requests[0]!.resolve(favoriteResponse(1))
  await flush()
  native.value = sessionFor(1, 'session-two')
  await flush()
  assert.equal(requests.length, 2)
  native.value = sessionFor(null)
  await flush()
  assert.equal(auth.user.value, null)
  assert.deepEqual(page.favorites.value, [])
  requests[1]!.resolve(favoriteResponse(1))
  await flush()
  assert.deepEqual(page.favorites.value, [])
  assert.deepEqual(useFavorites().favoriteIds.value, [])
  assert.equal(page.loading.value, false)
})

test('a different member receives only their list while an earlier member request is pending', async t => {
  const requests: ReturnType<typeof deferred<ReturnType<typeof favoriteResponse>>>[] = []
  const replacementUser = deferred<{ data: AuthUser }>()
  const { auth, native } = harness(member(1), async path => {
    if (path === '/api/v1/me') return replacementUser.promise
    const pending = deferred<ReturnType<typeof favoriteResponse>>()
    requests.push(pending)
    return pending.promise
  })
  const page = favoritePage(t)
  native.value = sessionFor(2, 'session-two')
  await flush()
  assert.equal(auth.user.value, null)
  assert.deepEqual(page.favorites.value, [])
  replacementUser.resolve({ data: member(2) })
  await flush()
  assert.equal(requests.length, 2)
  requests[1]!.resolve(favoriteResponse(2))
  await flush()
  requests[0]!.resolve(favoriteResponse(1))
  await flush()
  assert.equal(auth.user.value?.id, 2)
  assert.deepEqual(page.favorites.value.map((item: { id: number }) => item.id), [2])
  assert.deepEqual(useFavorites().favoriteIds.value, [2])
})
