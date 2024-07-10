/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { Stream } from './stream.js'
import { Storage } from './storage.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

type AccessCallback = <T>(context: T, params?: any) => Promise<boolean> | boolean

interface OnConnectParams<T> {
  uid: string
  context?: T
}

interface OnDisconnectParams<T> {
  uid: string
  context?: T
}

interface OnSubscribeParams<T> {
  uid: string
  channel: string
  context?: T
}

interface OnUnsubscribeParams<T> {
  uid: string
  channel: string
  context?: T
}

export interface CreateStreamParams<T> {
  uid: string
  request: IncomingMessage
  response: ServerResponse
  context?: T
  onConnect?: (params: OnConnectParams<T>) => void
  onDisconnect?: (params: OnDisconnectParams<T>) => void
}

export interface SubscribeParams<T> {
  uid: string
  channel: string
  context?: T
  onSubscribe?: (params: OnSubscribeParams<T>) => void
}

export interface UnsubscribeParams<T> {
  uid: string
  channel: string
  context?: T
  onUnsubscribe?: (params: OnUnsubscribeParams<T>) => void
}

export class StreamManager {
  #storage: Storage

  #securedChannels = new Map<string, AccessCallback>()

  constructor() {
    this.#storage = new Storage()
  }

  createStream<T>({
    uid,
    context,
    request,
    response,
    onConnect,
    onDisconnect,
  }: CreateStreamParams<T>) {
    const stream = new Stream(uid, request)
    stream.pipe(response, undefined, response.getHeaders())

    this.#storage.add(stream)

    onConnect?.({ uid, context })

    response.on('close', () => {
      this.#storage.remove(stream)
      onDisconnect?.({ uid, context })
    })

    return stream
  }

  async subscribe<T>({ uid, channel, context, onSubscribe }: SubscribeParams<T>) {
    const canAccessChannel = await this.verifyAccess(channel, context)

    if (!canAccessChannel) {
      return false
    }

    this.#storage.subscribe(uid, channel)
    onSubscribe?.({ uid, channel, context })

    return true
  }

  async unsubscribe<T>({ uid, channel, context, onUnsubscribe }: UnsubscribeParams<T>) {
    this.#storage.unsubscribe(uid, channel)
    onUnsubscribe?.({ uid, channel, context })

    return true
  }

  authorize(channel: string, callback: AccessCallback) {
    this.#storage.secure(channel)
    this.#securedChannels.set(channel, callback)
  }

  async verifyAccess<T>(channel: string, context: T) {
    const definitions = this.#storage.getSecuredChannelDefinition(channel)

    if (!definitions) {
      return true
    }

    const callback = this.#securedChannels.get(definitions.channel)

    try {
      return await callback!(context, definitions.params)
    } catch (e) {
      return false
    }
  }

  /**
   * Get all subscribers
   */
  getAllSubscribers() {
    return this.#storage.getAllSubscribers()
  }

  /**
   * Find all subscribers to a channel
   */
  findByChannel(channel: string) {
    return this.#storage.findByChannel(channel)
  }
}
