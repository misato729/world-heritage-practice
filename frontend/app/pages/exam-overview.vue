<script setup lang="ts">
const { config: EXAM_CONFIG } = useGrade()
useSeoMeta({ title: `試験概要｜${SITE.name}`, description: `${SITE.exam_name}の概要をご案内します。` })
</script>

<template>
  <div class="page-wrap overview-page">
    <header class="page-intro"><h1>{{ SITE.exam_name }}</h1><p>{{ SITE.description }}</p></header>
    <section v-if="SITE.notice" class="content-panel" role="status"><h2>問題の公開準備中</h2><p>{{ SITE.notice }}</p></section>
    <section v-for="section in SITE.overview" :key="section.title" class="content-panel">
      <h2>{{ section.title }}</h2><p>{{ section.body }}</p>
    </section>
    <section class="content-panel">
      <h2>本サイトの演習</h2>
      <p>模擬試験は全{{ EXAM_CONFIG.exam.set_count }}セット、各{{ EXAM_CONFIG.exam.questions_per_exam }}問の構成です。各問には{{ CHOICE_LABELS.length }}つの選択肢があり、正答は1つです。問題は順次公開します。</p>
      <p>本サイトでは1問ずつ演習します。制限時間を設けた受験や、本試験の配点による合否判定には対応していません。</p>
      <div v-for="major in MAJOR_CATEGORIES" :key="major.value" class="category-group">
        <h3>{{ major.label }}</h3>
        <ul><li v-for="category in getCategoriesByMajorCategory(major.value)" :key="category.value">{{ category.label }}</li></ul>
      </div>
      <GradeLink class="primary-link" to="/#practice-launcher">問題演習を始める</GradeLink>
    </section>
    <section class="content-panel"><h2>公式情報</h2><p>試験の概要・学習範囲は世界遺産検定の公式案内で確認できます。本サイトは独自の学習サービスです。</p><a class="secondary-link" href="https://www.sekaken.jp/each_grade/criterion/" target="_blank" rel="noopener noreferrer">各級の公式案内を見る<UIcon name="i-lucide-external-link" /></a></section>
  </div>
</template>

<style scoped>
.overview-page { padding-bottom: 36px; }
.content-panel p { white-space: pre-line; overflow-wrap: anywhere; }
.category-group { margin: 24px 0; }
.category-group h3 { font-size: 18px; }
.category-group ul { padding-left: 1.4em; }
</style>
