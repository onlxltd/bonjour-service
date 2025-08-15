'use strict'

const os = require('os')
const test = require('tape')
const { Service } = require('../dist/lib/service')

const getAddressesRecords = function (host) {
  const records = []
  const itrs = Object.values(os.networkInterfaces())
  for (const addrs of itrs) {
    for (const { internal, address, family, mac } of addrs) {
      if (internal === false && mac !== '00:00:00:00:00:00') {
        records.push({ data: address, name: host, ttl: 120, type: family === 'IPv4' ? 'A' : 'AAAA' })
      }
    }
  }
  return records
}

const start = () => {}
const stop = () => {}

test('service must throw an exception if no name is specified', function (t) {
  t.throws(function () {
    new Service({ type: 'http', port: 3000 }, start, stop) // eslint-disable-line no-new
  }, 'Required name not given')
  t.end()
})

test('service must throw an exception if no type is specified', function (t) {
  t.throws(function () {
    new Service({ name: 'Foo Bar', port: 3000 }, start, stop) // eslint-disable-line no-new
  }, 'Required type not given')
  t.end()
})

test('no port', function (t) {
  t.throws(function () {
    new Service({ name: 'Foo Bar', type: 'http' }, start, stop) // eslint-disable-line no-new
  }, 'Required port not given')
  t.end()
})

test('minimal', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', port: 3000 }, start, stop)
  t.equal(s.name, 'Foo Bar')
  t.equal(s.protocol, 'tcp')
  t.equal(s.type, '_http._tcp')
  t.equal(s.host, os.hostname())
  t.equal(s.port, 3000)
  t.equal(s.fqdn, 'Foo Bar._http._tcp.local')
  t.equal(s.txt, undefined)
  t.equal(s.subtypes, undefined)
  t.equal(s.published, false)
  t.equal(s.start, start)
  t.equal(s.stop, stop)
  t.end()
})

test('protocol', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', port: 3000, protocol: 'udp' }, start, stop)
  t.deepEqual(s.protocol, 'udp')
  t.end()
})

test('host', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', port: 3000, host: 'example.com' }, start, stop)
  t.deepEqual(s.host, 'example.com')
  t.end()
})

test('txt', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', port: 3000, txt: { foo: 'bar' } }, start, stop)
  t.deepEqual(s.txt, { foo: 'bar' })
  t.end()
})

test('subtypes', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', port: 3000, subtypes: ['foo', 'bar'] }, start, stop)
  t.deepEqual(s.subtypes, ['foo', 'bar'])
  t.end()
})

test('_records() - minimal', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', protocol: 'tcp', port: 3000 }, start, stop)
  t.deepEqual(s.records(), [
    { data: s.fqdn, name: '_http._tcp.local', ttl: 28800, type: 'PTR' },
    { data: { port: 3000, target: os.hostname() }, name: s.fqdn, ttl: 120, type: 'SRV' },
    { data: [], name: s.fqdn, ttl: 4500, type: 'TXT' },
    { name: '_services._dns-sd._udp.local', type: 'PTR', ttl: 120, data: '_http._tcp.local' }
  ].concat(getAddressesRecords(s.host)))
  t.end()
})

test('_records() - everything', function (t) {
  const s = new Service({ name: 'Foo Bar', type: 'http', protocol: 'tcp', port: 3000, host: 'example.com', txt: { foo: 'bar' }, subtypes: ['foo', 'bar'] }, start, stop)
  t.deepEqual(s.records(), [
    { data: s.fqdn, name: '_http._tcp.local', ttl: 28800, type: 'PTR' },
    { data: { port: 3000, target: 'example.com' }, name: s.fqdn, ttl: 120, type: 'SRV' },
    { data: [Buffer.from('666f6f3d626172', 'hex')], name: s.fqdn, ttl: 4500, type: 'TXT' },
    { name: '_services._dns-sd._udp.local', type: 'PTR', ttl: 120, data: '_http._tcp.local' },
    { data: s.fqdn, name: '_foo._sub._http._tcp.local', ttl: 28800, type: 'PTR' },
    { data: s.fqdn, name: '_bar._sub._http._tcp.local', ttl: 28800, type: 'PTR' }
  ].concat(getAddressesRecords(s.host)))
  t.end()
})
