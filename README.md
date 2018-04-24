# tls-server-demo

Securing TLS sockets on a plain (non-TLS) socket server.

Shows several bugs in the current implementations,
both in 8 LTS and upcoming 10.

## Securing Plain Sockets

Sometimes there is a need to secure existing sockets,
instead of creating a secure socket.
The old recommended way of doing it was using
[`tls.createSecurePair()`](https://nodejs.org/api/tls.html#tls_tls_createsecurepair_context_isserver_requestcert_rejectunauthorized_options),
which raises a `secure` event once the connection was secured.

```js
const server = net.createServer(conn => {
  const pair = tls.createSecurePair(options)
  pair.encrypted.pipe(conn)
  conn.pipe(pair.encrypted)
  pair.on('secure', () => console.log('secured'))
  pair.cleartext.on('data', data => console.log(data))
  //...
})
```

This function has been deprecated in favor of
[`new tls.TLSSocket()`](https://nodejs.org/api/tls.html#tls_new_tls_tlssocket_socket_options):

```js
const server = net.createServer(conn => {
  const serverSocket = new tls.TLSSocket(conn, options)
  serverSocket.on('data', data => console.log(data))
  //...
})
```

## Bug: `secure` And `secureSocket` Events

According to [the docs](https://nodejs.org/api/tls.html#tls_event_secureconnect),
the `TLSSocket` class should emit a `secureConnect` event
when the connection is secure.
In practice however only a `secure` event is emitted,
which is not even documented anywhere.

This issue has been reported
[here](https://github.com/nodejs/node/issues/10555)
and
[here](https://github.com/nodejs/node/issues/13368).

The script `lib/simple-tls-new.js` shows the issue: a connection is secured
using `new tls.TLSSocket()`, and only the `secure` event is emitted
in the server.

## Performance Regression: `tls.createSecurePair()` With Node.js v10.0.0 pre

When creating many sockets and securing them with `tls.createSecurePair()`,
packets are buffered in the `SecurePair` class depending on system load.
When system load is high,
packets are aggregated in order to send less `data` events to the stream.

In the upcoming v10, after the great work by @addaleax in https://github.com/nodejs/node/pull/17882,
`tls.createSecurePair()` uses `new tls.TLSSocket()` internally.
This clears up a lot of messy code,
but this buffering capability is lost.
As a result, the secured server becomes less and less responsible.

The script `lib/combined-tls.js` shows the issue.

### Script Usage

Run `node lib/combined-tls.js --help` for a summary of options.

#### `--new -n`

Use `new tls.TLSSocket()` instead of `tls.createSecurePair()`. Useful for testing with v8 or v9 only.

#### `--readable -r`

Use `readable` event (non-flowing mode) instead of `data` (flowing mode) for proxy streams.

#### `--conn -n`

Set the number of client connections, default is 2000.
The script will start (cpus - 1) workers, so running stress will depend on the specs of the target machine.
This parameter allows modifying the number of connections.

