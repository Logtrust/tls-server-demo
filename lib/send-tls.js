'use strict';

const fs = require('fs');
const tls = require('tls');
const util = require('util');
const stdio = require('stdio');

const packet = Buffer.from('xzvzcvz4239472398472383294dasfad')
const proxyPort = 8899
const showInterval = 5000
let sent = 0
const opts = stdio.getopt({
  'conn': {key: 'c', args: 1, description: 'Number of connections', default: 1000},
})

const key = fs.readFileSync(__dirname + '/../data/agent1-key.pem')
const cert = fs.readFileSync(__dirname + '/../data/agent1-cert.pem')
const ca = fs.readFileSync(__dirname + '/../data/ca1-cert.pem')

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
  return util.format("%s MB (%s MB/s)", mb.toFixed(0), mbs.toFixed(1))
}

function showEvery() {
  const start = Date.now()
  setInterval(() => {
    const elapsed = Date.now() - start
    const seconds = elapsed / 1000
    console.log('Elapsed %s s, sent %s', seconds.toFixed(0), getTraffic(sent, elapsed))
  }, showInterval).unref()
}

function loadtest() {
  console.log('Sending data from %s clients', opts.conn)
  showEvery()
  for (let i = 0; i < opts.conn; i++) {
    createClient()
  }
}

loadtest()

