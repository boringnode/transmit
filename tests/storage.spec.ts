/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { Stream } from '../src/stream.js'
import { Storage } from '../src/storage.js'

test.group('Storage', () => {
  test('should secure a channel', async ({ assert }) => {
    const storage = new Storage()

    storage.secure('foo')
    assert.equal(storage.getSecuredChannelCount(), 1)
  })

  test('should get the secured channel definition', async ({ assert }) => {
    const storage = new Storage()

    storage.secure('foo')
    const definition = storage.getSecuredChannelDefinition('foo')

    assert.exists(definition)
    assert.equal(definition!.channel, 'foo')
  })

  test('should not get the secured channel definition using params', async ({ assert }) => {
    const storage = new Storage()

    storage.secure('foo/:id')
    const definition = storage.getSecuredChannelDefinition('foo/1')

    assert.exists(definition)
    assert.equal(definition!.channel, 'foo/:id')
    assert.equal(definition!.params.id, '1')
  })

  test('should add a stream to the storage', async ({ assert }) => {
    const stream1 = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream1)
    assert.equal(storage.getStreamCount(), 1)

    const stream2 = new Stream(randomUUID())
    storage.add(stream2)
    assert.equal(storage.getStreamCount(), 2)
  })

  test('should remove a stream from the storage', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream)
    assert.equal(storage.getStreamCount(), 1)

    storage.remove(stream)
    assert.equal(storage.getStreamCount(), 0)
  })

  test('should subscribe a channel to a stream', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream)

    assert.isTrue(storage.subscribe(stream.getUid(), 'foo'))
    assert.isTrue(storage.subscribe(stream.getUid(), 'bar'))
  })

  test('should not subscribe a channel to a stream that does not exist', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    assert.isFalse(storage.subscribe(stream.getUid(), 'foo'))
  })

  test('should unsubscribe a channel from a stream', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream)
    storage.subscribe(stream.getUid(), 'foo')

    assert.isTrue(storage.unsubscribe(stream.getUid(), 'foo'))
  })

  test('should not unsubscribe a channel from a stream that does not exist', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    assert.isFalse(storage.unsubscribe(stream.getUid(), 'foo'))
  })

  test('should find all subscribers to a channel', async ({ assert }) => {
    const stream1 = new Stream(randomUUID())
    const stream2 = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream1)
    storage.add(stream2)

    storage.subscribe(stream1.getUid(), 'foo')
    storage.subscribe(stream2.getUid(), 'foo')

    const subscribers = storage.findByChannel('foo')
    assert.equal(subscribers.size, 2)
  })

  test('should return the channel of a client', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream)
    storage.subscribe(stream.getUid(), 'foo')

    const channels = storage.getChannelByClient(stream.getUid())

    assert.exists(channels)
    assert.isTrue(channels!.has('foo'))
  })

  test('should return all subscribers', async ({ assert }) => {
    const stream1 = new Stream(randomUUID())
    const stream2 = new Stream(randomUUID())
    const storage = new Storage()

    storage.add(stream1)
    storage.add(stream2)

    storage.subscribe(stream1.getUid(), 'foo')
    storage.subscribe(stream2.getUid(), 'foo')

    const subscribers = storage.getAllSubscribers()
    assert.equal(subscribers.size, 2)
  })
})
