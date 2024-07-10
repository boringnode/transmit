/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { Broadcastable } from './types/main.js'

export function dataToString(data: Broadcastable): string {
  if (typeof data === 'object') {
    return dataToString(JSON.stringify(data))
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return `data: ${data}\n`
  }

  return data
    .split(/\r\n|\r|\n/)
    .map((line) => `data: ${line}\n`)
    .join('')
}
