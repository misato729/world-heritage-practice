import { parseGrade } from '../../shared/grades'
export default defineNuxtRouteMiddleware((to, from) => {
 try { parseGrade(to.query.grade) } catch { return abortNavigation(createError({statusCode:400,statusMessage:'級を正しく指定してください'})) }
 const remembered = useCookie<string | null>('heritage-grade', {sameSite:'lax', maxAge:31536000})
 if (to.query.grade !== undefined) remembered.value = String(to.query.grade)
 if (to.path === '/' && to.query.grade === undefined && from.query.grade === undefined && remembered.value && ['1','pre1'].includes(remembered.value)) return navigateTo({ ...to, query: { ...to.query, grade: remembered.value } }, {replace:true})
 if (import.meta.client && !useNuxtApp().isHydrating && from.path && to.query.grade !== undefined && String(to.query.grade) !== String(from.query.grade ?? '2')) { window.location.assign(to.fullPath); return abortNavigation() }
 if (to.query.grade === undefined && from.query.grade !== undefined) return navigateTo({ ...to, query: { ...to.query, grade: from.query.grade } }, { replace: true })
})
