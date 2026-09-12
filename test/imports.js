'use strict'

const test = require('tape')

// Regression coverage for #64 ("Bonjour is not a constructor" under a
// default ESM import) and #79 (the named import disappearing in 1.4.0,
// then the default import breaking again in the 1.4.1 fix). Both import
// styles are asserted on both the CommonJS and the ESM build output, so a
// fix for one can no longer silently break the other.

test('cjs build (dist) supports named and default require shapes', async function (t) {
  const Bonjour = require('../dist')
  const { Bonjour: NamedBonjour } = require('../dist')
  const DefaultBonjour = require('../dist').default
  const imported = await import('../dist/index.js')

  t.equal(typeof Bonjour, 'function')
  t.equal(Bonjour, NamedBonjour)
  t.equal(Bonjour, DefaultBonjour)
  t.equal(imported.default, Bonjour)
  t.equal(imported.Bonjour, Bonjour)
  t.end()
})

test('esm build (dist/esm) supports named and default import shapes', async function (t) {
  const imported = await import('../dist/esm/index.mjs')

  t.equal(typeof imported.Bonjour, 'function')
  t.equal(typeof imported.default, 'function')
  t.equal(imported.Bonjour, imported.default)

  const NamedBonjour = imported.Bonjour
  const DefaultBonjour = imported.default
  const viaNamed = new NamedBonjour({ multicast: false })
  const viaDefault = new DefaultBonjour({ multicast: false })
  t.ok(viaNamed instanceof NamedBonjour)
  t.ok(viaDefault instanceof DefaultBonjour)
  viaNamed.destroy()
  viaDefault.destroy()
  t.end()
})
