/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { Stream } from './stream.js'
import { Storage } from './storage.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccessCallback } from './types/main.js'

interface OnConnectParams<Context> {
  uid: string
  context?: Context
}

interface OnDisconnectParams<Context> {
  uid: string
  context?: Context
}

interface OnSubscribeParams<Context> {
  uid: string
  channel: string
  context: Context
}

interface OnUnsubscribeParams<Context> {
  uid: string
  channel: string
  context: Context
}

export interface CreateStreamParams<Context> {
  uid: string
  request: IncomingMessage
  response: ServerResponse
  context: Context
  onConnect?: (params: OnConnectParams<Context>) => void
  onDisconnect?: (params: OnDisconnectParams<Context>) => void
}

export interface SubscribeParams<Context> {
  uid: string
  channel: string
  context?: Context
  skipAuthorization?: boolean
  onSubscribe?: (params: OnSubscribeParams<Context>) => void
}

export interface UnsubscribeParams<Context> {
  uid: string
  channel: string
  context?: Context
  onUnsubscribe?: (params: OnUnsubscribeParams<Context>) => void
}

export class StreamManager<Context extends unknown> {
  #storage: Storage

  #securedChannels = new Map<string, AccessCallback<any, any>>()

  constructor() {
    this.#storage = new Storage()
  }

  createStream({
    uid,
    context,
    request,
    response,
    onConnect,
    onDisconnect,
  }: CreateStreamParams<Context>) {
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

  async subscribe({
    uid,
    channel,
    context,
    skipAuthorization = false,
    onSubscribe,
  }: SubscribeParams<Context>) {
    if (!skipAuthorization) {
      const canAccessChannel = await this.verifyAccess(channel, context!)

      if (!canAccessChannel) {
        return false
      }
    }

    this.#storage.subscribe(uid, channel)
    onSubscribe?.({ uid, channel, context: context! })

    return true
  }

  async unsubscribe({ uid, channel, context, onUnsubscribe }: UnsubscribeParams<Context>) {
    this.#storage.unsubscribe(uid, channel)
    onUnsubscribe?.({ uid, channel, context: context! })

    return true
  }

  authorize<Params extends Record<string, string>>(
    channel: string,
    callback: AccessCallback<Context, Params>
  ) {
    this.#storage.secure(channel)
    this.#securedChannels.set(channel, callback)
  }

  async verifyAccess(channel: string, context: Context) {
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
