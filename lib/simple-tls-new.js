'use strict';

const fs = require('fs');
const net = require('net');
const tls = require('tls');
const util = require('util');

const packet = Buffer.from('xzvzcvz4239472398472383294dasfad')
const port = 8899
const showInterval = 5000
let received = 0
let sent = 0

const key = fs.readFileSync(__dirname + '/../data/agent1-key.pem')
const cert = fs.readFileSync(__dirname + '/../data/agent1-cert.pem')
const ca = fs.readFileSync(__dirname + '/../data/ca1-cert.pem')

function createServer(callback) {
  const server = net.createServer(conn => {
    conn.on('error', error => console.error('Server conn error: %s', error))
    const serverSocket = new tls.TLSSocket(conn, {
      key,
      cert,
      ca,
      isServer: true,
      requestCert: true,
      rejectUnauthorized: true,
    });
    serverSocket.on('readable', () => {
      const data = serverSocket.read()
      if (data) {
        received += data.length
      }
    });
    serverSocket.on('error', e => console.error('Socket error: %s', e))

    serverSocket.once('secure', () => {
      console.log('Connection is secured with secure')
    })
    serverSocket.once('secureConnect', () => {
      console.log('Connection is secured with secureConnect')
    })
  })
  server.on('error', error => console.error('Server error: %s', error))
  server.listen(port, callback)
  server.unref()
}

function createClient(callback) {
  const clientSocket = tls.connect({
    port,
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
    sendPacket(client)
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
    console.log('Elapsed %s s, sent %s, received %s', seconds.toFixed(0),
      getTraffic(sent, elapsed), getTraffic(received, elapsed))
  }, showInterval).unref()
}

function loadtest() {
  showEvery()
  createServer(() => {
    createClient()
  })
}

loadtest()

