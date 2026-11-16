<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
const props = defineProps<{ to?: RouteLocationRaw }>()
const route = useRoute()
// Keep the initial link equal to its SSR payload, including static HTML whose
// query is unknown. Apply the browser's grade after hydration so href updates too.
const currentLinkGrade = () => route.query.grade === undefined ? null : String(route.query.grade ?? '2')
const linkGrade = useState<string | null>('navigation-grade', currentLinkGrade)
const syncGrade = () => { linkGrade.value = currentLinkGrade() }
onMounted(syncGrade)
watch(() => route.query.grade, syncGrade)
const target = computed(() => {
 if (!props.to || linkGrade.value === null) return props.to
 if (typeof props.to === 'object') return { ...props.to, query: { grade: linkGrade.value, ...('query' in props.to ? props.to.query : {}) } }
 if (!props.to.startsWith('/') || props.to.startsWith('//')) return props.to
 const url = new URL(props.to, 'https://local.invalid')
 if (!url.searchParams.has('grade')) url.searchParams.set('grade', linkGrade.value)
 return url.pathname + url.search + url.hash
})
</script>
<template><NuxtLink :to="target"><slot /></NuxtLink></template>
