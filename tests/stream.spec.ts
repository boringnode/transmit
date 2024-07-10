/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { randomUUID } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { test } from '@japa/runner'
import { Stream } from '../src/stream.js'
import { Sink } from './mocks/sink.js'
import { Socket } from './mocks/socket.js'

test.group('Stream', () => {
  test('should get back the uid', async ({ assert }) => {
    const uid = randomUUID()
    const stream = new Stream(uid)

    assert.equal(stream.getUid(), uid)
  })

  test('should write multiple chunks to the stream', async ({ assert }) => {
    const stream = new Stream(randomUUID())
    const sink = new Sink()
    stream.pipe(sink)

    stream.writeMessage({ data: { channel: 'foo', payload: 'bar' } })
    stream.writeMessage({ data: { channel: 'baz', payload: 'qux' } })

    assert.equal(
      sink.content,
      [
        `:ok\n\n`,
        `data: {"channel":"foo","payload":"bar"}\n\n`,
        `data: {"channel":"baz","payload":"qux"}\n\n`,
      ].join('')
    )
  })

  test('should sets headers on the response', async ({ assert }) => {
    assert.plan(2)

    const stream = new Stream(randomUUID())
    const sink = new Sink()

    sink.assertWriteHead((statusCode, headers) => {
      assert.equal(statusCode, 200)
      assert.deepEqual(headers, {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream',
        'Expire': '0',
        'Pragma': 'no-cache',
        'X-Accel-Buffering': 'no',
      })
    })

    stream.pipe(sink)
  })

  test('should forward headers to the response', async ({ assert }) => {
    assert.plan(2)

    const stream = new Stream(randomUUID())
    const sink = new Sink()

    sink.assertWriteHead((statusCode, headers) => {
      assert.equal(statusCode, 200)
      assert.deepEqual(headers, {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream',
        'Expire': '0',
        'Pragma': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Foo': 'bar',
      })
    })

    stream.pipe(sink, undefined, { 'X-Foo': 'bar' })
  })

  test('should set the keep alive, no delay and timeout on the socket', async ({ assert }) => {
    const socket = new Socket()
    const incomingMessage = new IncomingMessage(socket)
    new Stream(randomUUID(), incomingMessage)

    assert.isTrue(socket.getKeepAlive())
    assert.isTrue(socket.getNoDelay())
    assert.equal(socket.getTimeout(), 0)
  })
})
