// Efek suara sederhana, dibuat langsung lewat WebAudio (tanpa file audio).
let ctx, muted = false
const ac = () => { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx }
function tone(f, t0, dur, type = 'sine', vol = 0.15) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0
  o.type = type; o.frequency.setValueAtTime(f, t)
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02)
}
function click(vol, freq) {
  const c = ac(), n = Math.floor(c.sampleRate * 0.06), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4)
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol
  s.connect(f).connect(g).connect(c.destination); s.start()
  tone(140, 0, 0.08, 'sine', vol * 0.35)
}
const safe = fn => () => { if (!muted) try { fn() } catch {} }
const move = safe(() => click(0.6, 900))
const capture = safe(() => { click(1, 650); tone(110, 0, 0.14, 'triangle', 0.25) })
const check = safe(() => { click(0.6, 900); tone(880, 0.05, 0.14, 'triangle'); tone(1175, 0.16, 0.2, 'triangle') })
const mate = safe(() => { click(0.8, 700); [523, 415, 330, 262].forEach((f, i) => tone(f, 0.1 + i * 0.18, 0.45, 'triangle', 0.18)) })
export const sfx = {
  setMuted: v => { muted = v },
  play: m => (m.san.includes('#') ? mate : m.san.includes('+') ? check : m.captured ? capture : move)(),
}
