'use strict'

const os = require('os')
const dgram = require('dgram')
const tape = require('tape')
const afterAll = require('after-all')
const { Service } = require('../dist/lib/service')
const Bonjour = require('../dist')

const getAddresses = function () {
  const addresses = []
  const itrs = Object.values(os.networkInterfaces())
  for (const addrs of itrs) {
    for (const { internal, mac, address } of addrs) {
      if (internal === false && mac !== '00:00:00:00:00:00' && !addresses.includes(address)) {
        addresses.push(address)
      }
    }
  }
  return addresses
}

const filterDuplicates = (input) => input.reduce((prev, curr) => {
  const obj = prev
  if (!obj.includes(curr)) prev.push(curr)
  return obj
}, [])

const port = function (cb) {
  const s = dgram.createSocket('udp4')
  s.bind(0, function () {
    const port = s.address().port
    s.on('close', function () {
      cb(port)
    })
    s.close()
  })
}

const test = function (name, fn) {
  tape(name, function (t) {
    port(function (p) {
      fn(new Bonjour({ ip: '127.0.0.1', port: p, multicast: false }), t)
    })
  })
}

test('bonjour.publish', function (bonjour, t) {
  const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 })
  t.ok(service instanceof Service)
  t.equal(service.published, false)
  service.on('up', function () {
    t.equal(service.published, true)
    bonjour.destroy()
    t.end()
  })
})

test('bonjour.publish - destroy clears the reannounce timer', function (bonjour, t) {
  const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 })
  service.on('up', function () {
    // the reannounce timer is scheduled right after the 'up' event is
    // emitted, so give that a tick to happen before checking for it
    setImmediate(function () {
      t.equal(bonjour.registry.reannounceTimers.has(service), true)
      bonjour.destroy()
      t.equal(bonjour.registry.reannounceTimers.size, 0)
      t.end()
    })
  })
})

test('bonjour.unpublishAll - clears the reannounce timer for the unpublished service', function (bonjour, t) {
  const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 })
  service.on('up', function () {
    setImmediate(function () {
      t.equal(bonjour.registry.reannounceTimers.has(service), true)
      bonjour.unpublishAll(function () {
        t.equal(bonjour.registry.reannounceTimers.has(service), false)
        bonjour.destroy()
        t.end()
      })
    })
  })
})

test('bonjour.unpublishAll', function (bonjour, t) {
  t.test('published services', function (t) {
    const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 })
    service.on('up', function () {
      bonjour.unpublishAll(function (err) {
        t.error(err)
        t.equal(service.published, false)
        bonjour.destroy()
        t.end()
      })
    })
  })

  t.test('no published services', function (t) {
    bonjour.unpublishAll(function (err) {
      t.error(err)
      t.end()
    })
  })
})

test('bonjour.find', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.find({ type: 'test' })
    let ups = 0

    browser.on('up', function (s) {
      if (s.name === 'Foo Bar') {
        t.equal(s.name, 'Foo Bar')
        t.equal(s.fqdn, 'Foo Bar._test._tcp.local')
        t.deepEqual(s.txt, {})
        t.deepEqual(s.rawTxt, [])
      } else {
        t.equal(s.name, 'Baz')
        t.equal(s.fqdn, 'Baz._test._tcp.local')
        t.deepEqual(s.txt, { foo: 'bar' })
        t.deepEqual(s.rawTxt, [Buffer.from('666f6f3d626172', 'hex')])
      }
      t.equal(s.host, os.hostname())
      t.equal(s.port, 3000)
      t.equal(s.type, 'test')
      t.equal(s.protocol, 'tcp')
      t.equal(s.referer.address, '127.0.0.1')
      t.equal(s.referer.family, 'IPv4')
      t.ok(Number.isFinite(s.referer.port))
      t.ok(Number.isFinite(s.referer.size))
      t.deepEqual(s.subtypes, [])
      t.deepEqual(filterDuplicates(s.addresses.sort()), getAddresses().sort())

      if (++ups === 2) {
        // use timeout in an attempt to make sure the invalid record doesn't
        // bubble up
        setTimeout(function () {
          bonjour.destroy()
          t.end()
        }, 50)
      }
    })
  })

  bonjour.publish({ name: 'Foo Bar', type: 'test', port: 3000 }).on('up', next())
  bonjour.publish({ name: 'Invalid', type: 'test2', port: 3000 }).on('up', next())
  bonjour.publish({ name: 'Baz', type: 'test', port: 3000, txt: { foo: 'bar' } }).on('up', next())
})

test('bonjour.find - binary txt', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.find({ type: 'test', txt: { binary: true } })

    browser.on('up', function (s) {
      t.equal(s.name, 'Foo')
      t.deepEqual(s.txt, { bar: 'buz' })
      t.deepEqual(s.rawTxt, [Buffer.from('6261723d62757a', 'hex')])
      bonjour.destroy()
      t.end()
    })
  })

  bonjour.publish({ name: 'Foo', type: 'test', port: 3000, txt: { bar: Buffer.from('buz') } }).on('up', next())
})

test('bonjour.find - subtypes', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.find({ type: 'test' })

    browser.on('up', function (s) {
      t.equal(s.name, 'Foo')
      t.deepEqual(s.subtypes, ['foo', 'bar'])
      bonjour.destroy()
      t.end()
    })
  })

  bonjour.publish({ name: 'Foo', type: 'test', port: 3000, subtypes: ['foo', 'bar'] }).on('up', next())
})

test('bonjour.find - down event', function (bonjour, t) {
  const service = bonjour.publish({ name: 'Foo Bar', type: 'test', port: 3000 })

  service.on('up', function () {
    const browser = bonjour.find({ type: 'test' })

    browser.on('up', function (s) {
      t.equal(s.name, 'Foo Bar')
      service.stop()
    })

    browser.on('down', function (s) {
      t.equal(s.name, 'Foo Bar')
      bonjour.destroy()
      t.end()
    })
  })
})

test('bonjour.findOne - callback', function (bonjour, t) {
  const next = afterAll(function () {
    bonjour.findOne({ type: 'test' }, undefined, function (s) {
      t.equal(s.name, 'Callback')
      bonjour.destroy()
      t.end()
    })
  })
  bonjour.publish({ name: 'Invalid', type: 'test2', port: 3000 }).on('up', next())
  bonjour.publish({ name: 'Callback', type: 'test', port: 3000 }).on('up', next())
})

test('bonjour.findOne - emitter', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.findOne({ type: 'test' })
    browser.on('up', function (s) {
      t.equal(s.name, 'Emitter')
      bonjour.destroy()
      t.end()
    })
  })

  bonjour.publish({ name: 'Emitter', type: 'test', port: 3000 }).on('up', next())
  bonjour.publish({ name: 'Invalid', type: 'test2', port: 3000 }).on('up', next())
})

test('bonjour.publish multiple', (bonjour, t) => {
  let counter = 0
  const onUp = () => {
    counter += 1
    if (counter === 3) {
      bonjour.destroy()
      t.end()
    }
  }
  bonjour.publish({ name: 'A', type: 'A', port: 3000 }).on('up', onUp)
  bonjour.publish({ name: 'B', type: 'B', port: 3000 }).on('up', onUp)
  bonjour.publish({ name: 'C', type: 'C', port: 3000 }).on('up', onUp)
})

test('bonjour.publish multiple nested', (bonjour, t) => {
  let counter = 0
  bonjour.publish({ name: 'A', type: 'A', port: 3000 }).on('up', () => {
    counter++
    bonjour.publish({ name: 'B', type: 'B', port: 3000 }).on('up', () => {
      counter++
      bonjour.publish({ name: 'C', type: 'C', port: 3000 }).on('up', () => {
        counter++
        t.equal(counter, 3)
        bonjour.destroy()
        t.end()
      })
    })
  })
})
