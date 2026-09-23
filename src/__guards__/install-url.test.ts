import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The install command in `consumption.md` is copied verbatim by the consumer, and
 * the URL inside it does not stay in the terminal: npm writes it into
 * `package-lock.json`, where CI and the prod box read it back.
 *
 * JIG-3: the channel is a GitHub Release asset, not a git tag any more —
 * `https://github.com/santarinto/jig/releases/download/vX.Y.Z/santarinto-jig-X.Y.Z.tgz`.
 * The shape that has already bitten in this exact new form: the version in the
 * TAG segment and the version in the FILENAME segment drift apart (someone bumps
 * one and not the other by hand), and CI then serves 404 or the wrong file under
 * the right-looking URL — the failure surfaces at `npm install`, far from the one
 * digit that was never touched. `check-published.mjs` (`publish-reach.test.ts`)
 * proves the same shape holds for `parseAssetUrl`; this guard proves it holds in
 * the actual document a consumer copies from.
 */
const DOC = resolve(__dirname, '../../docs/portal-migration/consumption.md')
const text = readFileSync(DOC, 'utf8')

const installLines = text.split('\n').filter((l) => l.includes('npm install'))
const ASSET_URL_RE = /https:\/\/github\.com\/([^/\s'"`]+\/[^/\s'"`]+)\/releases\/download\/v(\d+\.\d+\.\d+)\/([a-z0-9-]+)-(\d+\.\d+\.\d+)\.tgz/g

describe('the install command the portal copies', () => {
  // Guard, который ничего не нашёл и потому «прошёл», — худший вид guard'а.
  it('is actually present in the doc', () => {
    expect(installLines.length, `${DOC}: no npm install line — has the doc been restructured?`)
      .toBeGreaterThan(0)
  })

  it('carries a GitHub Release asset URL, not a git dependency', () => {
    const gitDeps = installLines.filter((l) => l.includes('git+'))
    expect(gitDeps, 'install line still uses git+… — the channel moved to a release asset URL (JIG-28/JIG-3)')
      .toEqual([])
    const withAsset = installLines.filter((l) => ASSET_URL_RE.test(l))
    ASSET_URL_RE.lastIndex = 0
    expect(withAsset.length, `${DOC}: no npm install line carries a github.com release asset URL`)
      .toBeGreaterThan(0)
  })

  it('names the same version in the tag and in the tarball filename', () => {
    const urls = [...text.matchAll(ASSET_URL_RE)]
    expect(urls.length, `${DOC}: no release asset URL found at all — has the doc been restructured?`)
      .toBeGreaterThan(0)
    const mismatched = urls.filter((m) => m[2] !== m[4]).map((m) => m[0])
    expect(mismatched, 'tag version and filename version disagree — CI resolves the asset by TAG, so this 404s')
      .toEqual([])
  })

  it('points at the santarinto/jig repository', () => {
    const urls = [...text.matchAll(ASSET_URL_RE)]
    const wrongRepo = urls.filter((m) => m[1] !== 'santarinto/jig').map((m) => m[0])
    expect(wrongRepo, 'release asset URL does not point at santarinto/jig')
      .toEqual([])
  })
})
