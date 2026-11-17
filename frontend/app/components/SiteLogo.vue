<template>
  <span class="site-logo">
    <svg class="logo-mark" aria-hidden="true" viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="16" fill="var(--teal)" />
      <circle cx="32" cy="29" r="18" stroke="white" stroke-width="2.5" />
      <ellipse cx="32" cy="29" rx="8" ry="18" stroke="white" stroke-width="2" />
      <path d="M15 23h34M15 35h34" stroke="white" stroke-width="2" />
      <path d="M12 43c8-2 14-1 20 3 6-4 12-5 20-3v10c-8-2-14-1-20 3-6-4-12-5-20-3V43Z" fill="white" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" />
      <path d="M32 46v10" stroke="var(--teal)" stroke-width="2" />
    </svg>
    <span>{{ SITE.name }}</span>
  </span>
</template>

<style scoped>
.site-logo { display: inline-flex; min-width: 0; align-items: center; gap: 10px; font-size: clamp(18px, 2.4vw, 26px); font-weight: 900; color: var(--ink); }
.site-logo .logo-mark { flex: 0 0 auto; width: 44px; height: 44px; object-fit: contain; }
.site-logo span { overflow-wrap: anywhere; }
@media (max-width: 420px) { .site-logo { gap: 6px; font-size: 16px; } .site-logo .logo-mark { width: 32px; height: 32px; } }
</style>
