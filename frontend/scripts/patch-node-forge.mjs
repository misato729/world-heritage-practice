import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// The upstream release includes the former RSA backport and the other Forge
// security fixes. This legacy entry point now verifies only; it never patches
// node_modules, including installs performed with --ignore-scripts.
export const NODE_FORGE_SECURITY_RELEASE = Object.freeze({
  version: '1.4.3',
  upstream: 'https://github.com/digitalbazaar/forge/releases/tag/v1.4.3',
  sourceSha256: Object.freeze({
    'lib/rsa.js': '6632e195295ce76f6bb9131ee770dcd6cc1ee4ffac7906302208b00faf95a87f',
    'lib/asn1.js': '77cc3ca2b4c1009e93cf26594232598f253bd3e046f16eb32386c8bf644857b6'
  })
})

const require = createRequire(import.meta.url)
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function assertSupportedForgeLockfile(lockfile) {
  const copies = Object.entries(lockfile.packages ?? {})
    .filter(([path]) => path === 'node_modules/node-forge' || path.endsWith('/node_modules/node-forge'))
  if (copies.length !== 1 || copies[0][0] !== 'node_modules/node-forge' ||
    copies[0][1].version !== NODE_FORGE_SECURITY_RELEASE.version) {
    throw new Error('Unexpected node-forge dependency graph; review every copy before updating the security release.')
  }
}

// Retain the function name for existing dependency/bootstrap callers. Both
// normal and --check invocations are read-only now that upstream is fixed.
/** @param {{ checkOnly?: boolean, packageDirectory?: string }} [options] */
export function patchNodeForge({ packageDirectory } = {}) {
  assertSupportedForgeLockfile(JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')))
  const directory = packageDirectory ?? dirname(require.resolve('node-forge/package.json'))
  const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
  if (metadata.name !== 'node-forge' || metadata.version !== NODE_FORGE_SECURITY_RELEASE.version) {
    throw new Error('Unexpected node-forge package/version; install the reviewed upstream security release.')
  }
  for (const [file, expected] of Object.entries(NODE_FORGE_SECURITY_RELEASE.sourceSha256)) {
    if (sha256(readFileSync(resolve(directory, file))) !== expected) {
      throw new Error(`Unexpected installed node-forge ${file}; reinstall the reviewed upstream security release.`)
    }
  }
  return 'upstream-secured'
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2)
    if (args.some((arg) => arg !== '--check') || args.length > 1) {
      throw new Error('Usage: node scripts/patch-node-forge.mjs [--check]')
    }
    console.log(`node-forge ${NODE_FORGE_SECURITY_RELEASE.version}: ${patchNodeForge()}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'node-forge security verification failed.')
    process.exitCode = 1
  }
}
