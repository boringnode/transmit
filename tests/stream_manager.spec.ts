/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { Stream } from '../src/stream.js'
import { StreamManager } from '../src/stream_manager.js'
import { Socket } from './mocks/socket.js'
import { IncomingMessage, ServerResponse } from 'node:http'

test.group('StreamManager', () => {
  test('should create stream', async ({ assert }) => {
    const socket = new Socket()
    const manager = new StreamManager()
    const request = new IncomingMessage(socket)
    const response = new ServerResponse(request)

    let channelConnected = false

    const stream = manager.createStream({
      uid: randomUUID(),
      request,
      response,
      context: {},
      onConnect() {
        channelConnected = true
      },
    })

    assert.instanceOf(stream, Stream)
    assert.isTrue(channelConnected)
  })

  test('should remove stream if the response end', async ({ assert }) => {
    const socket = new Socket()
    const manager = new StreamManager()
    const request = new IncomingMessage(socket)
    const response = new ServerResponse(request)

    let channelDisconnected = false

    manager.createStream({
      uid: randomUUID(),
      request,
      response,
      context: {},
      onDisconnect() {
        channelDisconnected = true
      },
    })

    response.emit('close')

    assert.isTrue(channelDisconnected)
  })

  test('should authorize channel', async ({ assert }) => {
    const manager = new StreamManager()

    manager.authorize('foo', () => true)
    manager.authorize('bar', () => false)

    assert.isTrue(await manager.verifyAccess('foo', {}))
    assert.isFalse(await manager.verifyAccess('bar', {}))
  })

  test('should return true if channel is not secured', async ({ assert }) => {
    const manager = new StreamManager()

    assert.isTrue(await manager.verifyAccess('foo', {}))
  })

  test('should return false if callback throws an error', async ({ assert }) => {
    const manager = new StreamManager()

    manager.authorize('foo', () => {
      throw new Error('Error')
    })

    assert.isFalse(await manager.verifyAccess('foo', {}))
  })

  test('should send context to the callback', async ({ assert }) => {
    assert.plan(2)

    const manager = new StreamManager()
    const context = { foo: 'bar' }

    manager.authorize('foo', (ctx) => {
      assert.deepEqual(ctx, context)
      return true
    })

    assert.isTrue(await manager.verifyAccess('foo', context))
  })

  test('should retrieve params from the channel', async ({ assert }) => {
    const manager = new StreamManager()

    manager.authorize('users/:id', (_ctx, params) => {
      assert.deepEqual(params, { id: '1' })
      return true
    })

    assert.isTrue(await manager.verifyAccess('users/1', {}))
  })

  test('should subscribe to a channel', async ({ assert }) => {
    const manager = new StreamManager()

    assert.isTrue(await manager.subscribe({ uid: randomUUID(), channel: 'foo', context: {} }))
  })

  test('should not subscribe to a channel if not authorized', async ({ assert }) => {
    const manager = new StreamManager()

    manager.authorize('foo', () => false)

    assert.isFalse(await manager.subscribe({ uid: randomUUID(), channel: 'foo', context: {} }))
  })

  test('should call onSubscribe callback', async ({ assert }) => {
    const manager = new StreamManager()
    let subscribed = false

    await manager.subscribe({
      uid: randomUUID(),
      channel: 'foo',
      context: {},
      onSubscribe() {
        subscribed = true
      },
    })

    assert.isTrue(subscribed)
  })

  test('should unsubscribe from a channel', async ({ assert }) => {
    const manager = new StreamManager()

    await manager.subscribe({ uid: randomUUID(), channel: 'foo', context: {} })
    assert.isTrue(await manager.unsubscribe({ uid: randomUUID(), channel: 'foo', context: {} }))
  })

  test('should call onUnsubscribe callback', async ({ assert }) => {
    const manager = new StreamManager()
    let unsubscribed = false

    await manager.subscribe({ uid: randomUUID(), channel: 'foo', context: {} })

    await manager.unsubscribe({
      uid: randomUUID(),
      channel: 'foo',
      context: {},
      onUnsubscribe() {
        unsubscribed = true
      },
    })

    assert.isTrue(unsubscribed)
  })

  test('should get all subscribers', async ({ assert }) => {
    const manager = new StreamManager()

    const socket1 = new Socket()
    const request1 = new IncomingMessage(socket1)
    const response1 = new ServerResponse(request1)
    const stream1 = manager.createStream({
      uid: randomUUID(),
      request: request1,
      response: response1,
      context: {},
    })

    const socket2 = new Socket()
    const request2 = new IncomingMessage(socket2)
    const response2 = new ServerResponse(request2)
    const stream2 = manager.createStream({
      uid: randomUUID(),
      request: request2,
      response: response2,
      context: {},
    })

    await manager.subscribe({ uid: stream1.getUid(), channel: 'foo' })
    await manager.subscribe({ uid: stream2.getUid(), channel: 'bar' })

    const subscribers = manager.getAllSubscribers()

    assert.equal(subscribers.size, 2)
  })

  test('should find subscribers for a given channel', async ({ assert }) => {
    const manager = new StreamManager()

    const socket1 = new Socket()
    const request1 = new IncomingMessage(socket1)
    const response1 = new ServerResponse(request1)
    const stream1 = manager.createStream({
      uid: randomUUID(),
      request: request1,
      response: response1,
      context: {},
    })

    const socket2 = new Socket()
    const request2 = new IncomingMessage(socket2)
    const response2 = new ServerResponse(request2)
    const stream2 = manager.createStream({
      uid: randomUUID(),
      request: request2,
      response: response2,
      context: {},
    })

    await manager.subscribe({ uid: stream1.getUid(), channel: 'foo' })
    await manager.subscribe({ uid: stream2.getUid(), channel: 'foo' })

    const subscribers = manager.findByChannel('foo')

    assert.equal(subscribers.size, 2)
  })
})
