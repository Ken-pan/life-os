#!/usr/bin/env node
/**
 * @deprecated Use run-recipe.mjs amazon-orders instead.
 * Harvest Amazon Your Orders via recipe engine.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'run-recipe.mjs')

const child = spawn(process.execPath, [script, 'amazon-orders'], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 1))
