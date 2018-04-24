'use strict';

const net = require('net');
const util = require('util');
const stdio = require('stdio');

const serverPort = 24819
const showInterval = 5000
let received = 0
const opts = stdio.getopt({
  'readable': {key: 'r', description: 'Use readable events', default: false},
})

function createServer() {
  const server = net.createServer(conn => {
    conn.on('error', error => console.error('Server conn error: %s', error))
    if (opts.readable) {
      conn.on('readable', () => {
        const data = conn.read()
        if (data) {
          received += data.length
        }
      });
    } else {
      conn.on('data', data => received += data.length)
    }
  })
  server.on('error', error => console.error('Server error: %s', error))
  server.listen(serverPort)
}

function getTraffic(bytes, elapsed) {
  const mb = bytes / 1e6
  const mbs = bytes / (elapsed * 1000)
  return util.format("%s MB (%s MB/s)", mb.toFixed(0), mbs.toFixed(0))
}

function showEvery() {
  const start = Date.now()
  setInterval(() => {
    const elapsed = Date.now() - start
    const seconds = elapsed / 1000
    console.log('Elapsed %s s, received %s',
      seconds.toFixed(0), getTraffic(received, elapsed))
  }, showInterval).unref()
}

function loadtest() {
  console.log('Using %s event', opts.readable ? 'readable' : 'data')
  showEvery()
  createServer()
}

loadtest()

