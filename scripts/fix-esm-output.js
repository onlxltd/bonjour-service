'use strict'

// After building dist/esm with tsconfig.esm.json, tsc still emits plain
// ".js"/".d.ts" files with extension-less relative specifiers (it does not
// know the output will be consumed as native ESM). Node's ESM loader
// requires an explicit, resolvable extension on every relative specifier,
// and TypeScript's own Node16/NodeNext resolution requires the same when a
// consumer type-checks against the ".d.mts" files. This script renames the
// esm build output to ".mjs" / ".d.mts" and patches relative specifiers to
// match, then drops a package.json next to dist/esm so Node knows it is
// looking at ESM there without needing a "type" field on the root manifest
// (the CommonJS build stays at dist/, unrelocated, and keeps relying on the
// root manifest's default of "commonjs" the same way it always has).

const fs = require('fs')
const path = require('path')

const esmDir = path.join(__dirname, '..', 'dist', 'esm')

function walk (dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

// Appends '.mjs' to relative import/export/dynamic-import specifiers that
// have no extension yet. Only touches specifiers starting with './' or
// '../' - bare specifiers (package imports) are left untouched.
function fixSpecifiers (content) {
  const specifier = /((?:from|import)\s*\(?\s*["'])(\.\.?\/[^"']+)(["'])/g
  content = content.replace(specifier, (match, prefix, spec, suffix) => {
    if (/\.[mc]?[tj]s$/.test(spec) || /\.mjs$/.test(spec) || /\.json$/.test(spec)) return match
    return `${prefix}${spec}.mjs${suffix}`
  })
  // fast-deep-equal has no package.json "exports" map, so its "es6"
  // subpath resolves as a directory import - CommonJS's require() quietly
  // appends "index.js", but Node's ESM resolver does not. Point at the
  // file explicitly; it resolves the same way under both formats.
  content = content.replace(/(["'])fast-deep-equal\/es6\1/g, '$1fast-deep-equal/es6/index.js$1')
  return content
}

function targetName (fileName) {
  // src/index.esm.ts compiles to index.esm.js / index.esm.d.ts; give the
  // package's public esm entry point the plain "index" name.
  const base = fileName.replace(/^index\.esm\./, 'index.')
  if (base.endsWith('.d.ts')) return base.slice(0, -5) + '.d.mts'
  if (base.endsWith('.js.map')) return base.slice(0, -7) + '.mjs.map'
  if (base.endsWith('.js')) return base.slice(0, -3) + '.mjs'
  return base
}

function run () {
  const files = walk(esmDir)

  for (const file of files) {
    const name = path.basename(file)
    if (!name.endsWith('.js') && !name.endsWith('.d.ts') && !name.endsWith('.js.map')) continue

    const newName = targetName(name)
    const newPath = path.join(path.dirname(file), newName)

    let content = fs.readFileSync(file, 'utf8')
    if (name.endsWith('.js') || name.endsWith('.d.ts')) {
      content = fixSpecifiers(content)
      if (name.endsWith('.js')) {
        content = content.replace(/sourceMappingURL=(\S+)\.js\.map/, (m, base) => `sourceMappingURL=${base.replace(/\.esm$/, '')}.mjs.map`)
      }
    } else if (name.endsWith('.js.map')) {
      content = content.replace(/"file":"([^"]+)\.js"/, (m, base) => `"file":"${base.replace(/\.esm$/, '')}.mjs"`)
    }

    fs.writeFileSync(newPath, content)
    if (newPath !== file) fs.unlinkSync(file)
  }

  fs.writeFileSync(path.join(esmDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n')
}

run()
