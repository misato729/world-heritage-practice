import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { EXAM_CONFIG } from '../shared/examConfig.ts'
import * as content from '../shared/schemas/content.ts'
import { createTestQuestion } from '../test-support/question-fixture.ts'

const image: content.Block = {
  type: 'image', src: `/question-media/${'a'.repeat(64)}.jpg`, alt: '地図の代替説明', caption: '図1',
  credit: '© Example photographer\n提供者の完全な表示', source_url: 'https://example.org/image',
  license_label: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/',
}
const passage: content.Block = {
  type: 'rich_text', variant: 'passage', title: '世界遺産に関する以下の文章を読んで、以下の問いに答えなさい。',
  runs: [{ type: 'text', text: '前半\n' }, { type: 'underline', text: '（ア）下線部' }, { type: 'blank', text: '【A】' }, { type: 'text', text: '後半' }],
}

// Compile the actual component template and script, then render through Vue SSR.
const source = readFileSync(new URL('../app/components/QuestionContentBlocks.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'rich-content-test', inlineTemplate: true })
const javascript = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const componentModule = { exports: {} as { default: Vue.Component } }
new Function('require', 'module', 'exports', javascript)((id: string) => {
  if (id === 'vue') return Vue
  if (id === '../../shared/schemas/content.ts') return content
  throw new Error(`Unexpected component import: ${id}`)
}, componentModule, componentModule.exports)
const render = (blocks: content.Block[]) => renderToString(Vue.createSSRApp(componentModule.exports.default, { blocks }))

test('rich blocks keep all runs, attribution and optional metadata through archive and admin normalization', () => {
  const question = createTestQuestion(EXAM_CONFIG)
  question.content_blocks = [structuredClone(passage), structuredClone(image)]
  question.explanation_blocks = [structuredClone(image), structuredClone(passage)]
  question.choices[0]!.content_blocks = [{ type: 'rich_text', runs: [{ type: 'text', text: '選択肢' }, { type: 'underline', text: 'の要点' }] }]
  assert.deepEqual(content.parseQuestionArchiveEntries([question], EXAM_CONFIG), [question])
  assert.deepEqual(content.normalizeQuestionForm(question, EXAM_CONFIG), question)
  assert.deepEqual(content.parseBlocks([{ ...passage, title: null }, { ...image, caption: null }], 'question', true), [{ ...passage, title: null }, { ...image, caption: null }])
  assert.throws(() => content.parseBlocks([image], 'choice'), content.ContentValidationError)
})

test('media paths reject external content, active formats, traversal, suffixes and control characters', () => {
  for (const src of [
    'https://example.org/image.jpg', `//example.org/${'a'.repeat(64)}.jpg`, 'data:image/png;base64,AAAA',
    `/question-media/${'a'.repeat(64)}.svg`, `/question-media/../${'a'.repeat(64)}.jpg`,
    `${image.src}?download=1`, `${image.src}#fragment`, `${image.src}\n`, `/question-media/${'A'.repeat(64)}.jpg`,
  ]) {
    assert.throws(() => content.parseBlocks([{ ...image, src }], 'question'), content.ContentValidationError)
  }
  for (const extension of ['jpg', 'png', 'webp']) assert.equal(content.isQuestionMediaPath(`/question-media/${'b'.repeat(64)}.${extension}`), true)
})

test('attribution accepts only explicit HTTPS links without credentials or control characters', () => {
  for (const url of ['javascript:alert(1)', 'http://example.org', '//example.org', 'https://user:secret@example.org', 'https://example.org\n', 'https://example.org\\path']) {
    for (const key of ['source_url', 'license_url']) assert.throws(() => content.parseBlocks([{ ...image, [key]: url }], 'question'), content.ContentValidationError)
  }
  for (const field of ['alt', 'credit', 'license_label']) assert.throws(() => content.parseBlocks([{ ...image, [field]: ' ' }], 'question', true), content.ContentValidationError)
})

test('published rich text requires actual content and nonempty underline or blank labels', () => {
  for (const runs of [[], [{ type: 'text', text: ' ' }], [{ type: 'text', text: '本文' }, { type: 'blank', text: '' }], [{ type: 'underline', text: ' ' }]]) {
    assert.throws(() => content.parseBlocks([{ type: 'rich_text', runs }], 'question', true), content.ContentValidationError)
  }
  assert.throws(() => content.parseBlocks([{ type: 'rich_text', runs: [{ type: 'html', text: '<b>text</b>' }] }], 'question'), content.ContentValidationError)
})

test('rendering preserves passage structure, blank labels and line breaks while escaping markup', async () => {
  const blocks = content.parseBlocks([passage, { type: 'rich_text', runs: [{ type: 'text', text: '<script>alert(1)</script>' }, { type: 'underline', text: '<img src=x onerror=alert(1)>' }] }], 'question', true)
  const html = await render(blocks)
  assert.match(html, /content-passage/)
  assert.match(html, /<details class="content-rich-text content-passage">/)
  assert.match(html, /<summary class="content-passage-instruction">世界遺産に関する以下の文章を読んで、以下の問いに答えなさい。<\/summary>/)
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/)
  assert.match(html, /前半\n/)
  assert.match(html, /<u class="content-underline">（ア）下線部<\/u>/)
  assert.match(html, /aria-label="空欄 【A】">【A】<\/span>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<script>|<img src=x/)
})

test('only passages collapse and an untitled passage retains an instruction', async () => {
  const html = await render([{ ...passage, title: null }, { type: 'rich_text', title: '設問', runs: [{ type: 'text', text: '通常の設問文' }] }])
  assert.match(html, /<summary class="content-passage-instruction">以下の文章を読んで、以下の問いに答えなさい。<\/summary>/)
  assert.equal((html.match(/<details\b/g) ?? []).length, 1)
  assert.match(html.replace(/<!--[\s\S]*?-->/g, ''), /<section class="content-rich-text"><h3 class="content-rich-title">設問<\/h3><p class="content-rich-body">通常の設問文<\/p><\/section>/)
})

test('image output keeps complete credit, safe attribution links and the original-image link', async () => {
  const html = await render([{ ...image, credit: `${image.credit}\n<img src=x onerror=alert(1)>` }])
  assert.match(html, new RegExp(`src="${image.src}"`))
  assert.match(html, /alt="地図の代替説明"/)
  assert.match(html, /© Example photographer\n提供者の完全な表示/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /画像を拡大（別タブ）/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /CC BY 4.0/)
  const unsafePreview = await render([{ ...image, src: 'https://example.org/tracker.jpg' }, { ...image, source_url: 'javascript:alert(1)', license_url: 'data:text/html,unsafe' }])
  assert.doesNotMatch(unsafePreview, /tracker|javascript:|data:text/)
})
