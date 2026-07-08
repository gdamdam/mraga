#!/usr/bin/env node
/**
 * Check or re-sync the shared tuning core vendored into mraga from the
 * canonical source in the sibling `mdrone` repo (src/tuning/). Each vendored
 * file is a credit header followed by the upstream file copied VERBATIM, so
 * the mraga/mdrone/… family shares ONE resolver + builtins instead of each
 * app re-defining its own and drifting.
 *
 *   npm run vendored:check   # exit 1 if any copy is stale/missing (default)
 *   npm run vendored:sync    # re-copy model.ts + scala.ts + builtins.ts
 *
 * Mirrors ../mbus/scripts/sync-vendored.mjs. The header carries the source
 * repo, path and the mdrone short SHA (read live from ../mdrone HEAD), so a
 * moved upstream fails `check` until re-synced — the intended drift guard.
 */

import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILES = ['model.ts', 'scala.ts', 'builtins.ts']

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mdrone = join(root, '..', 'mdrone')
const upstream = join(mdrone, 'src', 'tuning')
const dest = join(root, 'src', 'vendor', 'tuning-core')
const mode = process.argv.includes('--sync') ? 'sync' : 'check'

const note = (s) => console.log(s)

if (!existsSync(upstream)) {
  note(`✗ upstream ${upstream} missing (clone ../mdrone)`)
  process.exit(1)
}

const sha = execSync(`git -C ${mdrone} rev-parse --short HEAD`).toString().trim()

/** Credit header prepended to each vendored file (source path + SHA + AGPL). */
function header(file) {
  return [
    '/**',
    ' * VENDORED — DO NOT EDIT BY HAND.',
    ' *',
    ` * Source: mdrone (sibling repo) src/tuning/${file} @ ${sha}.`,
    ' * License: AGPL-3.0-or-later (same author as mraga).',
    ' * Regenerate: `npm run vendored:sync`  ·  Verify: `npm run vendored:check`.',
    ' *',
    ' * The shared tuning core is authored in mdrone and copied VERBATIM below',
    ' * this header. Edit the source in mdrone, then re-sync — never edit here.',
    ' */',
    `// @vendored-source mdrone:src/tuning/${file}@${sha}`,
    '// @vendored-end',
    '',
  ].join('\n')
}

/** Expected on-disk content: credit header + verbatim upstream bytes. */
function expected(file) {
  return header(file) + readFileSync(join(upstream, file), 'utf8')
}

mkdirSync(dest, { recursive: true })

let failures = 0
for (const f of FILES) {
  const dst = join(dest, f)
  const want = expected(f)
  const same = existsSync(dst) && readFileSync(dst, 'utf8') === want
  if (same) {
    note(`✓ tuning-core/${f} in sync (mdrone@${sha})`)
  } else if (mode === 'sync') {
    writeFileSync(dst, want)
    note(`↻ tuning-core/${f} re-copied (mdrone@${sha})`)
  } else {
    note(`✗ tuning-core/${f} ${existsSync(dst) ? 'DIFFERS from upstream' : 'missing'}`)
    failures++
  }
}

if (mode === 'check' && failures > 0) {
  note(`\n${failures} problem(s). Run \`npm run vendored:sync\` to re-copy.`)
  process.exit(1)
}
note(mode === 'sync' ? '\nAll vendored copies synced.' : '\nAll vendored copies in sync.')
