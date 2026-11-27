import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const origin = 'https://world-heritage.misato-lab.com'

// Only fixed, anonymous GETs. Never print response bodies, headers or errors
// returned by the remote service (they may contain private information).
export const checks = [
  { name: 'Home page', path: '/', status: 200, type: 'text/html',
    valid: text => text.includes('世界遺産ラボ') && /id=["']__nuxt["']/.test(text) },
  { name: 'Login page', path: '/login/', status: 200, type: 'text/html',
    valid: text => text.includes('世界遺産ラボ') && /id=["']__nuxt["']/.test(text) },
  { name: 'API through public proxy', path: '/api/v1/health', status: 200, type: 'application/json',
    valid: text => {
      const body = JSON.parse(text)
      return body.status === 'ok' && body.app === '世界遺産ラボ API'
    } },
  { name: 'Anonymous account access', path: '/api/v1/me', status: 401, type: 'application/json',
    valid: text => JSON.parse(text).error?.code === 'unauthorized' },
]

export async function runSmoke({ fetchImpl = fetch, wait = delay, report = console.log } = {}) {
  const results = []
  for (const check of checks) {
    let passed = false
    let reason = 'request failed or timed out'
    let attempts = 0
    for (attempts = 1; attempts <= 3; attempts++) {
      try {
        // The timeout also covers reading the body. Reject redirects so that a
        // maintenance/sign-in page cannot masquerade as a healthy application.
        const response = await fetchImpl(new URL(check.path, origin), {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
          headers: { accept: check.type, 'cache-control': 'no-cache' },
        })
        if (response.status !== check.status) {
          reason = `unexpected HTTP status (${response.status})`
          await response.body?.cancel()
        } else if (!response.headers.get('content-type')?.toLowerCase().includes(check.type)) {
          reason = 'unexpected content type'
          await response.body?.cancel()
        } else {
          reason = 'unexpected response structure'
          passed = Boolean(check.valid(await response.text()))
        }
      } catch {
        // Keep remote error messages and bodies out of CI logs.
        reason = 'request failed or response could not be parsed'
      }
      if (passed) break
      if (attempts < 3) await wait(3_000)
    }
    const result = { name: check.name, passed, attempts: Math.min(attempts, 3), reason: passed ? 'OK' : reason }
    results.push(result)
    report(`${passed ? 'PASS' : 'FAIL'}: ${result.name} (${result.attempts}/3): ${result.reason}`)
  }
  return results
}

async function main() {
  const results = await runSmoke()
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Production smoke test', '',
      '| Check | Result | Attempts | Detail |',
      '| --- | --- | --- | --- |',
      ...results.map(r => `| ${r.name} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.attempts} | ${r.reason} |`),
      '', 'Anonymous HTTP checks only; browser rendering, database queries and payments are outside this check.', '',
    ].join('\n'))
  }
  if (results.some(result => !result.passed)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
