/*
 * @boringnode/transmit
 *
 * @license MIT
 * @copyright Boring Node
 */

import { test } from '@japa/runner'
import { dataToString } from '../src/utils.js'

test.group('Utils | dataToString', () => {
  test('should transform data when it is an object', ({ assert }) => {
    const value = dataToString({ name: 'Romain Lanz' })

    assert.equal(value, 'data: {"name":"Romain Lanz"}\n')
  })

  test('should transform data when it is a number', ({ assert }) => {
    const value = dataToString(42)

    assert.equal(value, 'data: 42\n')
  })

  test('should transform data when it is a boolean', ({ assert }) => {
    const value = dataToString(true)

    assert.equal(value, 'data: true\n')
  })

  test('should transform data when it is a string', ({ assert }) => {
    const value = dataToString('Hello world')

    assert.equal(value, 'data: Hello world\n')
  })
})
