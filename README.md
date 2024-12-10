<div align="center">
  <img src="https://github.com/user-attachments/assets/725d431b-760c-4f42-9b79-d522e963a0d7" alt="@boringnode/transmit">
</div>

<div align="center">

[![typescript-image]][typescript-url]
[![gh-workflow-image]][gh-workflow-url]
[![npm-image]][npm-url]
[![npm-download-image]][npm-download-url]
[![license-image]][license-url]

</div>

`@boringnode/transmit` is a framework-agnostic opinionated library to manage [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) in Node.js.

Here are a few things you should know before using this module.

<p>
👉 <strong>Unidirectional Communication:</strong> The data transmission occurs only from server to client, not the other way around.<br />
👉 <strong>Textual Data Only:</strong> SSE only supports the transmission of textual data, binary data cannot be sent.<br />
👉 <strong>HTTP Protocol:</strong> The underlying protocol used is the regular HTTP, not any special or proprietary protocol.<br />
</p>

## Installation

```sh
npm install @boringnode/transmit
```

## Usage

This module is designed to be used with any HTTP server framework. If you wish to write an adapter for a specific framework, please refer to the [Adapters](#adapters) section for examples.

### Broadcasting Data

Once the connection is established, you can send data to the client using the `transmit.broadcast` method.

```ts
// Given the "transmit" instance from the adapter
transmit.broadcast('global', { message: 'Hello' })
transmit.broadcast('chats/1/messages', { message: 'Hello' })
transmit.broadcast('users/1', { message: 'Hello' })
```

### Authorization

You can authorize the client to subscribe to a specific channel by using the `authorize` function. In the following example, we are using the [AdonisJS Framework](https://adonisjs.com/).

```ts
import transmit from '@adonisjs/transmit/services/main'
import Chat from '#models/chat'
import type { HttpContext } from '@adonisjs/core/http'

transmit.authorize<{ id: string }>('users/:id', (ctx: HttpContext, { id }) => {
  return ctx.auth.user?.id === +id
})

transmit.authorize<{ id: string }>('chats/:id/messages', async (ctx: HttpContext, { id }) => {
  const chat = await Chat.findOrFail(+id)
  
  return ctx.bouncer.allows('accessChat', chat)
})
```

### Syncing across multiple servers or instances

By default, broadcasting events works only within the context of an HTTP request. However, you can broadcast events from the background using the transmit service if you register a transport in your configuration.

The transport layer is responsible for syncing events across multiple servers or instances. It works by broadcasting any events (like broadcasted events, subscriptions, and un-subscriptions) to all connected servers or instances using a Message Bus.

The server or instance responsible for your client connection will receive the event and broadcast it to the client.

```ts
import { Transmit } from '@boringnode/transmit'
import { redis } from '@boringnode/transmit/transports'

const transmit = new Transmit({
  transport: {
    driver: redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'transmit',
    })
  }
})
```

## Transmit Client

You can listen for events on the client-side using the `@adonisjs/transmit-client` package. The package provides a `Transmit` class. The client use the [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) by default to connect to the server.

> [!NOTE]
> Even if you are not working with AdonisJS, you can still use the `@adonisjs/transmit-client` package.

```ts
import { Transmit } from '@adonisjs/transmit-client'

export const transmit = new Transmit({
  baseUrl: window.location.origin
})
```

### Subscribing to Channels

```ts
const subscription = transmit.subscription('chats/1/messages')
await subscription.create()
```

### Listening for Events

```ts
subscription.onMessage((data) => {
  console.log(data)
})

subscription.onMessageOnce(() => {
  console.log('I will be called only once')
})
```

### Stop Listening for Events

```ts
const stopListening = subscription.onMessage((data) => {
  console.log(data)
})

// Stop listening
stopListening()
```

### Unsubscribing from Channels

```ts
await subscription.delete()
```

## Adapters

Here are the available adapters for specific frameworks:

- [AdonisJS](https://github.com/adonisjs/transmit) (Official)

### Writing an Adapter

To write an adapter for a specific framework, you need to implement the following routes:

- `GET /__transmit/events`: This route is used to establish a connection between the client and the server. It returns a stream that will be used to send data to the client.
- `POST /__transmit/subscribe`: This route is used to subscribe the client to a specific channel.
- `POST /__transmit/unsubscribe`: This route is used to unsubscribe the client from a specific channel.

Here is an example of how you can implement the adapter for `fastify`:

```ts
import Fastify from 'fastify'
import { Transmit } from '@boringnode/transmit'

const fastify = Fastify({
  logger: true
})

const transmit = new Transmit({
  pingInterval: false,
  transport: null
})

/**
 * Register the client connection and keep it alive.
 */
fastify.get('__transmit/events', (request, reply) => {
  const uid = request.query.uid as string

  if (!uid) {
    return reply.code(400).send({ error: 'Missing uid' })
  }

  const stream = transmit.createStream({
    uid,
    context: { request, reply }
    request: request.raw, 
    response: reply.raw, 
    injectResponseHeaders: reply.getHeaders()
  })

  return reply.send(stream)
})

/**
 * Subscribe the client to a specific channel.
 */
fastify.post('__transmit/subscribe', async (request, reply) => {
  const uid = request.body.uid as string
  const channel = request.body.channel as string
  
  const success = await transmit.subscribe({
    uid, 
    channel, 
    context: { request, reply }
  })

  if (!success) {
    return reply.code(400).send({ error: 'Unable to subscribe to the channel' })
  }

  return reply.code(204).send()
})

/**
 * Unsubscribe the client from a specific channel.
 */
fastify.post('__transmit/unsubscribe', async (request, reply) => {
  const uid = request.body.uid as string
  const channel = request.body.channel as string

  const success = await transmit.unsubscribe({
    uid, 
    channel, 
    context: { request, reply }
  })

  if (!success) {
    return reply.code(400).send({ error: 'Unable to unsubscribe to the channel' })
  }

  return reply.code(204).send()
})

fastify.listen({ port: 3000 })
```

## Avoiding GZip Interference

When deploying applications that use `@adonisjs/transmit`, it’s important to ensure that GZip compression does not interfere with the `text/event-stream` content type used by Server-Sent Events (SSE). Compression applied to `text/event-stream` can cause connection issues, leading to frequent disconnects or SSE failures.

If your deployment uses a reverse proxy (such as Traefik or Nginx) or other middleware that applies GZip, ensure that compression is disabled for the `text/event-stream` content type.

### Example Configuration for Traefik

```plaintext
traefik.http.middlewares.gzip.compress=true
traefik.http.middlewares.gzip.compress.excludedcontenttypes=text/event-stream
traefik.http.routers.my-router.middlewares=gzip
```


[gh-workflow-image]: https://img.shields.io/github/actions/workflow/status/boringnode/transmit/checks.yml?branch=main&style=for-the-badge
[gh-workflow-url]: https://github.com/boringnode/transmit/actions/workflows/checks.yml
[npm-image]: https://img.shields.io/npm/v/@boringnode/transmit.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@boringnode/transmit
[npm-download-image]: https://img.shields.io/npm/dm/@boringnode/transmit?style=for-the-badge
[npm-download-url]: https://www.npmjs.com/package/@boringnode/transmit
[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: https://www.typescriptlang.org
[license-image]: https://img.shields.io/npm/l/@boringnode/transmit?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md
