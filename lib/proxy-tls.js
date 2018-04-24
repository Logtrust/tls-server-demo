'use strict';

const fs = require('fs');
const net = require('net');
const tls = require('tls');
const util = require('util');
const stdio = require('stdio');

const proxyPort = 8899
const serverPort = 24819
const showInterval = 5000
let secured = 0
const opts = stdio.getopt({
  'readable': {key: 'r', description: 'Use readable events', default: false},
  'pair': {key: 'p', description: 'Use createSecurePair()', default: false},
  'conn': {key: 'c', args: 1, description: 'Number of connections', default: 1000},
})

const key = fs.readFileSync(__dirname + '/../data/agent1-key.pem')
const cert = fs.readFileSync(__dirname + '/../data/agent1-cert.pem')
const ca = fs.readFileSync(__dirname + '/../data/ca1-cert.pem')

class Pipe {

  constructor() {
    this.piped = 0
    this.events = 0
    this.paused = false
  }

  pipe(first, second) {
    if (opts.readable) {
      first.on('readable', () => {
        this.events += 1
        if (this.paused) return
        const data = first.read()
        if (!data) return
        this.piped += data.length
        if (!second.write(data)) {
          this.paused = true
        }
      })
      second.on('drain', () => this.paused = false)
    } else {
      first.on('data', data => {
        this.events += 1
        this.piped += data.length
        if (!second.write(data)) {
          first.pause()
        }
      })
      second.on('drain', () => first.resume())
    }
  }
}

let proxyPipe = new Pipe()

function createProxy() {
  const server = net.createServer(conn => {
    conn.on('error', error => console.error('Proxy conn error: %s', error))
    const client = net.connect(serverPort, () => {
      const options = {
        key,
        cert,
        ca,
        isServer: true,
        requestCert: true,
        rejectUnauthorized: true,
      }
      if (opts.pair) {
        const serverCtxt = tls.createSecureContext(options);
        const serverPair = tls.createSecurePair(serverCtxt, true, true, false);
        new Pipe().pipe(conn, serverPair.encrypted)
        new Pipe().pipe(serverPair.encrypted, conn)
        serverPair.on('error', error => {
          console.error('Pair error: %s', error)
          serverPair.destroy()
        })
        warnWhenSecure(serverPair)
        proxyPipe.pipe(serverPair.cleartext, client)
      } else {
        const serverSocket = new tls.TLSSocket(conn, options)
        serverSocket.on('error', e => console.error('Socket error: %s', e))
        warnWhenSecure(serverSocket)
        proxyPipe.pipe(serverSocket, client)
      }
    })
    client.on('error', error => console.error('Client error: %s', error))
  })
  server.on('error', error => console.error('Proxy error: %s', error))
  server.listen(proxyPort)
}

function warnWhenSecure(socket) {
  socket.once('secure', () => {
    secured += 1
    if (secured % 100 === 0) {
      console.log('Pair %s is secured 1', secured)
    }
  })
  socket.once('secureConnect', () => {
    secured += 1
    if (secured % 100 === 0) {
      console.log('Pair %s is secured 2', secured)
    }
  })
}

function getTraffic(bytes, elapsed) {
  const mb = bytes / 1e6
  return getRate(mb, elapsed, 'MB')
}

function getRate(value, elapsed, units) {
  const rate = value / (elapsed / 1000)
  return util.format("%s %s (%s %s/s)", value.toFixed(0), units, rate.toFixed(0), units)
}

function showEvery() {
  const start = Date.now()
  setInterval(() => {
    const elapsed = Date.now() - start
    const seconds = elapsed / 1000
    console.log('Elapsed %s s, proxied %s, %s', seconds.toFixed(0),
      getTraffic(proxyPipe.piped, elapsed), getRate(proxyPipe.events, elapsed, 'evt'))
  }, showInterval).unref()
}

function loadtest() {
  console.log('Using %s event on %s', opts.readable ? 'readable' : 'data',
    opts.pair ? 'createSecurePair()' : 'new TLSSocket()')
  showEvery()
  createProxy()
}

loadtest()

