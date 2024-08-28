/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { Transmit } from '../src/transmit.js'
import { StreamManager } from '../src/stream_manager.js'
import { makeStream } from './fixtures/stream.js'
import { TransportMessageType } from '../src/transport_message_type.js'
import { makeTransmitWithTransport, makeTransport } from './fixtures/transmit.js'

test.group('Transmit', () => {
  test('should return the manager instance', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })

    assert.instanceOf(transmit.getManager(), StreamManager)
  })

  test('should call the authorization callback', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()
    let authorized = false

    transmit.authorize('channel1', () => {
      authorized = true
      return true
    })

    await transmit.subscribe({ channel: 'channel1', uid })

    assert.isTrue(authorized)
  })

  test('should call the authorization callback with the context', async ({ assert }) => {
    assert.plan(1)

    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()

    transmit.authorize('channel1', (context) => {
      assert.equal(context, 'foo')
      return true
    })

    await transmit.subscribe({ channel: 'channel1', uid, context: 'foo' })
  })

  test('should authorize the subscription', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()

    transmit.authorize('channel1', () => {
      return true
    })

    const authorized = await transmit.subscribe({ channel: 'channel1', uid })

    assert.isTrue(authorized)
  })

  test('should not authorize the subscription', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()

    transmit.authorize('channel1', () => {
      return false
    })

    const authorized = await transmit.subscribe({ channel: 'channel1', uid })

    assert.isFalse(authorized)
  })

  test('should authorize with channel params', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()

    transmit.authorize<{ id: string }>('channel/:id', (_context, params) => {
      return params.id === '1'
    })

    const authorized = await transmit.subscribe({ channel: 'channel/1', uid })
    const refused = await transmit.subscribe({ channel: 'channel/2', uid })

    assert.isTrue(authorized)
    assert.isFalse(refused)
  })

  test('should emit an connect event', async ({ assert }, done) => {
    assert.plan(2)

    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()
    let connected = false

    transmit.on('connect', (params) => {
      connected = true

      assert.equal(params.uid, uid)
    })

    makeStream(transmit, uid)

    setTimeout(() => {
      assert.isTrue(connected)
      done()
    }, 0)
  }).waitForDone()

  test('should emit an subscribe event', async ({ assert }) => {
    assert.plan(3)

    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()
    let subscribed = false

    transmit.on('subscribe', (params) => {
      subscribed = true

      assert.equal(params.uid, uid)
      assert.equal(params.channel, 'users/1')
    })

    await transmit.subscribe({
      uid,
      channel: 'users/1',
    })

    assert.isTrue(subscribed)
  })

  test('should emit an unsubscribe event', async ({ assert }) => {
    assert.plan(3)

    const transmit = new Transmit({
      transport: null,
    })

    const uid = randomUUID()
    let unsubscribed = false

    transmit.on('unsubscribe', (params) => {
      unsubscribed = true

      assert.equal(params.uid, uid)
      assert.equal(params.channel, 'users/1')
    })

    await transmit.unsubscribe({
      uid,
      channel: 'users/1',
    })

    assert.isTrue(unsubscribed)
  })

  test('should emit a broadcast event when a message is broadcasted', async ({ assert }, done) => {
    assert.plan(3)

    const transmit = new Transmit({
      transport: null,
    })

    const payload = { foo: 'bar' }

    let broadcasted = false

    transmit.on('broadcast', (params) => {
      broadcasted = true

      assert.equal(params.channel, 'users/1')
      assert.equal(params.payload, payload)
    })

    transmit.broadcast('users/1', payload)

    setTimeout(() => {
      assert.isTrue(broadcasted)
      done()
    }, 0)
  }).waitForDone()

  test('should ping all subscribers', async ({ assert, cleanup }, done) => {
    assert.plan(1)

    const transmit = new Transmit({
      transport: null,
      pingInterval: 100,
    })

    cleanup(() => transmit.shutdown())

    const stream = makeStream(transmit, randomUUID())

    stream.on('data', (message: any) => {
      //? Ignore the first message
      if (message === '\n') return

      assert.include(message, '$$transmit/ping')
      done()
    })
  }).waitForDone()

  test('should broadcast a message to all listening clients', async ({ assert }) => {
    assert.plan(1)

    const transmit = new Transmit({
      transport: null,
    })

    const stream = makeStream(transmit)
    const stream2 = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    let dataReceived = false
    stream.on('data', (message: any) => {
      //? Ignore the first message
      if (message === '\n') return

      dataReceived = true
    })

    stream2.on('data', () => {
      assert.fail('Should not receive the broadcasted message')
    })

    transmit.broadcast('channel1', { message: 'hello' })

    assert.isTrue(dataReceived)
  })

  test('should broadcast a message to all listening clients except the sender', async ({
    assert,
  }) => {
    assert.plan(1)

    const transmit = new Transmit({
      transport: null,
    })

    const stream = makeStream(transmit)
    const stream2 = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    await transmit.subscribe({
      uid: stream2.getUid(),
      channel: 'channel1',
    })

    let dataReceived = false
    stream.on('data', (message: any) => {
      //? Ignore the first message
      if (message === '\n') return

      dataReceived = true
    })

    stream2.on('data', () => {
      assert.fail('Should not receive the broadcasted message')
    })

    transmit.broadcastExcept('channel1', { message: 'hello' }, stream2.getUid())

    assert.isTrue(dataReceived)
  })

  test('should not broadcast to ourself when sending to the bus', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)

    const stream = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    transmit.broadcast('channel1', { message: 'hello' })

    assert.lengthOf(transport.transport.receivedMessages, 0)
  })

  test('should broadcast to the bus when a client subscribe to a channel', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)
    makeTransmitWithTransport(transport)

    const stream = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    assert.lengthOf(transport.transport.receivedMessages, 1)
    assert.equal(transport.transport.receivedMessages[0].type, TransportMessageType.Subscribe)
  })

  test('should broadcast to the bus when a client unsubscribe a channel', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)

    makeTransmitWithTransport(transport)

    const stream = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    await transmit.unsubscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    assert.lengthOf(transport.transport.receivedMessages, 2)
    assert.equal(transport.transport.receivedMessages[1].type, TransportMessageType.Unsubscribe)
  })

  test('should broadcast to the bus when sending a message', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)
    makeTransmitWithTransport(transport)

    const stream = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    transmit.broadcast('channel1', { message: 'hello' })

    assert.lengthOf(transport.transport.receivedMessages, 2)
    assert.equal(transport.transport.receivedMessages[1].type, TransportMessageType.Broadcast)
  })

  test('second instance should receive the broadcasted message', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)
    const transmit2 = makeTransmitWithTransport(transport)

    const stream = makeStream(transmit)
    const stream2 = makeStream(transmit2)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    await transmit2.subscribe({
      uid: stream2.getUid(),
      channel: 'channel1',
    })

    let dataReceived = false
    stream.on('data', () => {
      dataReceived = true
    })

    transmit.broadcast('channel1', { message: 'hello' })

    assert.isTrue(dataReceived)
  })
})
