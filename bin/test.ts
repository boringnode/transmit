import { configure, processCLIArgs, run } from '@japa/runner'
import { assert } from '@japa/assert'

processCLIArgs(process.argv.splice(2))
configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert()],
})

void run()
