/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { clearInterval } from 'node:timers'
import Emittery from 'emittery'
import { Bus } from '@boringnode/bus'
import string from '@poppinss/utils/string'
import { StreamManager } from './stream_manager.js'
import { TransportMessageType } from './transport_message_type.js'
import type { Transport } from '@boringnode/bus/types/main'
import type { AccessCallback, Broadcastable, TransmitConfig } from './types/main.js'
import type { CreateStreamParams, SubscribeParams, UnsubscribeParams } from './stream_manager.js'

export interface TransmitLifecycleHooks<T> {
  connect: { uid: string; context: T }
  disconnect: { uid: string; context: T }
  broadcast: { channel: string; payload: Broadcastable }
  subscribe: { uid: string; channel: string; context: T }
  unsubscribe: { uid: string; channel: string; context: T }
}

type TransmitMessage =
  | {
      type: typeof TransportMessageType.Broadcast
      channel: string
      payload: Broadcastable
    }
  | {
      type: typeof TransportMessageType.Subscribe
      channel: string
      payload: { uid: string }
    }
  | {
      type: typeof TransportMessageType.Unsubscribe
      channel: string
      payload: { uid: string }
    }

export class Transmit {
  /**
   * The configuration for the transmit instance
   */
  #config: TransmitConfig

  /**
   * The stream manager instance
   */
  readonly #manager: StreamManager

  /**
   * The transport channel to synchronize messages and subscriptions
   * across multiple instance.
   */
  readonly #transportChannel: string

  /**
   * The transport provider to synchronize messages and subscriptions
   * across multiple instance.
   */
  readonly #bus: Bus | null

  /**
   * The emittery instance to emit events.
   */
  #emittery: Emittery<TransmitLifecycleHooks<any>>

  /**
   * The interval to send ping messages to all the subscribers.
   */
  readonly #interval: NodeJS.Timeout | undefined

  constructor(config: TransmitConfig, transport?: Transport | null) {
    this.#config = config
    this.#manager = new StreamManager()
    this.#emittery = new Emittery()
    this.#bus = transport ? new Bus(transport, { retryQueue: { enabled: true } }) : null
    this.#transportChannel = this.#config.transport?.channel ?? 'transmit::broadcast'

    // Subscribe to the transport channel and handle incoming messages
    void this.#bus?.subscribe<TransmitMessage>(this.#transportChannel, (message) => {
      const { type, channel, payload } = message

      if (type === TransportMessageType.Broadcast) {
        void this.#broadcastLocally(channel, payload)
      } else if (type === TransportMessageType.Subscribe) {
        void this.#manager.subscribe({ uid: payload.uid, channel })
      } else if (type === TransportMessageType.Unsubscribe) {
        void this.#manager.unsubscribe({ uid: payload.uid, channel })
      }
    })

    // Start the ping interval if configured
    if (this.#config.pingInterval) {
      const intervalValue =
        typeof this.#config.pingInterval === 'number'
          ? this.#config.pingInterval
          : string.milliseconds.parse(this.#config.pingInterval)

      this.#interval = setInterval(() => this.#ping(), intervalValue)
    }
  }

  getManager() {
    return this.#manager
  }

  createStream<T>(params: Omit<CreateStreamParams<T>, 'onConnect' | 'onDisconnect'>) {
    return this.#manager.createStream({
      ...params,
      onConnect: () => {
        void this.#emittery.emit('connect', {
          uid: params.uid,
          context: params.context,
        })
      },
      onDisconnect: () => {
        void this.#emittery.emit('disconnect', {
          uid: params.uid,
          context: params.context,
        })
      },
    })
  }

  authorize<T extends unknown, U extends Record<string, string>>(
    channel: string,
    callback: AccessCallback<T, U>
  ) {
    this.#manager.authorize(channel, callback)
  }

  subscribe<T>(params: Omit<SubscribeParams<T>, 'onSubscribe'>) {
    return this.#manager.subscribe<T>({
      ...params,
      onSubscribe: ({ uid, channel, context }) => {
        void this.#emittery.emit('subscribe', {
          uid,
          channel,
          context,
        })

        void this.#bus?.publish(this.#transportChannel, {
          type: TransportMessageType.Subscribe,
          channel,
          payload: { uid },
        })
      },
    })
  }

  unsubscribe<T>(params: Omit<UnsubscribeParams<T>, 'onUnsubscribe'>) {
    return this.#manager.unsubscribe<T>({
      ...params,
      onUnsubscribe: ({ uid, channel, context }) => {
        void this.#emittery.emit('unsubscribe', {
          uid,
          channel,
          context,
        })

        void this.#bus?.publish(this.#transportChannel, {
          type: TransportMessageType.Unsubscribe,
          channel,
          payload: { uid },
        })
      },
    })
  }

  #broadcastLocally(channel: string, payload: Broadcastable, senderUid?: string | string[]) {
    const subscribers = this.#manager.findByChannel(channel)

    for (const subscriber of subscribers) {
      if (
        Array.isArray(senderUid)
          ? senderUid.includes(subscriber.getUid())
          : senderUid === subscriber.getUid()
      ) {
        continue
      }

      subscriber.writeMessage({ data: { channel, payload } })
    }
  }

  broadcastExcept(channel: string, payload: Broadcastable, senderUid: string | string[]) {
    return this.#broadcastLocally(channel, payload, senderUid)
  }

  broadcast(channel: string, payload?: Broadcastable) {
    if (!payload) {
      payload = {}
    }

    void this.#bus?.publish(this.#transportChannel, {
      type: TransportMessageType.Broadcast,
      channel,
      payload,
    })

    this.#broadcastLocally(channel, payload)

    void this.#emittery.emit('broadcast', { channel, payload })
  }

  on<T extends keyof TransmitLifecycleHooks<C>, C>(
    event: T,
    callback: (payload: TransmitLifecycleHooks<C>[T]) => void
  ) {
    return this.#emittery.on(event, callback)
  }

  async shutdown() {
    if (this.#interval) {
      clearInterval(this.#interval)
    }

    await this.#bus?.disconnect()
  }

  #ping() {
    for (const [stream] of this.#manager.getAllSubscribers()) {
      stream.writeMessage({ data: { channel: '$$transmit/ping', payload: {} } })
    }
  }
}
