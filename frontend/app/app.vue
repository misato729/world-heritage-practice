<script setup lang="ts">
import { parseGrade } from '../shared/grades'
const route = useRoute()
const displayGrade = useGradeState()
onMounted(() => { displayGrade.value = parseGrade(route.query.grade) })
const siteName = SITE.name
const defaultDescription = SITE.description
const noIndexPatterns = [
  /^\/practice(?:\/|$)/,
  /^\/(?:history|favorites|account)(?:\/|$)/,
  /^\/premium\/complete(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  /^\/(?:login|signup|forgot-password|reset-password)(?:\/|$)/,
]
const robots = computed(() => (
  noIndexPatterns.some(pattern => pattern.test(route.path))
    ? 'noindex, nofollow'
    : 'index, follow'
))

useHead({
  htmlAttrs: { lang: 'ja' },
  title: siteName,
})

useSeoMeta({
  description: defaultDescription,
  ogTitle: siteName,
  ogDescription: defaultDescription,
  ogSiteName: siteName,
  ogLocale: 'ja_JP',
  ogType: 'website',
  twitterCard: 'summary',
  robots,
})
</script>

<template>
  <UApp>
    <NuxtLayout :key="displayGrade">
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
