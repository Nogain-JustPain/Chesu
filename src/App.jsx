import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getEngine } from './engine'
import { sfx } from './sfx'

const LEVELS = [
  { id: 'pemula', name: 'Pemula', depth: 1, mpv: 8, window: 900, rnd: 0.3 },
  { id: 'santai', name: 'Santai', depth: 2, mpv: 6, window: 450, rnd: 0.12 },
  { id: 'menengah', name: 'Menengah', depth: 8, elo: 1400 },
  { id: 'kuat', name: 'Kuat', depth: 12, elo: 1900 },
]
const BOARD = {
  customDarkSquareStyle: { backgroundColor: 'var(--sq-d)' },
  customLightSquareStyle: { backgroundColor: 'var(--sq-l)' },
  customBoardStyle: { borderRadius: 10, boxShadow: '0 10px 32px rgba(43,54,49,.12)' },
  animationDuration: 150,
}
const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
const grade = d => (d >= 20 ? 'blunder' : d >= 10 ? 'mistake' : d >= 5 ? 'inacc' : 'ok')
const LABEL = { blunder: 'Blunder', mistake: 'Salah langkah', inacc: 'Kurang pas', ok: 'Aman' }
const pairs = list => list.reduce((a, m, i) => (i % 2 ? (a[a.length - 1].push(m), a) : (a.push([m]), a)), [])

const PLAYER = 'Rechaa' // ganti di sini kalau mau nama lain
const BOT = 'Chesu'
const pick = a => a[Math.floor(Math.random() * a.length)]
const MSG = {
  greet: ['Yuk mulai! Jangan nangis ya 😎', 'Santai aja, gua juga santai kok.', 'Gas, lu jalan duluan atau gua? 😄'],
  gloat: ['Hmm, lu yakin langkah itu? 👀', 'Makasih hadiahnya 😏', 'Itu kayaknya kurang aman deh…'],
  great: ['Waduh, langkah bagus juga lu 😳', 'Oke itu sakit. Boleh juga lu.', 'Hmm, gua harus lebih hati-hati nih.'],
  cpuCapture: ['Maaf ya, gua ambil dulu 😌', 'Nyam. Makasih bidaknya.', 'Satu bidak mampir ke kantong gua.'],
  playerCapture: ['Eh, bidak gua! 😭', 'Oke oke, itu fair.', 'Yah… yaudah deh, gua balas nanti.'],
  cpuCheck: ['Skak! Awas rajanya 👑', 'Skak ya, cek rajanya.'],
  playerCheck: ['Skak ya? Oke, gua amanin dulu.', 'Eh, rajanya diganggu 😅'],
  cpuMate: ['Skakmat! GG, rematch yuk 🤝', 'Skakmat. Seru kok mainnya!'],
  playerMate: ['Yah, kalah gua. GG, bagus mainnya! 👏', 'Skakmat… oke, lu menang. Rematch?'],
  draw: ['Seri. Lumayan lah 🤝'],
  fatal: ['Eh… lu beneran mau jalanin itu? 😳', 'Waduh, itu bahaya banget buat lu 👀', 'Gua nggak enak nih, tapi makasih ya 😅', 'Langkah barusan… hmm, yakin?', 'Wah, ini sih gua yang untung 😬'],
  generic: ['Hmm, gua mikir dulu…', 'Oke, gua jalan ini.', 'Menarik. Lanjut.', 'Santai, kita nikmatin aja.', 'Boleh juga pembukaannya.'],
}

// Titik petak legal (lingkaran kalau bisa makan) + highlight bidak yang dipilih
function dots(game, sq) {
  const st = {}
  if (!sq) return st
  st[sq] = { background: 'rgba(246,246,105,.5)' }
  for (const m of game.moves({ square: sq, verbose: true }))
    st[m.to] = { background: game.get(m.to) ? 'radial-gradient(transparent 0%,transparent 78%,rgba(43,54,49,.28) 80%)' : 'radial-gradient(rgba(43,54,49,.25) 22%,transparent 24%)' }
  return st
}

// Penilai terpisah (kedalaman 10) supaya blunder lu tetap kebaca walau lawan di level rendah
async function judge(fen) {
  const o = await getEngine().run(fen, { depth: 10 })
  return Math.max(-1000, Math.min(1000, o.lines[0]?.cp ?? 0))
}

function Play({ onReview }) {
  const [lvl, setLvl] = useState('santai')
  const [color, setColor] = useState('w')
  const [, setTick] = useState(0)
  const [thinking, setThinking] = useState(false)
  const g = useRef(new Chess())
  const gid = useRef(0)
  const prevCp = useRef(null)
  const base = useRef(30) // nilai posisi sebelum langkah lu, dari sisi lu
  const [sel, setSel] = useState(null)
  const [endOpen, setEndOpen] = useState(false)
  const chatRef = useRef(null)
  const [chat, setChat] = useState(() => [pick(MSG.greet)])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [chat, thinking])
  const lv = LEVELS.find(l => l.id === lvl)
  const sync = () => setTick(t => t + 1)

  const pgnOf = () => {
    g.current.header('White', color === 'w' ? PLAYER : BOT, 'Black', color === 'w' ? BOT : PLAYER)
    return g.current.pgn()
  }
  const say = t => setChat(c => [...c.slice(-30), t])
  async function reply() {
    if (g.current.isGameOver()) return
    const id = gid.current, t0 = Date.now()
    const pm = g.current.history({ verbose: true }).slice(-1)[0]
    setThinking(true)
    let fatal = false
    if (base.current != null && pm && pm.color === color) {
      const a = await judge(g.current.fen())
      if (id !== gid.current) return
      fatal = winPct(base.current) - winPct(-a) >= 25
    }
    const r = await getEngine().run(g.current.fen(), { depth: lv.depth, multipv: lv.mpv || 1, elo: lv.elo })
    let uci = r.best, line = r.lines[0]
    if (lv.window && r.lines.length) {
      const pool = r.lines.filter(l => l.cp >= r.lines[0].cp - lv.window)
      line = pool[Math.floor(Math.random() * pool.length)]; uci = line.pv[0]
    }
    // kadang main sembarang langkah legal, biar blunder-nya terasa manusiawi
    if (lv.rnd && Math.random() < lv.rnd) {
      const m = pick(g.current.moves({ verbose: true }))
      uci = m.from + m.to + (m.promotion || ''); line = null
    }
    // jeda biar terasa seperti lawan yang lagi mikir
    const wait = (lv.id === 'pemula' ? 500 : 900) + Math.random() * 1300 - (Date.now() - t0)
    if (wait > 0) await new Promise(res => setTimeout(res, wait))
    if (id !== gid.current) return
    const clamp = v => Math.max(-1000, Math.min(1000, v))
    const cp = line ? clamp(line.cp) : 0
    const delta = prevCp.current == null ? 0 : cp - prevCp.current
    prevCp.current = cp
    let mv = null
    try { mv = g.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) } catch {}
    if (mv) sfx.play(mv)
    const gm = g.current
    let kind = 'generic'
    if (gm.isCheckmate()) kind = 'cpuMate'
    else if (gm.isGameOver()) kind = 'draw'
    else if (fatal) kind = 'fatal'
    else if (lv.depth >= 3 && delta >= 150) kind = 'gloat'
    else if (lv.depth >= 3 && delta <= -150) kind = 'great'
    else if (mv?.captured) kind = 'cpuCapture'
    else if (pm?.captured) kind = 'playerCapture'
    else if (mv?.san.includes('+')) kind = 'cpuCheck'
    else if (pm?.san.includes('+')) kind = 'playerCheck'
    say(pick(MSG[kind]))
    setThinking(false); sync()
    if (!gm.isGameOver()) judge(gm.fen()).then(v => { if (id === gid.current) base.current = v })
  }
  function fresh(c) {
    gid.current++
    g.current = new Chess(); prevCp.current = null; base.current = c === 'w' ? 30 : null
    setColor(c); setThinking(false); setSel(null); setChat([pick(MSG.greet)]); sync()
    if (c === 'b') reply()
  }
  function doMove(from, to) {
    if (thinking || g.current.isGameOver() || g.current.turn() !== color) return false
    let mv
    try { mv = g.current.move({ from, to, promotion: 'q' }) } catch { return false }
    sfx.play(mv); setSel(null); sync()
    if (g.current.isGameOver()) say(pick(g.current.isCheckmate() ? MSG.playerMate : MSG.draw))
    else reply()
    return true
  }
  const onDrop = (f, t) => doMove(f, t)
  function onSq(sq) {
    if (thinking || g.current.isGameOver() || g.current.turn() !== color) return
    if (sel && g.current.moves({ square: sel, verbose: true }).some(m => m.to === sq)) { doMove(sel, sq); return }
    const p = g.current.get(sq)
    setSel(p && p.color === color ? sq : null)
  }
  function undo() {
    if (thinking || !g.current.history().length) return
    g.current.undo(); prevCp.current = null; base.current = null; setSel(null)
    if (g.current.turn() !== color && g.current.history().length) g.current.undo()
    sync()
  }

  const game = g.current
  const hist = game.history()
  const lm = game.history({ verbose: true }).slice(-1)[0]
  const styles = { ...(lm ? { [lm.from]: { background: 'rgba(95,133,119,.3)' }, [lm.to]: { background: 'rgba(95,133,119,.3)' } } : {}), ...(thinking ? {} : dots(game, sel)) }
  const over = game.isGameOver()
  useEffect(() => {
    if (!over) { setEndOpen(false); return }
    const t = setTimeout(() => setEndOpen(true), 900)
    return () => clearTimeout(t)
  }, [over, hist.length])
  let status = thinking ? 'Chesu lagi mikir…' : 'Giliran lu.'
  if (game.isCheckmate()) status = game.turn() === color ? 'Skakmat. Kalah nih, rematch yuk.' : 'Skakmat. Lu menang! 🎉'
  else if (game.isGameOver()) status = 'Remis, seri.'

  return (
    <>
    <div className="stage">
      <div className="boardwrap">
        <Chessboard {...BOARD} position={game.fen()} boardOrientation={color === 'w' ? 'white' : 'black'} onPieceDrop={onDrop} onSquareClick={onSq} onPieceDragBegin={(p, sq) => thinking || setSel(sq)} customSquareStyles={styles} />
      </div>
      <aside className="panel">
        <p className="status">{status}</p>
        <div className="chat" ref={chatRef}>
          {chat.map((t, i) => <p key={i} className="bubble">{t}</p>)}
          {thinking && <p className="bubble typing">•••</p>}
        </div>
        <label className="field">Lawan
          <select value={lvl} onChange={e => setLvl(e.target.value)}>
            {LEVELS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <div className="btns">
          <button className="primary" onClick={() => fresh('w')}>Main putih</button>
          <button className="primary" onClick={() => fresh('b')}>Main hitam</button>
          <button onClick={undo} disabled={thinking || !hist.length}>Undo langkah</button>
          <button onClick={() => onReview(pgnOf())} disabled={!hist.length}>Bedah game ini</button>
        </div>
        <div className="moves">
          {pairs(hist).map((p, i) => (
            <div className="row" key={i}><span className="no">{i + 1}</span><span>{p[0]}</span><span>{p[1]}</span></div>
          ))}
          {!hist.length && <p className="hint">Gerakin bidak buat mulai. Level Pemula sengaja suka blunder, santai aja.</p>}
        </div>
      </aside>
    </div>
    {endOpen && (
      <div className="overlay" onClick={() => setEndOpen(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2>{game.isCheckmate() ? (game.turn() === color ? 'Kali ini kalah' : 'Lu menang! 🎉') : 'Seri'}</h2>
          <p className="hint">{status}</p>
          <div className="btns">
            <button className="primary" onClick={() => { setEndOpen(false); fresh(color) }}>Main lagi</button>
            <button onClick={() => { setEndOpen(false); onReview(pgnOf()) }}>Bedah game ini</button>
          </div>
        </div>
      </div>
    )}
    </>
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
  const [free, setFree] = useState([])
  const [sel, setSel] = useState(null)
  const [live, setLive] = useState(null)

  async function run(text) {
    setErr('')
    const g = new Chess()
    try { g.loadPgn(text.trim()) } catch { setErr('PGN-nya kebaca aneh. Coba copy ulang dari chess.com.'); return }
    const hist = g.history({ verbose: true })
    if (!hist.length) { setErr('PGN-nya nggak ada langkahnya.'); return }
    const nm = (v, d) => (!v || v === '?' || v === 'Unknown' ? d : v)
    const names = { w: nm(g.header().White, 'Pemain 1'), b: nm(g.header().Black, 'Pemain 2') }
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
  const go = i => { setFree([]); setSel(null); setCur(c => Math.max(0, Math.min(n, typeof i === 'function' ? i(c) : i))) }
  useEffect(() => {
    const k = e => { if (e.target.tagName === 'TEXTAREA') return; if (e.key === 'ArrowLeft') go(c => c - 1); if (e.key === 'ArrowRight') go(c => c + 1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [n])

  const shown = res ? (free.length ? free[free.length - 1].fen : res.fens[cur]) : null
  useEffect(() => {
    if (!shown || !free.length) { setLive(null); return }
    let dead = false
    const t = new Chess(shown)
    if (t.isGameOver()) { setLive({ cp: t.isCheckmate() ? (t.turn() === 'w' ? -1000 : 1000) : 0, best: null, line: '' }); return }
    setLive(null)
    getEngine().run(shown, { depth: 14 }).then(o => {
      const l = o.lines[0]
      if (dead || !l) return
      const c = new Chess(shown), sans = []
      for (const u of l.pv.slice(0, 6)) { try { sans.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san) } catch { break } }
      setLive({ cp: Math.max(-1000, Math.min(1000, l.cp * (t.turn() === 'w' ? 1 : -1))), best: o.best, line: sans.join(' ') })
    })
    return () => { dead = true }
  }, [shown, free.length])

  if (!res) return (
    <div className="intro">
      <h2>Tempel PGN game lu</h2>
      <p className="hint">Di chess.com: buka game, klik Share, terus copy PGN-nya.</p>
      <textarea value={pgn} onChange={e => setPgn(e.target.value)} placeholder="1. d4 d5 2. Bf4 …" />
      <div className="btns">
        <button className="primary" disabled={busy || !pgn.trim()} onClick={() => run(pgn)}>{busy ? `Menganalisis ${prog}/${total}` : 'Analisis'}</button>
      </div>
      {busy && <div className="bar"><i style={{ width: `${(prog / total) * 100}%` }} /></div>}
      {err && <p className="err">{err}</p>}
    </div>
  )

  const inFree = free.length > 0
  const last = inFree ? free[free.length - 1] : cur > 0 ? res.hist[cur - 1] : null
  const mv = !inFree && cur > 0 ? res.moves[cur - 1] : null
  const bu = inFree ? live?.best : res.bests[cur]
  const lastHl = last ? { [last.from]: { background: 'rgba(95,133,119,.35)' }, [last.to]: { background: 'rgba(95,133,119,.35)' } } : {}
  const styles = { ...lastHl, ...dots(new Chess(shown), sel) }
  const w = inFree ? (live ? winPct(live.cp) : 50) : winPct(res.cps[cur])
  const score = live ? (Math.abs(live.cp) >= 900 ? 'Mate' : (live.cp > 0 ? '+' : '') + (live.cp / 100).toFixed(1)) : '…'
  const tryMove = (from, to) => {
    const c = new Chess(shown)
    let m
    try { m = c.move({ from, to, promotion: 'q' }) } catch { return false }
    sfx.play(m); setSel(null); setFree(f => [...f, { fen: c.fen(), san: m.san, from, to }]); return true
  }
  const onSq = sq => {
    const c = new Chess(shown)
    if (sel && c.moves({ square: sel, verbose: true }).some(m => m.to === sq)) { tryMove(sel, sq); return }
    setSel(c.get(sq) ? sq : null)
  }
  return (
    <div className="stage">
      <div className="boardwrap evalrow">
        <div className="eval"><i style={{ height: `${w}%` }} /></div>
        <div style={{ flex: 1 }}>
          <Chessboard {...BOARD} position={shown} onPieceDrop={tryMove} onSquareClick={onSq} onPieceDragBegin={(p, sq) => setSel(sq)}
            customSquareStyles={styles} customArrows={bu ? [[bu.slice(0, 2), bu.slice(2, 4), 'rgba(240,170,60,.9)']] : []} />
          <div className="btns nav">
            <button onClick={() => go(0)}>⏮</button><button onClick={() => go(c => c - 1)}>◀</button>
            <button onClick={() => go(c => c + 1)}>▶</button><button onClick={() => go(n)}>⏭</button>
          </div>
        </div>
      </div>
      <aside className="panel">
        <div className="acc">
          <div><i className="lbl">Akurasi</i><b>{res.acc.w}</b><span>{res.names.w}</span></div>
          <div><i className="lbl">Akurasi</i><b>{res.acc.b}</b><span>{res.names.b}</span></div>
        </div>
        {inFree ? (
          <div className="live">
            <p className="status small"><b>Analisis langsung: {score}</b>{live?.line ? <> · saran mesin: {live.line}</> : ''}</p>
            <p className="hint">Variasi: {free.map(x => x.san).join(' ')}</p>
            <div className="btns">
              <button onClick={() => { setFree(f => f.slice(0, -1)); setSel(null) }}>Undo</button>
              <button className="primary" onClick={() => { setFree([]); setSel(null) }}>Balik ke game</button>
            </div>
          </div>
        ) : (
          <>
            <p className="status small">
              {mv ? <><b>{Math.ceil(cur / 2)}{mv.color === 'w' ? '.' : '...'} {mv.san}</b> · {LABEL[mv.cls]}{mv.cls !== 'ok' && res.bestSan[cur - 1] ? `. Harusnya: ${res.bestSan[cur - 1]}` : ''}</> : 'Posisi awal. Panah oranye = langkah terbaik di posisi ini.'}
            </p>
            <p className="hint">Geser atau klik bidak di papan buat nyoba variasi sendiri. Mesin ikut ngitung langsung.</p>
          </>
        )}
        <div className="moves">
          {pairs(res.moves).map((p, i) => (
            <div className="row" key={i}><span className="no">{i + 1}</span>
              {p.map((m, j) => (
                <button key={j} className={`mv ${m.cls} ${!inFree && cur === i * 2 + j + 1 ? 'on' : ''}`} onClick={() => go(i * 2 + j + 1)}>{m.san}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="btns"><button onClick={() => { setRes(null); setPgn(''); setFree([]) }}>Game lain</button></div>
      </aside>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('main')
  const [review, setReview] = useState('')
  const [muted, setMuted] = useState(false)
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem('chesu-theme'); if (t) return t } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('chesu-theme', theme) } catch {}
  }, [theme])
  return (
    <div className="wrap">
      <header>
        <h1>Chesu</h1>
        <div className="hr">
          <button className="snd" aria-label="Suara" onClick={() => { const v = !muted; setMuted(v); sfx.setMuted(v) }}>{muted ? '🔇' : '🔊'}</button>
          <button className="snd" aria-label="Ganti tema" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <nav className="seg">
          <button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>Main</button>
          <button className={tab === 'analisis' ? 'on' : ''} onClick={() => setTab('analisis')}>Analisis</button>
        </nav>
        </div>
      </header>
      <div hidden={tab !== 'main'}><Play onReview={p => { setReview(p); setTab('analisis') }} /></div>
      <div hidden={tab !== 'analisis'}><Analyze initial={review} /></div>
    </div>
  )
}
