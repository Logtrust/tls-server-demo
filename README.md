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

## `secure` And `secureSocket` Events

According to [the docs](https://nodejs.org/api/tls.html#tls_event_secureconnect),
the `TLSSocket` class should emit a `secureConnect` event
when the connection is secure.
In practice however only a `secure` event is emitted,
which is not even documented anywhere.

This issue has been reported
[here](https://github.com/nodejs/node/issues/10555)
and
[here](https://github.com/nodejs/node/issues/13368).

