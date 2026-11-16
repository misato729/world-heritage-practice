export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuth()
  if (import.meta.client && useNuxtApp().isHydrating) {
    // Public static HTML must hydrate before the session request can hold it up.
    // Protected routes still await their own auth/admin guard.
    onNuxtReady(() => { void auth.ensureCurrentUser() })
    return
  }
  const cacheControl = import.meta.server ? useResponseHeader('Cache-Control') : null
  const currentUser = await auth.ensureCurrentUser()
  if (currentUser && cacheControl) cacheControl.value = 'private, no-store'
})
