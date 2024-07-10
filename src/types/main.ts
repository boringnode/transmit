/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import type { TransportFactory } from '@boringnode/bus/types/main'

/**
 * A Duration can be a number in milliseconds or a string formatted as a duration
 *
 * Formats accepted are :
 * - Simple number in milliseconds
 * - String formatted as a duration. Uses https://github.com/lukeed/ms under the hood
 */
export type Duration = number | string

/**
 * A Broadcastable is a value that can be broadcasted to other clients
 */
export type Broadcastable =
  | { [key: string]: Broadcastable }
  | string
  | number
  | boolean
  | null
  | Broadcastable[]

export interface TransmitConfig {
  /**
   * The interval in milliseconds to send ping messages to the client
   */
  pingInterval?: Duration | false

  /**
   * The transport driver to use for transmitting messages
   */
  transport: null | {
    driver: TransportFactory
    channel?: string
  }
}
