import type { AchievementReport } from '../../shared/types/achievement'
export const useAchievementReport = () => {
 const { $api: api } = useNuxtApp()
 const { isLoggedIn, sessionVersion, user } = useAuth()
 const report = shallowRef<AchievementReport | null>(null), loading = ref(false), error = ref('')
 let generation = 0, active = true
 let controller: AbortController | undefined
 const reload = async () => {
  const version = ++generation, session = sessionVersion.value
  controller?.abort(); controller = new AbortController(); report.value = null; error.value = ''; loading.value = isLoggedIn.value
  if (!active || !isLoggedIn.value) return null
  try {
   const response = await api<{data:AchievementReport}>('/api/v1/me/achievement', {signal:controller.signal,retry:0})
   if (!active || version !== generation || session !== sessionVersion.value) return null
   report.value = response.data; return response.data
  } catch { if(active && version === generation && session === sessionVersion.value) error.value = '学習の記録を読み込めませんでした。もう一度お試しください。'; return null }
  finally { if(version === generation) loading.value = false }
 }
 watch([isLoggedIn, sessionVersion, () => user.value?.id, () => user.value?.paid_content_access], reload, {immediate:true,flush:'sync'})
 onBeforeUnmount(()=>{active=false;generation++;controller?.abort();report.value=null})
 return {report,loading,error,reload}
}
