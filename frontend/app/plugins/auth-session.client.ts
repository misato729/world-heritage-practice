export default defineNuxtPlugin({
  name: 'auth-session',
  dependsOn: ['auth-client'],
  setup(nuxtApp) {
    // Mount the library subscription so its cross-tab and focus refreshes run.
    const session = nuxtApp.$authClient.useSession()
    const { user, sessionVersion, authMutationPending, clearCurrentUser, ensureCurrentUser } = useAuth()
    let observed = false
    let previousKey: string | null = null

    const syncSession = () => {
      const current = session.value
      const mutations = authMutationPending.value
      // Keep the SSR identity stable until the first document is hydrated.
      if (nuxtApp.isHydrating || mutations || current.isPending || current.isRefetching || (current.error && current.error.status !== 401)) return
      const identity = current.data?.user?.id
      const nextKey = identity == null ? null : JSON.stringify([identity, current.data?.session?.id])
      if (observed && nextKey === previousKey) return
      const initial = !observed
      observed = true
      previousKey = nextKey

      const sameUser = identity != null && user.value != null && String(identity) === String(user.value.id)
      if (initial) {
        // Clear a stale SSR identity before checking a session that changed
        // during hydration. An anonymous shell must still join its first /me
        // lookup instead of invalidating the request awaited by route guards.
        if (!sameUser) {
          if (user.value) clearCurrentUser()
          void ensureCurrentUser(true)
        }
        return
      }
      // Hide another account's data before the asynchronous application fetch.
      if (!sameUser) clearCurrentUser()
      if (identity != null) {
        if (sameUser) sessionVersion.value += 1
        void ensureCurrentUser(true)
      }
    }
    watch([session, authMutationPending], syncSession, { immediate: true, flush: 'sync' })
    onNuxtReady(syncSession)
  },
})
