/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import matchit from 'matchit'
import { Stream } from './stream.js'
import type { Route } from 'matchit'

export class Storage {
  /**
   * Channels subscribed to a given stream
   */
  #subscriptions = new Map<Stream, Set<string>>()

  /**
   * Channels subscribed to a given Stream UID
   */
  #channelsByUid = new Map<string, Set<string>>()

  /**
   * Secured channels definition
   */
  #securedChannelsDefinition: Route[] = []

  /**
   * Secure a channel
   */
  secure(channel: string) {
    const encodedDefinition = matchit.parse(channel)

    this.#securedChannelsDefinition.push(encodedDefinition)
  }

  /**
   * Check if a channel is secured and return the matched channel
   */
  getSecuredChannelDefinition(channel: string) {
    const matchedChannel = matchit.match(channel, this.#securedChannelsDefinition)

    if (matchedChannel.length > 0) {
      const params = matchit.exec(channel, matchedChannel)
      return { params, channel: matchedChannel[0].old }
    }
  }

  /**
   * Get the number of secured channels
   */
  getSecuredChannelCount() {
    return this.#securedChannelsDefinition.length
  }

  /**
   * Get the number of streams
   */
  getStreamCount() {
    return this.#subscriptions.size
  }

  /**
   * Add a stream to the storage
   */
  add(stream: Stream) {
    const channels = new Set<string>()

    this.#subscriptions.set(stream, channels)
    this.#channelsByUid.set(stream.getUid(), channels)
  }

  /**
   * Remove a stream from the storage
   */
  remove(stream: Stream) {
    this.#subscriptions.delete(stream)
    this.#channelsByUid.delete(stream.getUid())
  }

  /**
   * Add a channel to a stream
   */
  subscribe(uid: string, channel: string) {
    const channels = this.#channelsByUid.get(uid)

    if (!channels) return false

    channels.add(channel)

    return true
  }

  /**
   * Remove a channel from a stream
   */
  unsubscribe(uid: string, channel: string) {
    const channels = this.#channelsByUid.get(uid)

    if (!channels) return false

    channels.delete(channel)

    return true
  }

  /**
   * Find all subscribers to a channel
   */
  findByChannel(channel: string) {
    const subscribers = new Set<Stream>()

    for (const [stream, streamChannels] of this.#subscriptions) {
      if (streamChannels.has(channel)) {
        subscribers.add(stream)
      }
    }

    return subscribers
  }

  /**
   * Get channels for a given client
   */
  getChannelByClient(uid: string) {
    return this.#channelsByUid.get(uid)
  }

  /**
   * Get all subscribers
   */
  getAllSubscribers() {
    return this.#subscriptions
  }
}
