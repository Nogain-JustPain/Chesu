// Pembungkus Stockfish (UCI) di Web Worker. Semua pekerjaan diantrekan satu per satu.
class Engine {
  constructor() {
    this.w = new Worker('/stockfish/stockfish-19-lite-single.js')
    this.handler = null
    this.queue = Promise.resolve()
    this.ready = new Promise(r => { this.resolve = r })
    this.w.onmessage = e => {
      const t = String(e.data)
      if (t === 'uciok') this.resolve()
      this.handler?.(t)
    }
    this.w.postMessage('uci')
  }
  // Skor (cp) dari sudut pandang pihak yang jalan.
  run(fen, { depth = 12, multipv = 1, elo = null } = {}) {
    const job = async () => {
      await this.ready
      return new Promise(done => {
        const lines = {}
        this.handler = t => {
          if (t.startsWith('info') && t.includes(' pv ')) {
            const sc = t.match(/score (cp|mate) (-?\d+)/)
            if (!sc) return
            const k = +(t.match(/multipv (\d+)/)?.[1] ?? 1)
            const v = +sc[2]
            lines[k] = { cp: sc[1] === 'cp' ? v : Math.sign(v) * (10000 - Math.abs(v)), pv: t.split(' pv ')[1].trim().split(' ') }
          } else if (t.startsWith('bestmove')) {
            this.handler = null
            const best = t.split(' ')[1]
            done({ best: best === '(none)' ? null : best, lines: Object.values(lines) })
          }
        }
        const p = m => this.w.postMessage(m)
        p(`setoption name UCI_LimitStrength value ${!!elo}`)
        if (elo) p(`setoption name UCI_Elo value ${elo}`)
        p(`setoption name MultiPV value ${multipv}`)
        p(`position fen ${fen}`)
        p(`go depth ${depth}`)
      })
    }
    const result = this.queue.then(job)
    this.queue = result.catch(() => {})
    return result
  }
}
let engine
export const getEngine = () => (engine ||= new Engine())
