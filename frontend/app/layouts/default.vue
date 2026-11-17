<script setup lang="ts">
import { themeVariables } from '../../shared/examConfig'
const { grade, config } = useGrade()
useHead({ htmlAttrs: { 'data-grade': grade }, style: [{ key: 'grade-theme', textContent: themeVariables(config, `html[data-grade="${grade}"]`) }] })
const sidebarCollapsed = ref(false)
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <SiteHeader>
      <ExamSidebar :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />
    </SiteHeader>
    <div class="app-content">
      <div class="main-column">
        <main><slot /></main>
        <SiteFooter />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell { --sidebar-width: 260px; --exam-toggle-height: 44px; --site-navigation-height: var(--header-height); min-height: 100vh; display: flex; flex-direction: column; }
.app-shell.sidebar-collapsed { --sidebar-width: 64px; }
.app-content { flex: 1; display: grid; grid-template-columns: var(--sidebar-width) minmax(0, 1fr); align-items: start; }
.main-column { grid-column: 2; min-width: 0; min-height: calc(100vh - var(--site-navigation-height)); display: flex; flex-direction: column; }
main { flex: 1; }

@media (max-width: 760px) {
  .app-shell { --site-navigation-height: calc(var(--header-height) + var(--exam-toggle-height)); }
  .app-content { grid-template-columns: 1fr; }
  .main-column { grid-column: 1; min-height: auto; }
}
</style>
