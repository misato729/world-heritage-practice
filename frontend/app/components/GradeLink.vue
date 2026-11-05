<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
const props = defineProps<{ to?: RouteLocationRaw }>()
const route = useRoute()
const target = computed(() => {
 if (!props.to || route.query.grade === undefined) return props.to
 if (typeof props.to === 'object') return { ...props.to, query: { grade: route.query.grade ?? '2', ...('query' in props.to ? props.to.query : {}) } }
 if (!props.to.startsWith('/') || props.to.startsWith('//')) return props.to
 const url = new URL(props.to, 'https://local.invalid')
 if (!url.searchParams.has('grade')) url.searchParams.set('grade', String(route.query.grade ?? '2'))
 return url.pathname + url.search + url.hash
})
</script>
<template><NuxtLink :to="target"><slot /></NuxtLink></template>
