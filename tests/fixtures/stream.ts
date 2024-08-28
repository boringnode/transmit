import { randomUUID } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from '../mocks/socket.js'
import type { Transmit } from '../../src/transmit.js'

export function makeStream(transmit: Transmit<any>, uid = randomUUID()) {
  const socket = new Socket()
  const request = new IncomingMessage(socket)
  const response = new ServerResponse(request)

  return transmit.createStream({
    uid,
    request,
    response,
    context: {},
  })
}
