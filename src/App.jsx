import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getEngine } from './engine'

const LEVELS = [
  { id: 'pemula', name: 'Pemula', depth: 1, mpv: 5, window: 500 },
  { id: 'santai', name: 'Santai', depth: 3, mpv: 4, window: 200 },
  { id: 'menengah', name: 'Menengah', depth: 8, elo: 1400 },
  { id: 'kuat', name: 'Kuat', depth: 12, elo: 1900 },
]
const BOARD = {
  customDarkSquareStyle: { backgroundColor: '#9db4a6' },
  customLightSquareStyle: { backgroundColor: '#ecebe4' },
  customBoardStyle: { borderRadius: 10, boxShadow: '0 10px 32px rgba(43,54,49,.12)' },
  animationDuration: 150,
}
const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
const grade = d => (d >= 20 ? 'blunder' : d >= 10 ? 'mistake' : d >= 5 ? 'inacc' : 'ok')
const LABEL = { blunder: 'Blunder', mistake: 'Kesalahan', inacc: 'Kurang akurat', ok: 'Baik' }
const pairs = list => list.reduce((a, m, i) => (i % 2 ? (a[a.length - 1].push(m), a) : (a.push([m]), a)), [])

function Play({ onReview }) {
  const [lvl, setLvl] = useState('santai')
  const [color, setColor] = useState('w')
  const [, setTick] = useState(0)
  const [thinking, setThinking] = useState(false)
  const g = useRef(new Chess())
  const gid = useRef(0)
  const lv = LEVELS.find(l => l.id === lvl)
  const sync = () => setTick(t => t + 1)

  async function reply() {
    if (g.current.isGameOver()) return
    const id = gid.current
    setThinking(true)
    const r = await getEngine().run(g.current.fen(), { depth: lv.depth, multipv: lv.mpv || 1, elo: lv.elo })
    if (id !== gid.current) return
    let uci = r.best
    if (lv.window && r.lines.length) {
      const pool = r.lines.filter(l => l.cp >= r.lines[0].cp - lv.window)
      uci = pool[Math.floor(Math.random() * pool.length)].pv[0]
    }
    try { g.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) } catch {}
    setThinking(false)
    sync()
  }
  function fresh(c) {
    gid.current++
    g.current = new Chess()
    setColor(c); setThinking(false); sync()
    if (c === 'b') reply()
  }
  function onDrop(from, to) {
    if (thinking || g.current.isGameOver() || g.current.turn() !== color) return false
    try { g.current.move({ from, to, promotion: 'q' }) } catch { return false }
    sync(); reply(); return true
  }
  function undo() {
    if (thinking || !g.current.history().length) return
    g.current.undo()
    if (g.current.turn() !== color && g.current.history().length) g.current.undo()
    sync()
  }

  const game = g.current
  const hist = game.history()
  let status = thinking ? 'Komputer sedang berpikir…' : 'Giliranmu.'
  if (game.isCheckmate()) status = game.turn() === color ? 'Skakmat. Kamu kalah.' : 'Skakmat. Kamu menang!'
  else if (game.isGameOver()) status = 'Remis.'

  return (
    <div className="stage">
      <div className="boardwrap">
        <Chessboard {...BOARD} position={game.fen()} boardOrientation={color === 'w' ? 'white' : 'black'} onPieceDrop={onDrop} />
      </div>
      <aside className="panel">
        <p className="status">{status}</p>
        <label className="field">Lawan
          <select value={lvl} onChange={e => setLvl(e.target.value)}>
            {LEVELS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <div className="btns">
          <button className="primary" onClick={() => fresh('w')}>Main putih</button>
          <button className="primary" onClick={() => fresh('b')}>Main hitam</button>
          <button onClick={undo} disabled={thinking || !hist.length}>Ulangi langkah</button>
          <button onClick={() => onReview(game.pgn())} disabled={!hist.length}>Analisis game ini</button>
        </div>
        <div className="moves">
          {pairs(hist).map((p, i) => (
            <div className="row" key={i}><span className="no">{i + 1}</span><span>{p[0]}</span><span>{p[1]}</span></div>
          ))}
          {!hist.length && <p className="hint">Gerakkan bidak untuk mulai. Level Pemula sengaja bisa blunder.</p>}
        </div>
      </aside>
    </div>
  )
}

function Analyze({ initial }) {
  const [pgn, setPgn] = useState('')
  const [res, setRes] = useState(null)
  const [prog, setProg] = useState(0)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [cur, setCur] = useState(0)
  const [busy, setBusy] = useState(false)

  async function run(text) {
    setErr('')
    const g = new Chess()
    try { g.loadPgn(text.trim()) } catch { setErr('PGN tidak bisa dibaca. Salin ulang dari chess.com.'); return }
    const hist = g.history({ verbose: true })
    if (!hist.length) { setErr('Tidak ada langkah di PGN ini.'); return }
    const names = { w: g.header().White || 'Putih', b: g.header().Black || 'Hitam' }
    const r = new Chess(); const fens = [r.fen()]
    for (const m of hist) { r.move(m.san); fens.push(r.fen()) }
    setBusy(true); setRes(null); setCur(0); setTotal(fens.length); setProg(0)
    const eng = getEngine(); const cps = [], bests = []
    for (let i = 0; i < fens.length; i++) {
      const t = new Chess(fens[i])
      if (t.isGameOver()) { cps.push(t.isCheckmate() ? (t.turn() === 'w' ? -1000 : 1000) : 0); bests.push(null) }
      else {
        const o = await eng.run(fens[i], { depth: 12 })
        const sign = t.turn() === 'w' ? 1 : -1
        cps.push(Math.max(-1000, Math.min(1000, (o.lines[0]?.cp ?? 0) * sign))); bests.push(o.best)
      }
      setProg(i + 1)
    }
    const bestSan = bests.map((u, i) => {
      if (!u) return null
      try { return new Chess(fens[i]).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san } catch { return null }
    })
    const moves = hist.map((m, i) => {
      const b = winPct(cps[i]), a = winPct(cps[i + 1])
      const drop = Math.max(0, m.color === 'w' ? b - a : a - b)
      return { san: m.san, color: m.color, cls: grade(drop), acc: 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 }
    })
    const avg = c => { const l = moves.filter(m => m.color === c); return Math.round(l.reduce((s, m) => s + m.acc, 0) / l.length) }
    setRes({ hist, fens, cps, bests, bestSan, moves, names, acc: { w: avg('w'), b: avg('b') } })
    setBusy(false)
  }
  useEffect(() => { if (initial) { setPgn(initial); run(initial) } }, [initial])

  const n = res?.hist.length ?? 0
  const go = i => setCur(c => Math.max(0, Math.min(n, typeof i === 'function' ? i(c) : i)))
  useEffect(() => {
    const k = e => { if (e.target.tagName === 'TEXTAREA') return; if (e.key === 'ArrowLeft') go(c => c - 1); if (e.key === 'ArrowRight') go(c => c + 1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [n])

  if (!res) return (
    <div className="intro">
      <h2>Tempel PGN game kamu</h2>
      <p className="hint">Di chess.com: buka game, klik Bagikan, lalu salin PGN.</p>
      <textarea value={pgn} onChange={e => setPgn(e.target.value)} placeholder="1. d4 d5 2. Bf4 …" />
      <div className="btns">
        <button className="primary" disabled={busy || !pgn.trim()} onClick={() => run(pgn)}>{busy ? `Menganalisis ${prog}/${total}` : 'Analisis'}</button>
      </div>
      {busy && <div className="bar"><i style={{ width: `${(prog / total) * 100}%` }} /></div>}
      {err && <p className="err">{err}</p>}
    </div>
  )

  const last = cur > 0 ? res.hist[cur - 1] : null
  const mv = cur > 0 ? res.moves[cur - 1] : null
  const bu = res.bests[cur]
  const hl = last ? { [last.from]: { background: 'rgba(95,133,119,.35)' }, [last.to]: { background: 'rgba(95,133,119,.35)' } } : {}
  const w = winPct(res.cps[cur])
  return (
    <div className="stage">
      <div className="boardwrap evalrow">
        <div className="eval"><i style={{ height: `${w}%` }} /></div>
        <div style={{ flex: 1 }}>
          <Chessboard {...BOARD} position={res.fens[cur]} arePiecesDraggable={false} customSquareStyles={hl}
            customArrows={bu ? [[bu.slice(0, 2), bu.slice(2, 4), 'rgba(95,133,119,.75)']] : []} />
          <div className="btns nav">
            <button onClick={() => go(0)}>⏮</button><button onClick={() => go(c => c - 1)}>◀</button>
            <button onClick={() => go(c => c + 1)}>▶</button><button onClick={() => go(n)}>⏭</button>
          </div>
        </div>
      </div>
      <aside className="panel">
        <div className="acc">
          <div><b>{res.acc.w}</b><span>{res.names.w}</span></div>
          <div><b>{res.acc.b}</b><span>{res.names.b}</span></div>
        </div>
        <p className="status small">
          {mv ? <><b>{Math.ceil(cur / 2)}{mv.color === 'w' ? '.' : '...'} {mv.san}</b> · {LABEL[mv.cls]}{mv.cls !== 'ok' && res.bestSan[cur - 1] ? `. Lebih baik: ${res.bestSan[cur - 1]}` : ''}</> : 'Posisi awal. Panah hijau = langkah terbaik di posisi ini.'}
        </p>
        <div className="moves">
          {pairs(res.moves).map((p, i) => (
            <div className="row" key={i}><span className="no">{i + 1}</span>
              {p.map((m, j) => (
                <button key={j} className={`mv ${m.cls} ${cur === i * 2 + j + 1 ? 'on' : ''}`} onClick={() => setCur(i * 2 + j + 1)}>{m.san}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="btns"><button onClick={() => { setRes(null); setPgn('') }}>Game lain</button></div>
      </aside>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('main')
  const [review, setReview] = useState('')
  return (
    <div className="wrap">
      <header>
        <h1>Chesu</h1>
        <nav className="seg">
          <button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>Main</button>
          <button className={tab === 'analisis' ? 'on' : ''} onClick={() => setTab('analisis')}>Analisis</button>
        </nav>
      </header>
      <div hidden={tab !== 'main'}><Play onReview={p => { setReview(p); setTab('analisis') }} /></div>
      <div hidden={tab !== 'analisis'}><Analyze initial={review} /></div>
    </div>
  )
}
