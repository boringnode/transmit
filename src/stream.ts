/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { Transform } from 'node:stream'
import { dataToString } from './utils.js'
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http'
import type { Broadcastable } from './types/main.js'

interface Message {
  data: Broadcastable
}

interface WriteHeaders {
  writeHead?(statusCode: number, headers?: OutgoingHttpHeaders): WriteHeaders
  flushHeaders?(): void
}

export type HeaderStream = NodeJS.WritableStream & WriteHeaders

export class Stream extends Transform {
  readonly #uid: string

  constructor(uid: string, request?: IncomingMessage) {
    super({ objectMode: true })

    this.#uid = uid

    if (request?.socket) {
      request.socket.setKeepAlive(true)
      request.socket.setNoDelay(true)
      request.socket.setTimeout(0)
    }
  }

  getUid() {
    return this.#uid
  }

  pipe<T extends HeaderStream>(
    destination: T,
    options?: { end?: boolean },
    forwardHeaders?: Record<string, any>
  ): T {
    if (destination.writeHead) {
      // @see https://github.com/dunglas/mercure/blob/9e080c8dc9a141d4294412d14efdecfb15bf7f43/subscribe.go#L219
      destination.writeHead(200, {
        ...forwardHeaders,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream',
        'Expire': '0',
        'Pragma': 'no-cache',
        // @see https://www.nginx.com/resources/wiki/start/topics/examples/x-accel/#x-accel-buffering
        'X-Accel-Buffering': 'no',
      })

      destination.flushHeaders?.()
    }

    // Some clients (Safari) don't trigger onopen until the first frame is received.
    destination.write(':ok\n\n')
    return super.pipe(destination, options)
  }

  _transform(
    message: Message,
    _encoding: string,
    callback: (error?: Error | null, data?: any) => void
  ) {
    if (message.data) {
      this.push(dataToString(message.data))
    }

    this.push('\n')

    callback()
  }

  writeMessage(
    message: Message,
    encoding?: BufferEncoding,
    cb?: (error: Error | null | undefined) => void
  ): boolean {
    return this.write(message, encoding, cb)
  }
}
