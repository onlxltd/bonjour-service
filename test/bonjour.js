'use strict';

const os = require('os');
const dgram = require('dgram');
const tape = require('tape');
const afterAll = require('after-all');
const { Service } = require('../dist/lib/service');
const { Bonjour } = require('../dist');
const wifi = require('node-wifi');

// Initialize Wi-Fi connection
wifi.init({
  iface: null // automatically select the active Wi-Fi interface
});

let previousNetwork = null;

// Check Wi-Fi connection every 5 seconds
setInterval(() => {
  wifi.getCurrentConnections().then(networks => {
    const currentNetwork = networks[0]; // assuming a single active connection
    if (previousNetwork && currentNetwork.ssid !== previousNetwork.ssid) {
      console.log(`Network changed from ${previousNetwork.ssid} to ${currentNetwork.ssid}`);
      // Perform actions like restarting services or re-publishing them
      restartServices(); // Example function to restart services
    }
    previousNetwork = currentNetwork;
  }).catch(err => {
    console.error('Error retrieving network information:', err);
  });
}, 5000);

function restartServices() {
  // Example logic to restart or publish services when Wi-Fi changes
  console.log('Restarting services...');
}

// Utility Functions
const getAddresses = function () {
  const addresses = [];
  const itrs = Object.values(os.networkInterfaces());
  for (const addrs of itrs) {
    for (const { internal, mac, address } of addrs) {
      if (internal === false && mac !== '00:00:00:00:00:00' && !addresses.includes(address)) {
        addresses.push(address);
      }
    }
  }
  return addresses;
};

const filterDuplicates = (input) => input.reduce((prev, curr) => {
  const obj = prev;
  if (!obj.includes(curr)) prev.push(curr);
  return obj;
}, []);

const port = function (cb) {
  const s = dgram.createSocket('udp4');
  s.bind(0, function () {
    const port = s.address().port;
    s.on('close', function () {
      cb(port);
    });
    s.close();
  });
};

// Helper function for testing
const test = function (name, fn) {
  tape(name, function (t) {
    port(function (p) {
      fn(new Bonjour({ ip: '127.0.0.1', port: p, multicast: false }), t);
    });
  });
};

// Test Cases

// Test case 1: bonjour.publish
test('bonjour.publish', function (bonjour, t) {
  const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 });
  t.ok(service instanceof Service);
  t.equal(service.published, false);
  service.on('up', function () {
    t.equal(service.published, true);
    bonjour.destroy();
    t.end();
  });
});

// Test case 2: bonjour.unpublishAll
test('bonjour.unpublishAll', function (bonjour, t) {
  t.test('published services', function (t) {
    const service = bonjour.publish({ name: 'foo', type: 'bar', port: 3000 });
    service.on('up', function () {
      bonjour.unpublishAll(function (err) {
        t.error(err);
        t.equal(service.published, false);
        bonjour.destroy();
        t.end();
      });
    });
  });

  t.test('no published services', function (t) {
    bonjour.unpublishAll(function (err) {
      t.error(err);
      t.end();
    });
  });
});

// Test case 3: bonjour.find
test('bonjour.find', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.find({ type: 'test' });
    let ups = 0;

    browser.on('up', function (s) {
      if (s.name === 'Foo Bar') {
        t.equal(s.name, 'Foo Bar');
        t.equal(s.fqdn, 'Foo Bar._test._tcp.local');
        t.deepEqual(s.txt, {});
        t.deepEqual(s.rawTxt, []);
      } else {
        t.equal(s.name, 'Baz');
        t.equal(s.fqdn, 'Baz._test._tcp.local');
        t.deepEqual(s.txt, { foo: 'bar' });
        t.deepEqual(s.rawTxt, [Buffer.from('666f6f3d626172', 'hex')]);
      }
      t.equal(s.host, os.hostname());
      t.equal(s.port, 3000);
      t.equal(s.type, 'test');
      t.equal(s.protocol, 'tcp');
      t.equal(s.referer.address, '127.0.0.1');
      t.equal(s.referer.family, 'IPv4');
      t.ok(Number.isFinite(s.referer.port));
      t.ok(Number.isFinite(s.referer.size));
      t.deepEqual(s.subtypes, []);
      t.deepEqual(filterDuplicates(s.addresses.sort()), getAddresses().sort());

      if (++ups === 2) {
        setTimeout(function () {
          bonjour.destroy();
          t.end();
        }, 50);
      }
    });
  });

  bonjour.publish({ name: 'Foo Bar', type: 'test', port: 3000 }).on('up', next());
  bonjour.publish({ name: 'Invalid', type: 'test2', port: 3000 }).on('up', next());
  bonjour.publish({ name: 'Baz', type: 'test', port: 3000, txt: { foo: 'bar' } }).on('up', next());
});

// Test case 4: bonjour.find - binary txt
test('bonjour.find - binary txt', function (bonjour, t) {
  const next = afterAll(function () {
    const browser = bonjour.find({ type: 'test', txt: { binary: true } });

    browser.on('up', function (s) {
      t.equal(s.name, 'Foo');
      t.deepEqual(s.txt, { bar: 'buz' });
      t.deepEqual(s.rawTxt, [Buffer.from('6261723d62757a', 'hex')]);
      bonjour.destroy();
      t.end();
    });
  });

  bonjour.publish({ name: 'Foo', type: 'test', port: 3000, txt: { bar: 'buz' }, rawTxt: [Buffer.from('6261723d62757a', 'hex')] }).on('up', next());
});

// Test case 5: bonjour.findOne
test('bonjour.findOne', function (bonjour, t) {
  const next = afterAll(function () {
    bonjour.findOne({ type: 'test' }, function (s) {
      t.equal(s.name, 'Foo Bar');
      t.equal(s.fqdn, 'Foo Bar._test._tcp.local');
      t.deepEqual(s.txt, {});
      t.equal(s.host, os.hostname());
      t.equal(s.port, 3000);
      t.equal(s.type, 'test');
      t.equal(s.protocol, 'tcp');
      t.deepEqual(s.subtypes, []);
      t.deepEqual(filterDuplicates(s.addresses.sort()), getAddresses().sort());
      bonjour.destroy();
      t.end();
    });
  });

  bonjour.publish({ name: 'Foo Bar', type: 'test', port: 3000 }).on('up', next());
  bonjour.publish({ name: 'Invalid', type: 'test2', port: 3000 }).on('up', next());
});
