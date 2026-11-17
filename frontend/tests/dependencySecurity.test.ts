import assert from 'node:assert/strict'
import { constants, createHash, generateKeyPairSync, privateEncrypt, sign, verify } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { NODE_FORGE_SECURITY_RELEASE, assertSupportedForgeLockfile, patchNodeForge } from '../scripts/patch-node-forge.mjs'

const require = createRequire(import.meta.url)
const installedDirectory = dirname(require.resolve('node-forge/package.json'))
const securedForge = require('node-forge')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'exam-forge-security-'))
after(() => rmSync(temporaryRoot, { recursive: true, force: true }))

const message = Buffer.from('Dependency security regression: synthetic RSA test data only.')
const hashes = ['sha256', 'sha384', 'sha512'] as const
type Hash = typeof hashes[number]
const identifiers: Record<Hash, string> = {
  sha256: '0609608648016503040201',
  sha384: '0609608648016503040202',
  sha512: '0609608648016503040203'
}
const keyPairs = [3, 65537].map((exponent) => ({
  exponent,
  ...generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: exponent })
}))

function der(tag: number, value: Buffer, nonMinimalLength = false): Buffer {
  assert.ok(value.length < 128, 'The synthetic DER fixtures use short lengths.')
  return Buffer.concat([Buffer.from(nonMinimalLength ? [tag, 0x81, value.length] : [tag, value.length]), value])
}

function digestInfo(hash: Hash, parameters: Buffer | null = Buffer.from('0500', 'hex'),
  extra: Buffer = Buffer.alloc(0), outerLong = false, innerLong = false): Buffer {
  const identifier = Buffer.concat([Buffer.from(identifiers[hash], 'hex'), parameters ?? Buffer.alloc(0), extra])
  const digest = createHash(hash).update(message).digest()
  return der(0x30, Buffer.concat([der(0x30, identifier, innerLong), der(0x04, digest)]), outerLong)
}

function signRawDigestInfo(info: Buffer, privateKey: typeof keyPairs[number]['privateKey']): Buffer {
  // Deliberately sign a malformed EMSA block using a disposable private key.
  // This tests verification acceptance without relying on a probabilistic
  // cube-root forgery generator or disabling any Forge verification checks.
  const block = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(256 - info.length - 3, 0xff), Buffer.from([0]), info])
  return privateEncrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, block)
}

function publicForgeKey(forge: any, keyPair: typeof keyPairs[number]) {
  return forge.pki.publicKeyFromPem(keyPair.publicKey.export({ type: 'spki', format: 'pem' }))
}

test('the upstream security release is installed and unexpected dependency copies fail closed', () => {
  assert.equal(patchNodeForge({ checkOnly: true }), 'upstream-secured')
  const metadata = JSON.parse(readFileSync(resolve(installedDirectory, 'package.json'), 'utf8'))
  assert.equal(metadata.version, NODE_FORGE_SECURITY_RELEASE.version)
  const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => assertSupportedForgeLockfile(lockfile))
  lockfile.packages['node_modules/unexpected-package/node_modules/node-forge'] = { version: '1.4.0' }
  assert.throws(() => assertSupportedForgeLockfile(lockfile), /Unexpected node-forge dependency graph/)
})

test('release verification never repairs modified sources and rejects unreviewed versions', () => {
  const directory = join(temporaryRoot, 'release-verification')
  mkdirSync(directory)
  cpSync(resolve(installedDirectory, 'lib'), join(directory, 'lib'), { recursive: true })
  const metadataPath = join(directory, 'package.json')
  const rsaPath = join(directory, 'lib/rsa.js')
  const asn1Path = join(directory, 'lib/asn1.js')
  writeFileSync(metadataPath, JSON.stringify({ name: 'node-forge', version: NODE_FORGE_SECURITY_RELEASE.version }))
  assert.equal(patchNodeForge({ packageDirectory: directory }), 'upstream-secured')
  assert.equal(patchNodeForge({ packageDirectory: directory, checkOnly: true }), 'upstream-secured')
  for (const path of [rsaPath, asn1Path]) {
    const original = readFileSync(path, 'utf8')
    writeFileSync(path, `${original}\n`)
    for (const checkOnly of [true, false]) {
      assert.throws(() => patchNodeForge({ packageDirectory: directory, checkOnly }), /Unexpected installed/)
      assert.equal(readFileSync(path, 'utf8'), `${original}\n`)
    }
    writeFileSync(path, original)
  }
  writeFileSync(metadataPath, JSON.stringify({ name: 'node-forge', version: '1.4.0' }))
  assert.throws(() => patchNodeForge({ packageDirectory: directory }), /Unexpected node-forge package\/version/)
})

test('upstream verification rejects malformed DigestInfo, including e=3', () => {
  for (const keyPair of keyPairs) {
    for (const hash of hashes) {
      const digest = createHash(hash).update(message).digest('latin1')
      const patchedKey = publicForgeKey(securedForge, keyPair)
      const vectors = {
        'extra nested element': digestInfo(hash, Buffer.from('0500', 'hex'), Buffer.from('0203aabbcc', 'hex')),
        'non-NULL parameter element': digestInfo(hash, Buffer.from('0402abcd', 'hex')),
        'NULL with content bytes': digestInfo(hash, Buffer.from('0502abcd', 'hex')),
        'non-minimal outer length': digestInfo(hash, Buffer.from('0500', 'hex'), Buffer.alloc(0), true),
        'non-minimal inner length': digestInfo(hash, Buffer.from('0500', 'hex'), Buffer.alloc(0), false, true)
      }
      for (const [name, info] of Object.entries(vectors)) {
        const signature = signRawDigestInfo(info, keyPair.privateKey).toString('latin1')
        const context = `${hash}, e=${keyPair.exponent}, ${name}`
        assert.throws(() => patchedKey.verify(digest, signature), /DigestInfo/, context)
      }
    }
  }
})

test('SHA-256/384/512 signatures interoperate with Node/OpenSSL and Forge retains parameterless forms', () => {
  for (const keyPair of keyPairs) {
    for (const hash of hashes) {
      const digest = createHash(hash).update(message).digest('latin1')
      for (const forge of [securedForge]) {
        const publicKey = publicForgeKey(forge, keyPair)
        const nativeSignature = sign(hash, message, keyPair.privateKey)
        assert.equal(publicKey.verify(digest, nativeSignature.toString('latin1')), true)
        for (const parameters of [Buffer.from('0500', 'hex'), null]) {
          const signature = signRawDigestInfo(digestInfo(hash, parameters), keyPair.privateKey)
          assert.equal(publicKey.verify(digest, signature.toString('latin1')), true)
          // Node/OpenSSL signs and verifies the canonical NULL form. Its current
          // strict verifier rejects the omitted form, while Forge intentionally
          // preserves that existing optional-parameters behavior.
          if (parameters !== null) {
            assert.equal(verify(hash, message, keyPair.publicKey, signature), true,
              `${hash}, e=${keyPair.exponent}, OpenSSL ${process.versions.openssl}`)
          }
        }
        const privateKey = forge.pki.privateKeyFromPem(keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' }))
        const forgeDigest = forge.md[hash].create().update(message.toString('latin1'))
        const forgeSignature = Buffer.from(privateKey.sign(forgeDigest), 'latin1')
        assert.equal(verify(hash, message, keyPair.publicKey, forgeSignature), true)
        assert.equal(publicKey.verify(createHash(hash).update('different message').digest('latin1'), nativeSignature.toString('latin1')), false)
      }
    }
  }
})

test('strict trailing-byte and outer-element rejection is retained', () => {
  const keyPair = keyPairs[0]!
  const hash = 'sha256'
  const digest = createHash(hash).update(message).digest('latin1')
  const originalInfo = digestInfo(hash)
  const withOuterExtra = der(0x30, Buffer.concat([originalInfo.subarray(2), Buffer.from('0500', 'hex')]))
  for (const forge of [securedForge]) {
    const publicKey = publicForgeKey(forge, keyPair)
    for (const info of [Buffer.concat([originalInfo, Buffer.from([0])]), withOuterExtra]) {
      const signature = signRawDigestInfo(info, keyPair.privateKey).toString('latin1')
      assert.throws(() => publicKey.verify(digest, signature))
    }
  }
})

test('the archive dependency override preserves nested glob and exclusion behavior', async () => {
  // Nitro uses archiver, whose readdir-glob dependency is overridden to the
  // upstream release using minimatch 11. Exercise its actual integration.
  const { ZipArchive } = await import('archiver')
  const directory = join(temporaryRoot, 'archive-input')
  mkdirSync(join(directory, 'nested'), { recursive: true })
  writeFileSync(join(directory, 'root.txt'), 'synthetic root')
  writeFileSync(join(directory, 'nested/keep.txt'), 'synthetic nested')
  writeFileSync(join(directory, 'nested/skip.txt'), 'excluded synthetic file')
  writeFileSync(join(directory, 'nested/other.json'), '{}')
  const archive = new ZipArchive()
  const entries: string[] = []
  const chunks: Buffer[] = []
  const completed = new Promise<void>((resolve, reject) => {
    archive.on('error', reject)
    archive.on('warning', reject)
    archive.on('entry', (entry: { name: string }) => entries.push(entry.name))
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', resolve)
  })
  archive.glob('**/*.txt', { cwd: directory, ignore: ['**/skip.txt'] })
  await archive.finalize()
  await completed
  assert.deepEqual(entries.sort(), ['nested/keep.txt', 'root.txt'])
  const zip = Buffer.concat(chunks)
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50)
  assert.equal(zip.readUInt16LE(zip.length - 12), 2)
})
