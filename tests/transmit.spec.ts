/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright BoringNode
 */

import { randomUUID } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { test } from '@japa/runner'
import { Transmit } from '../src/transmit.js'
import { StreamManager } from '../src/stream_manager.js'
import { Socket } from './mocks/socket.js'
import { makeStream } from './fixtures/stream.js'
import { TransportMessageType } from '../src/transport_message_type.js'
import { makeTransmitWithTransport, makeTransport } from './fixtures/transmit.js'

function makeConnectedStream(transmit: Transmit<unknown>) {
  const socket = new Socket()
  const request = new IncomingMessage(socket)
  const response = new ServerResponse(request)
  response.assignSocket(socket)

  return transmit.createStream({
    uid: randomUUID(),
    request,
    response,
    context: {},
  })
}

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

    const stream = makeStream(transmit)

    transmit.authorize('channel1', () => {
      return true
    })

    const authorized = await transmit.subscribe({ channel: 'channel1', uid: stream.getUid() })

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

    const stream = makeStream(transmit)

    transmit.authorize<{ id: string }>('channel/:id', (_context, params) => {
      return params.id === '1'
    })

    const authorized = await transmit.subscribe({ channel: 'channel/1', uid: stream.getUid() })
    const refused = await transmit.subscribe({ channel: 'channel/2', uid: stream.getUid() })

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

  test('should close all open streams and emit disconnect events', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })
    const stream1 = makeConnectedStream(transmit)
    const stream2 = makeConnectedStream(transmit)
    const disconnectedUids: string[] = []
    const disconnected = new Promise<void>((resolve) => {
      transmit.on('disconnect', ({ uid }) => {
        disconnectedUids.push(uid)
        if (disconnectedUids.length === 2) resolve()
      })
    })

    await transmit.subscribe({ uid: stream1.getUid(), channel: 'news' })
    await transmit.subscribe({ uid: stream2.getUid(), channel: 'news' })

    transmit.closeAllStreams()
    transmit.closeAllStreams()
    await disconnected

    assert.sameMembers(disconnectedUids, [stream1.getUid(), stream2.getUid()])
    assert.deepEqual(transmit.getSubscribersFor('news'), [])
    transmit.closeAllStreams()
  })

  test('should reject streams created after all streams are closed', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })
    const socket = new Socket()
    const request = new IncomingMessage(socket)
    const response = new ServerResponse(request)
    response.assignSocket(socket)
    const responseErrors: Error[] = []
    socket.on('error', (error) => responseErrors.push(error))
    response.on('error', (error) => responseErrors.push(error))
    const uid = randomUUID()

    transmit.closeAllStreams()

    const stream = transmit.createStream({ uid, request, response, context: {} })
    const subscribed = await transmit.subscribe({ uid, channel: 'news' })

    assert.isTrue(response.destroyed)
    assert.isTrue(socket.destroyed)
    assert.isTrue(stream.destroyed)
    assert.isFalse(subscribed)
    assert.deepEqual(responseErrors, [])
  })

  test('should close all open streams during shutdown', async ({ assert }) => {
    const transmit = new Transmit({
      transport: null,
    })
    const stream = makeConnectedStream(transmit)
    const disconnectedUids: string[] = []

    transmit.on('disconnect', ({ uid }) => {
      disconnectedUids.push(uid)
    })
    await transmit.subscribe({ uid: stream.getUid(), channel: 'news' })

    await transmit.shutdown()
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.deepEqual(disconnectedUids, [stream.getUid()])
    assert.deepEqual(transmit.getSubscribersFor('news'), [])
  })

  test('should emit an subscribe event', async ({ assert }) => {
    assert.plan(3)

    const transmit = new Transmit({
      transport: null,
    })

    const stream = makeStream(transmit)
    let subscribed = false

    transmit.on('subscribe', (params) => {
      subscribed = true

      assert.equal(params.uid, stream.getUid())
      assert.equal(params.channel, 'users/1')
    })

    await transmit.subscribe({
      uid: stream.getUid(),
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

    assert.lengthOf(transport.transport.receivedMessages, 1)
    assert.equal(transport.transport.receivedMessages[0].type, TransportMessageType.Broadcast)
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

  test('should broadcast to other instances except the excluded uids', async ({ assert }) => {
    const transmit = makeTransmitWithTransport(makeTransport())
    const transmit2 = makeTransmitWithTransport(makeTransport())

    const sender = makeStream(transmit2)
    const excluded = makeStream(transmit2)
    const receiver = makeStream(transmit2)

    for (const stream of [sender, excluded, receiver]) {
      await transmit2.subscribe({ uid: stream.getUid(), channel: 'channel1' })
    }

    const received: string[] = []
    for (const stream of [sender, excluded, receiver]) {
      stream.on('data', (message: any) => {
        if (message !== '\n') received.push(stream.getUid())
      })
    }

    transmit.broadcastExcept('channel1', { message: 'hello' }, sender.getUid())
    transmit.broadcastExcept('channel1', { message: 'hello' }, [sender.getUid(), excluded.getUid()])

    assert.deepEqual(received, [excluded.getUid(), receiver.getUid(), receiver.getUid()])
  })

  test('should shut down before the transport has subscribed', async ({ assert, cleanup }) => {
    // Like the Redis transport before its connection is ready: subscriptions
    // stay pending, and disconnecting rejects them.
    const pending: Array<(error: Error) => void> = []
    const transport = makeTransport().transport
    transport.subscribe = () => new Promise((_, reject) => pending.push(reject))
    let cancelled = 0
    transport.disconnect = async () => {
      for (const reject of pending) {
        reject(new Error('Connection is closed.'))
        cancelled++
      }
    }

    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    cleanup(() => void process.off('unhandledRejection', onUnhandled))

    const transmit = new Transmit({ transport: null }, transport)
    await transmit.shutdown()
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(cancelled, 2)
    assert.deepEqual(unhandled, [])
  })

  test('should subscribe and unsubscribe a stream held by another instance', async ({ assert }) => {
    const transmit = makeTransmitWithTransport(makeTransport())
    const holder = makeTransmitWithTransport(makeTransport())
    const stream = makeStream(holder)

    // The receiving instance authorizes; the holder must not ask again.
    transmit.authorize('relayed', () => true)
    holder.authorize('relayed', () => false)

    const events: string[] = []
    transmit.on('subscribe', ({ context }) => events.push(`receiver:${context}`))
    holder.on('subscribe', ({ context }) => events.push(`holder:${context}`))

    // Watches the channel that older versions broadcast to clients.
    const broadcastChannel = makeTransport().transport.setId('observer')
    const broadcastMessages: unknown[] = []
    await broadcastChannel.subscribe('transmit::broadcast', (message) => {
      broadcastMessages.push(message)
    })

    const received: unknown[] = []
    stream.on('data', (message: any) => {
      if (message !== '\n') received.push(message)
    })

    const subscribed = await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'relayed',
      context: 'request',
    })
    assert.isTrue(subscribed)
    transmit.broadcast('relayed', { message: 'first' })

    assert.isTrue(await transmit.unsubscribe({ uid: stream.getUid(), channel: 'relayed' }))
    transmit.broadcast('relayed', { message: 'second' })

    await broadcastChannel.disconnect()

    assert.lengthOf(received, 1)
    assert.include(String(received[0]), 'first')
    assert.deepEqual(holder.getSubscribersFor('relayed'), [])
    assert.deepEqual(events, ['receiver:request'])
    assert.lengthOf(broadcastMessages, 2)
    assert.notInclude(JSON.stringify(broadcastMessages), stream.getUid())
  })

  test('should apply sequential changes in order through different instances', async ({
    assert,
  }) => {
    const slowTransport = makeTransport()
    const slow = makeTransmitWithTransport(slowTransport)
    const fast = makeTransmitWithTransport(makeTransport())
    const holder = makeTransmitWithTransport(makeTransport())
    const stream = makeStream(holder)

    // The slow instance takes 20ms to reach the bus.
    const publish = slowTransport.transport.publish.bind(slowTransport.transport)
    slowTransport.transport.publish = async (channel, message) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return publish(channel, message)
    }

    await holder.subscribe({ uid: stream.getUid(), channel: 'ordered' })
    await slow.unsubscribe({ uid: stream.getUid(), channel: 'ordered' })
    await fast.subscribe({ uid: stream.getUid(), channel: 'ordered' })
    await new Promise((resolve) => setTimeout(resolve, 40))

    assert.deepEqual(holder.getSubscribersFor('ordered'), [stream.getUid()])
  })

  test('should not relay a subscription the receiving instance refuses', async ({ assert }) => {
    const transmit = makeTransmitWithTransport(makeTransport())
    const holder = makeTransmitWithTransport(makeTransport())
    const stream = makeStream(holder)

    transmit.authorize('private', () => false)
    holder.authorize('private', () => true)

    assert.isFalse(await transmit.subscribe({ uid: stream.getUid(), channel: 'private' }))
    assert.deepEqual(holder.getSubscribersFor('private'), [])
  })

  test('should refuse a stream it does not hold without a transport', async ({ assert }) => {
    const transmit = new Transmit({ transport: null })

    assert.isFalse(await transmit.subscribe({ uid: randomUUID(), channel: 'channel1' }))
  })

  test('should broadcast falsy payloads without converting them to empty object', async ({
    assert,
  }) => {
    const transmit = new Transmit({
      transport: null,
    })

    const stream = makeStream(transmit)

    await transmit.subscribe({
      uid: stream.getUid(),
      channel: 'channel1',
    })

    const receivedPayloads: any[] = []
    stream.on('data', (message: any) => {
      if (message === '\n') return

      const parsed = JSON.parse(message.replace('data: ', ''))
      receivedPayloads.push(parsed.payload)
    })

    transmit.broadcast('channel1', 0)
    transmit.broadcast('channel1', false)
    transmit.broadcast('channel1', '')

    assert.deepEqual(receivedPayloads, [0, false, ''])
  })

  test('should return all subscribers for a channel', async ({ assert }) => {
    const transport = makeTransport()
    const transmit = makeTransmitWithTransport(transport)

    const stream1 = makeStream(transmit)
    const stream2 = makeStream(transmit)
    const stream3 = makeStream(transmit)
    const stream4 = makeStream(transmit)
    const stream5 = makeStream(transmit)

    await transmit.subscribe({
      uid: stream1.getUid(),
      channel: 'channel1',
    })

    await transmit.subscribe({
      uid: stream2.getUid(),
      channel: 'channel1',
    })

    await transmit.subscribe({
      uid: stream3.getUid(),
      channel: 'channel2',
    })

    await transmit.subscribe({
      uid: stream4.getUid(),
      channel: 'channel2',
    })

    await transmit.subscribe({
      uid: stream5.getUid(),
      channel: 'channel2',
    })

    const uuidsChannel1 = transmit.getSubscribersFor('channel1')
    const uuidsChannel2 = transmit.getSubscribersFor('channel2')

    assert.lengthOf(uuidsChannel1, 2)
    assert.equal(uuidsChannel1[0], stream1.getUid())
    assert.equal(uuidsChannel1[1], stream2.getUid())

    assert.lengthOf(uuidsChannel2, 3)
    assert.equal(uuidsChannel2[0], stream3.getUid())
    assert.equal(uuidsChannel2[1], stream4.getUid())
    assert.equal(uuidsChannel2[2], stream5.getUid())
  })
})
