'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const tls = require('tls');
const util = require('util');
const stdio = require('stdio');
const cluster = require('cluster');

const packet = Buffer.from('xzvzcvz4239472398472383294dasfad')
const proxyPort = 8899
const serverPort = 24819
const showInterval = 5000
let secured = 0
let received = 0
let sent = 0
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

function createServer(callback) {
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
  server.listen(serverPort, callback)
  server.unref()
}

function createProxy(callback) {
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
  server.listen(proxyPort, callback)
  server.unref()
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

function createClient() {
  const clientSocket = tls.connect({
    port: proxyPort,
    ca,
    key,
    cert,
    isServer: false,
    rejectUnauthorized: false,
  }, () => sendPacket(clientSocket))
  clientSocket.on('error', error => console.error('Client error: %s', error));
  clientSocket.unref()
}

function sendPacket(client) {
  client.write(packet, () => {
    sent += packet.length
    setImmediate(() => sendPacket(client))
  })
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
    console.log('Elapsed %s s, sent %s, proxied %s, received %s',
      seconds.toFixed(0), getTraffic(sent, elapsed),
      getTraffic(proxyPipe.piped, elapsed), getTraffic(received, elapsed))
    const rate = proxyPipe.piped / proxyPipe.events;
    console.log('Events %s (%s bytes/event)', proxyPipe.events, rate.toFixed(0))
  }, showInterval).unref()
}

function loadtest() {
  if (cluster.isMaster) {
    console.log('Using %s event on %s', opts.readable ? 'readable' : 'data',
      opts.pair ? 'createSecurePair()' : 'new TLSSocket()')
    showEvery()
    createServer(() => {
      createProxy(() => {
        const cpus = os.cpus().length
        for (let i = 0; i < cpus - 1; i++) {
          cluster.fork()
        }
      })
    })
  } else {
    console.log('Sending events on %s connections', opts.conn)
    for (let i = 0; i < opts.conn; i++) {
      createClient()
    }
  }
}

loadtest()

