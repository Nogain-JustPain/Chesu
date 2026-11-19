// Menyalin Stockfish (versi lite, single-thread) ke public/ supaya bisa dimuat sebagai Web Worker.
import { cpSync, mkdirSync, existsSync } from 'node:fs'
const src = 'node_modules/stockfish/bin', dst = 'public/stockfish'
mkdirSync(dst, { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  if (existsSync(`${src}/${f}`)) cpSync(`${src}/${f}`, `${dst}/${f}`)
