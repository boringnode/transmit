import { memory } from '@boringnode/bus/transports/memory'
import { Transmit } from '../../src/transmit.js'

export function makeTransport() {
  const transport = memory()()

  return {
    transport,
    driver: memory(),
  }
}

export function makeTransmitWithTransport(params: ReturnType<typeof makeTransport>) {
  return new Transmit(
    {
      transport: {
        driver: params.driver,
      },
    },
    params.transport
  )
}
