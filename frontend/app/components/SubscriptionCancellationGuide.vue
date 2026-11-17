<script setup lang="ts">
import { CANCELLATION_STEPS, CANCELLATION_DEADLINE, CANCELLATION_EFFECT, CANCELLATION_REFUND } from '../../shared/subscriptionTerms'
const props = withDefaults(defineProps<{ showManagementLink?: boolean, fromAccountPage?: boolean }>(), { showManagementLink: true, fromAccountPage: false })
const steps = computed(() => props.fromAccountPage
  ? ['このページの「契約・支払方法・解約の管理」を押し、Stripeの契約管理画面を開きます。', CANCELLATION_STEPS[2]]
  : CANCELLATION_STEPS)
</script>

<template>
  <div class="cancellation-guide" data-cancellation-guide>
    <ol><li v-for="step in steps" :key="step">{{ step }}</li></ol>
    <p><strong>手続の期限：</strong>{{ CANCELLATION_DEADLINE }}</p>
    <p><strong>解約後の利用：</strong>{{ CANCELLATION_EFFECT }}</p>
    <p><strong>返金：</strong>{{ CANCELLATION_REFUND }}</p>
    <p v-if="showManagementLink"><GradeLink to="/account#subscription-management">マイページの契約・解約の管理へ</GradeLink></p>
  </div>
</template>

<style scoped>
.cancellation-guide { min-width: 0; line-height: 1.9; overflow-wrap: anywhere; }
ol { list-style: decimal; margin: 0 0 16px; padding-left: 1.5em; }
li + li { margin-top: 8px; }
p { margin: 12px 0 0; }
a { color: var(--teal-dark); font-weight: 700; text-underline-offset: 3px; }
</style>
