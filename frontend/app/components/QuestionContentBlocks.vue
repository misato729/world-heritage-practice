<script setup lang="ts">
import { isHttpsAttributionUrl, isQuestionMediaPath, type Block as ContentBlock } from '../../shared/schemas/content.ts'

defineProps<{
  blocks: ContentBlock[]
}>()

type FillInPart = {
  type: 'text' | 'blank'
  text: string
}

const fillInParts = (text: string | null = ''): FillInPart[] => (
  (text ?? '')
    .split(/(\{\{[^{}]+\}\})/g)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\{\{(.+)\}\}$/)
      return match
        ? { type: 'blank', text: match[1] ?? '' }
        : { type: 'text', text: part }
    })
)

const blankLabels = ['①', '②', '③', '④', '⑤', '⑥']
</script>

<template>
  <div class="content-blocks">
    <template v-for="(block, index) in blocks" :key="`${block.type}-${index}`">
      <p v-if="block.type === 'text'" class="content-text">{{ block.text }}</p>

      <component :is="block.variant === 'passage' ? 'details' : 'section'" v-else-if="block.type === 'rich_text'" class="content-rich-text" :class="{ 'content-passage': block.variant === 'passage' }">
        <summary v-if="block.variant === 'passage'" class="content-passage-instruction">{{ block.title || '以下の文章を読んで、以下の問いに答えなさい。' }}</summary>
        <h3 v-else-if="block.title" class="content-rich-title">{{ block.title }}</h3>
        <p class="content-rich-body"><template v-for="(run, runIndex) in block.runs" :key="runIndex"><u v-if="run.type === 'underline'" class="content-underline">{{ run.text }}</u><span v-else-if="run.type === 'blank'" class="fill-in-blank" :aria-label="`空欄 ${run.text}`">{{ run.text }}</span><template v-else>{{ run.text }}</template></template></p>
      </component>

      <figure v-else-if="block.type === 'image' && isQuestionMediaPath(block.src)" class="content-image">
        <img :src="block.src" :alt="block.alt" decoding="async">
        <figcaption>
          <p v-if="block.caption" class="content-image-caption">{{ block.caption }}</p>
          <p class="content-image-credit">{{ block.credit }}</p>
          <p class="content-image-links">
            <a :href="block.src" target="_blank" rel="noopener noreferrer">画像を拡大（別タブ）</a>
            <a v-if="isHttpsAttributionUrl(block.source_url)" :href="block.source_url" target="_blank" rel="noopener noreferrer">画像の出典</a>
            <a v-if="isHttpsAttributionUrl(block.license_url)" :href="block.license_url" target="_blank" rel="noopener noreferrer">{{ block.license_label }}</a>
          </p>
        </figcaption>
      </figure>

      <blockquote v-else-if="block.type === 'quote'" class="content-quote">
        <p>{{ block.text }}</p>
        <cite v-if="block.source">{{ block.source }}</cite>
      </blockquote>

      <p v-else-if="block.type === 'fill_in_text'" class="content-text fill-in-text">
        <template v-for="(part, partIndex) in fillInParts(block.text)" :key="partIndex">
          <span v-if="part.type === 'blank'" class="fill-in-blank">{{ part.text }}</span>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>

      <blockquote v-else-if="block.type === 'fill_in_quote'" class="exam-fill-in-quote">
        <p>
          <template v-for="(part, partIndex) in fillInParts(block.text)" :key="partIndex">
            <span v-if="part.type === 'blank'" class="fill-in-blank">{{ part.text }}</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
      </blockquote>

      <div v-else-if="block.type === 'fill_in_choice'" class="fill-in-choice">
        <span v-for="(cell, cellIndex) in block.cells" :key="cellIndex" class="fill-in-choice-cell">
          <small>{{ blankLabels[cellIndex] }}</small>
          <span>{{ cell }}</span>
        </span>
      </div>

      <div v-else-if="block.type === 'table'" class="content-table-wrap" tabindex="0">
        <table class="content-table">
          <thead v-if="block.headers?.length">
            <tr>
              <th v-for="header in block.headers" :key="header" scope="col">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <figure v-else-if="block.type === 'code'" class="code-panel">
        <figcaption v-if="block.title">{{ block.title }}</figcaption>
        <pre><code>{{ block.code }}</code></pre>
      </figure>

      <div v-else-if="block.type === 'code_group'" class="code-group">
        <figure v-for="(item, itemIndex) in block.items" :key="itemIndex" class="code-panel">
          <figcaption>{{ item.title }}</figcaption>
          <pre><code>{{ item.code }}</code></pre>
        </figure>
      </div>
    </template>
  </div>
</template>

<style scoped>
.content-blocks { display: grid; gap: 20px; min-width: 0; }
.content-text { margin: 0; white-space: pre-wrap; }
.content-rich-text { min-width: 0; }
.content-rich-title { margin: 0 0 10px; font-size: .85em; font-weight: 700; }
.content-rich-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 2.1; }
.content-underline { text-decoration-thickness: 1.5px; text-underline-offset: .22em; text-decoration-skip-ink: none; }
.content-passage { padding: 20px 22px; border: 1px solid var(--line); background: #f7faf9; font-weight: 500; }
.content-passage-instruction { cursor: pointer; font-size: .9em; font-weight: 700; overflow-wrap: anywhere; }
.content-passage-instruction:focus-visible { outline: 2px solid var(--teal); outline-offset: 5px; }
.content-passage[open] > .content-passage-instruction { margin-bottom: 16px; }
.content-image { min-width: 0; margin: 0; }
.content-image img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.content-image figcaption { margin-top: 10px; color: var(--muted); font-size: 13px; font-weight: 400; line-height: 1.7; overflow-wrap: anywhere; }
.content-image figcaption p { margin: 0; white-space: pre-wrap; }
.content-image-caption { color: var(--ink); }
.content-image .content-image-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; }
.content-image-links a { color: var(--teal-dark, var(--teal)); text-decoration: underline; text-underline-offset: .2em; }
.content-quote { margin: 0; padding: 18px 20px; border: 1px solid var(--line); border-left: 4px solid var(--teal); background: #f7faf9; }
.content-quote p { margin: 0; font-size: 18px; font-weight: 500; white-space: pre-wrap; }
.content-quote cite { display: block; margin-top: 10px; color: var(--muted); font-size: 13px; font-style: normal; }
.fill-in-text { line-height: 2.15; }
.fill-in-blank {
  min-width: 3.1em;
  min-height: 1.75em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 .18em;
  padding: 0 .55em;
  border: 2px solid #46575c;
  background: #fff;
  color: #46575c;
  font-size: .82em;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
}
.exam-fill-in-quote {
  margin: 0;
  padding: 22px 24px;
  border: 1px solid #66777c;
  background: #fff;
  color: #263a41;
  font-size: 18px;
  font-weight: 500;
  line-height: 2.3;
}
.exam-fill-in-quote p { margin: 0; white-space: pre-wrap; }
.fill-in-choice { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.fill-in-choice-cell { min-width: 0; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: baseline; gap: 6px; }
.fill-in-choice-cell small { color: #52666d; font-size: 14px; font-weight: 700; }
.fill-in-choice-cell > span { font-weight: 700; }
.content-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid var(--line); }
.content-table { width: 100%; min-width: 620px; border-collapse: collapse; background: #fff; font-size: 16px; font-weight: 500; line-height: 1.7; }
.content-table th,
.content-table td { padding: 12px 14px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; white-space: pre-wrap; }
.content-table th { background: #f1f6f5; color: #30464d; font-size: 14px; font-weight: 700; }
.content-table tr:last-child td { border-bottom: 0; }
.content-table th:last-child,
.content-table td:last-child { border-right: 0; }
.code-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.code-panel { min-width: 0; margin: 0; border: 1px solid var(--line); background: #f8faf9; }
.code-panel figcaption { padding: 10px 14px; border-bottom: 1px solid var(--line); font-weight: 800; text-align: center; }
.code-panel pre { margin: 0; padding: 16px; overflow-x: auto; font-size: 14px; line-height: 1.75; white-space: pre; }
.code-panel code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
@media (max-width: 720px) {
  .content-passage { padding: 16px; }
  .code-group { grid-template-columns: 1fr; }
  .content-quote { padding: 16px; }
  .exam-fill-in-quote { padding: 17px 16px; line-height: 2.15; }
  .fill-in-choice { grid-template-columns: 1fr; gap: 5px; }
}
</style>
