// the 3D stage of the red-button game: clicker.js keeps the rules and the HUD, this draws the world
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const TAU = Math.PI * 2
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp01 = k => Math.max(0, Math.min(1, k))
const lerp = (a, b, k) => a + (b - a) * k
const smooth = k => k * k * (3 - 2 * k)
const easeOutBack = k => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2
const easeIn = k => k * k * k

// arena units (the old SVG) → world: the button is 88 wide there and 1 here
const S = 1 / 88
const RING = 205 * S
const CAP_TOP = 0.78

const COATS = {
  gris: ['#8E929A', '#6A6E76', '#E9E3D8'],
  naranja: ['#E8913A', '#B8661E', '#FBE7CF'],
  negro: ['#2B2729', '#151214', '#4A4246'],
  blanco: ['#F1EEE8', '#D8D2C8', '#FFFFFF'],
  siames: ['#EADFC9', '#5A4232', '#F6EFE2'],
  tricolor: ['#F3EFE7', '#D9822B', '#2B2729'],
  militar: ['#6E7B4C', '#4A5532', '#A8A57A'],
}

// soft round light used for every glow: additive sprites fake bloom without post-processing
let glowTex = null
function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.25, 'rgba(255,255,255,.55)')
  r.addColorStop(0.6, 'rgba(255,255,255,.12)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}
function glow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }))
  s.scale.setScalar(size)
  s.userData.base = size
  return s
}
function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  const r = g.createRadialGradient(256, 256, 30, 256, 256, 256)
  r.addColorStop(0, '#3A2622')
  r.addColorStop(0.7, '#1F1716')
  r.addColorStop(1, '#120D0C')
  g.fillStyle = r
  g.fillRect(0, 0, 512, 512)
  // hex plates
  g.strokeStyle = 'rgba(255,140,110,.10)'
  g.lineWidth = 2
  const s = 26
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 13; x++) {
      const cx = x * s * 1.5 * 1.15 + (y % 2) * s * 0.86
      const cy = y * s * 0.87
      g.beginPath()
      for (let k = 0; k < 6; k++) g.lineTo(cx + Math.cos((k * TAU) / 6) * s * 0.5, cy + Math.sin((k * TAU) / 6) * s * 0.5)
      g.closePath()
      g.stroke()
    }
  for (const [rad, a] of [[120, 0.25], [200, 0.18], [250, 0.3]]) {
    g.strokeStyle = `rgba(255,110,80,${a})`
    g.lineWidth = 3
    g.beginPath()
    g.arc(256, 256, rad, 0, TAU)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o })
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o })
const add = (color, opacity = 1) => basic(color, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}
const sphere = (r, seg = 20) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75))
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14)
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg)
const torus = (r, t, arc = TAU) => new THREE.TorusGeometry(r, t, 10, 32, arc)

// ---------- models: everything faces +Z ----------

function eyes(group, y, z, spread, r, white = '#FFFFFF') {
  for (const s of [-1, 1]) {
    const e = mesh(sphere(r, 12), basic(white), s * spread, y, z)
    e.scale.set(1, 1.2, 0.6)
    const p = mesh(sphere(r * 0.55, 10), basic('#141010'), s * spread, y, z + r * 0.35)
    p.scale.set(1, 1.3, 0.5)
    group.add(e, p)
  }
}

function catModel(coat) {
  const [fur, dark, belly] = COATS[coat] || COATS.gris
  const g = new THREE.Group()
  const m = mat(fur, { roughness: 0.8 })
  const md = mat(dark, { roughness: 0.8 })
  const body = mesh(capsule(0.16, 0.26), m, 0, 0.22, -0.02)
  body.rotation.x = Math.PI / 2
  const bellyM = mesh(sphere(0.13), mat(belly, { roughness: 0.9 }), 0, 0.17, 0.06)
  bellyM.scale.set(0.9, 0.7, 1.1)
  const head = new THREE.Group()
  head.position.set(0, 0.42, 0.2)
  head.add(mesh(sphere(0.17), coat === 'tricolor' ? md : m))
  for (const s of [-1, 1]) {
    const ear = mesh(cone(0.07, 0.13, 4), coat === 'siames' ? md : m, s * 0.1, 0.15, -0.01)
    ear.rotation.z = -s * 0.35
    const inner = mesh(cone(0.04, 0.08, 4), basic('#E89AA0'), s * 0.1, 0.14, 0.02)
    inner.rotation.z = -s * 0.35
    head.add(ear, inner)
  }
  const muzzle = mesh(sphere(0.07), mat(belly), 0, -0.05, 0.13)
  muzzle.scale.set(1.3, 0.8, 0.8)
  head.add(muzzle, mesh(sphere(0.022, 8), basic('#E86A7A'), 0, -0.02, 0.19))
  eyes(head, 0.03, 0.14, 0.065, 0.035, '#C8F25A')
  const paws = []
  for (const [x, z] of [[-0.09, 0.14], [0.09, 0.14], [-0.09, -0.16], [0.09, -0.16]]) {
    const p = mesh(sphere(0.055, 10), coat === 'siames' ? md : m, x, 0.05, z)
    p.scale.set(1, 0.8, 1.3)
    paws.push(p)
    g.add(p)
  }
  const tail = new THREE.Group()
  tail.position.set(0, 0.28, -0.3)
  const tailM = mesh(capsule(0.03, 0.22), coat === 'naranja' || coat === 'gris' ? md : m, 0, 0.13, 0)
  tail.add(tailM)
  tail.rotation.x = -0.5
  g.add(body, bellyM, head, tail)
  return { g, parts: { head, tail, paw: paws[1] } }
}

// the skill: a little Claude critter in lab goggles
function skillModel() {
  const g = new THREE.Group()
  const m = mat('#D97757', { roughness: 0.45 })
  const body = mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3, 2, 2, 2), m, 0, 0.27, 0)
  g.add(body)
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.06, 0.14, 0.06), m, s * 0.13, 0.06, 0.06), mesh(box(0.06, 0.14, 0.06), m, s * 0.13, 0.06, -0.08))
    g.add(mesh(box(0.08, 0.06, 0.08), m, s * 0.25, 0.27, 0))
  }
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.05, 0.08, 0.02), basic('#141010'), s * 0.08, 0.3, 0.155))
    const gog = mesh(torus(0.055, 0.016), mat('#FFFFFF', { metalness: 0.4, roughness: 0.2 }), s * 0.08, 0.31, 0.16)
    g.add(gog)
  }
  g.add(mesh(box(0.42, 0.025, 0.02), mat('#FFFFFF'), 0, 0.31, 0.155))
  return { g, parts: { body } }
}

function robotModel() {
  const g = new THREE.Group()
  const shell = mat('#3D85C6', { metalness: 0.5, roughness: 0.35 })
  const dark = mat('#20344A', { metalness: 0.6, roughness: 0.4 })
  const steel = mat('#B9C3CF', { metalness: 0.9, roughness: 0.25 })
  g.add(mesh(cyl(0.16, 0.2, 0.1, 20), dark, 0, 0.05, 0))
  const torso = mesh(new THREE.BoxGeometry(0.36, 0.34, 0.28), shell, 0, 0.3, 0)
  const head = new THREE.Group()
  head.position.set(0, 0.6, 0)
  head.add(mesh(box(0.3, 0.22, 0.24), shell))
  const visor = mesh(box(0.24, 0.07, 0.02), basic('#7FF0FF'), 0, 0.01, 0.125)
  const visorGlow = glow('#7FF0FF', 0.35, 0.7)
  visorGlow.position.set(0, 0.01, 0.16)
  head.add(visor, visorGlow, mesh(cyl(0.01, 0.01, 0.14, 6), steel, 0, 0.17, 0))
  const bulb = mesh(sphere(0.035, 10), basic('#FF4A4A'), 0, 0.25, 0)
  const bulbGlow = glow('#FF4A4A', 0.25, 0.9)
  bulbGlow.position.copy(bulb.position)
  head.add(bulb, bulbGlow)
  // the piston arm grows along +Z from the shoulder
  const arm = new THREE.Group()
  arm.position.set(0.22, 0.34, 0)
  const rod = mesh(cyl(0.035, 0.035, 1, 12), steel)
  rod.rotation.x = Math.PI / 2
  rod.position.z = 0.5
  const rodHolder = new THREE.Group()
  rodHolder.add(rod)
  rodHolder.scale.z = 0.12
  const fist = mesh(box(0.13, 0.13, 0.11), dark, 0, 0, 0.14)
  arm.add(mesh(cyl(0.07, 0.07, 0.1, 14), dark), rodHolder, fist)
  arm.children[0].rotation.z = Math.PI / 2
  g.add(torso, head, arm, mesh(box(0.14, 0.1, 0.02), basic('#FFD84F'), 0, 0.33, 0.145))
  return { g, parts: { head, arm, rod: rodHolder, fist, bulb: bulbGlow } }
}

function droneModel() {
  const g = new THREE.Group()
  const shell = mat('#E9EEF5', { metalness: 0.3, roughness: 0.3 })
  const dark = mat('#2A3340', { metalness: 0.6, roughness: 0.35 })
  const core = mesh(sphere(0.16), shell)
  core.scale.set(1.2, 0.55, 1.2)
  g.add(core)
  const rotors = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4
    const armM = mesh(box(0.34, 0.03, 0.04), dark, Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17)
    armM.rotation.y = -a
    const rotor = new THREE.Group()
    rotor.position.set(Math.cos(a) * 0.33, 0.04, Math.sin(a) * 0.33)
    const blade = mesh(box(0.26, 0.008, 0.035), dark)
    const blur = mesh(new THREE.CircleGeometry(0.14, 20), add('#BFD8FF', 0.16))
    blur.rotation.x = -Math.PI / 2
    blur.castShadow = false
    rotor.add(blade, blur)
    rotors.push(rotor)
    g.add(armM, rotor)
  }
  const eye = mesh(sphere(0.05, 12), basic('#FF3A5A'), 0, -0.04, 0.17)
  const eyeGlow = glow('#FF3A5A', 0.4, 0.8)
  eyeGlow.position.set(0, -0.04, 0.2)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, -0.06, 0.22)
  g.add(eye, eyeGlow, muzzle)
  return { g, parts: { rotors, eye: eyeGlow, muzzle } }
}

// Claude: a golden starburst that floats over the crew
function claudeModel() {
  const g = new THREE.Group()
  const star = new THREE.Group()
  const m = mat('#F2A33A', { emissive: '#D97757', emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 })
  for (let k = 0; k < 12; k++) {
    const ray = mesh(capsule(0.045, 0.22 + (k % 2) * 0.08), m)
    const a = (k / 12) * TAU
    ray.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0)
    ray.rotation.z = a - Math.PI / 2
    star.add(ray)
  }
  star.add(mesh(sphere(0.1), m))
  const aura = glow('#FFD84F', 1.6, 0.55)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0, 0.2)
  g.add(aura, star, muzzle)
  return { g, parts: { star, aura, muzzle } }
}

// ---------- artifacts ----------

function artModel(id) {
  const g = new THREE.Group()
  const gold = mat('#F5C02A', { metalness: 0.9, roughness: 0.25 })
  const silver = mat('#D8DEE6', { metalness: 0.9, roughness: 0.2 })
  let color = '#9FE8FF'
  if (id === 'pillow') {
    const p = mesh(new THREE.SphereGeometry(0.3, 24, 16), mat('#C9B8F2', { roughness: 0.9 }))
    p.scale.set(1.3, 0.45, 0.9)
    g.add(p)
    color = '#C9B8F2'
  } else if (id === 'glove') {
    const w = mat('#FFFFFF', { roughness: 0.6 })
    const palm = mesh(sphere(0.2), w)
    palm.scale.set(1, 0.55, 1.1)
    g.add(palm)
    for (let k = 0; k < 4; k++) {
      const f = mesh(capsule(0.05, 0.14), w, -0.12 + k * 0.08, -0.02, 0.24)
      f.rotation.x = Math.PI / 2
      g.add(f)
    }
    const thumb = mesh(capsule(0.05, 0.1), w, 0.2, -0.02, 0.05)
    thumb.rotation.z = Math.PI / 2.6
    const cuff = mesh(cyl(0.16, 0.18, 0.1, 20), mat('#E8E2D8'), 0, 0, -0.22)
    cuff.rotation.x = Math.PI / 2
    g.add(thumb, cuff)
    color = '#FFFFFF'
  } else if (id === 'hourglass') {
    const glass = mat('#BFE8FF', { transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1 })
    const top = mesh(cone(0.16, 0.22, 20), glass, 0, 0.12, 0)
    top.rotation.x = Math.PI
    g.add(top, mesh(cone(0.16, 0.22, 20), glass, 0, -0.12, 0))
    g.add(mesh(cone(0.11, 0.12, 20), mat('#F5D27A'), 0, -0.17, 0))
    for (const y of [0.24, -0.24]) g.add(mesh(cyl(0.2, 0.2, 0.04, 20), mat('#8A5A2B'), 0, y, 0))
    for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.015, 0.015, 0.48, 6), mat('#8A5A2B'), Math.cos((k * TAU) / 3) * 0.18, 0, Math.sin((k * TAU) / 3) * 0.18))
    color = '#F5D27A'
  } else if (id === 'tuna') {
    g.add(mesh(cyl(0.2, 0.2, 0.16, 28), silver), mesh(cyl(0.205, 0.205, 0.1, 28), mat('#2E7FD0')))
    const fish = mesh(sphere(0.07), mat('#FFFFFF'), 0, 0, 0.2)
    fish.scale.set(1.6, 0.8, 0.3)
    g.add(fish)
    color = '#6FC3FF'
  } else if (id === 'magnet') {
    const u = mesh(torus(0.18, 0.06, Math.PI), mat('#E8352B', { roughness: 0.35 }))
    u.rotation.z = Math.PI
    g.add(u)
    for (const s of [-1, 1]) g.add(mesh(cyl(0.06, 0.06, 0.12, 14), silver, s * 0.18, 0.06, 0))
    color = '#FF6A5A'
  } else if (id === 'clover') {
    const leaf = mat('#4FC25A', { roughness: 0.5 })
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4
      const l = mesh(sphere(0.12), leaf, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0)
      l.scale.set(1, 1, 0.3)
      g.add(l)
    }
    const stem = mesh(cyl(0.015, 0.015, 0.25, 6), leaf, 0.05, -0.2, 0)
    stem.rotation.z = 0.4
    g.add(stem)
    color = '#7FE37F'
  } else if (id === 'key') {
    const bow = mesh(torus(0.1, 0.035), gold, 0, 0.18, 0)
    g.add(bow, mesh(cyl(0.03, 0.03, 0.42, 10), gold, 0, -0.07, 0), mesh(box(0.1, 0.04, 0.03), gold, 0.05, -0.22, 0), mesh(box(0.07, 0.04, 0.03), gold, 0.04, -0.14, 0))
    color = '#FFD84F'
  } else if (id === 'scroll') {
    const roll = mesh(cyl(0.09, 0.09, 0.44, 20), mat('#F1E2B8', { roughness: 0.9 }))
    roll.rotation.z = Math.PI / 2
    g.add(roll)
    for (const s of [-1, 1]) {
      const knob = mesh(cyl(0.05, 0.05, 0.06, 12), mat('#8A3A2B'), s * 0.25, 0, 0)
      knob.rotation.z = Math.PI / 2
      g.add(knob)
    }
    const seal = mesh(cyl(0.05, 0.05, 0.02, 14), mat('#D02A2A'), 0, 0, 0.09)
    seal.rotation.x = Math.PI / 2
    g.add(seal)
    color = '#F1E2B8'
  } else if (id === 'oil') {
    g.add(mesh(cyl(0.17, 0.17, 0.42, 24), mat('#1E1E22', { metalness: 0.7, roughness: 0.35 })))
    for (const y of [-0.12, 0.12]) g.add(mesh(cyl(0.178, 0.178, 0.025, 24), mat('#3A3A40', { metalness: 0.8 }), 0, y, 0))
    g.add(mesh(cyl(0.175, 0.175, 0.1, 24), mat('#FFC21A')), mesh(cyl(0.03, 0.03, 0.04, 10), silver, 0.08, 0.22, 0))
    color = '#FFC21A'
  } else if (id === 'battery') {
    g.add(mesh(cyl(0.12, 0.12, 0.4, 24), mat('#2E9E4A', { metalness: 0.4, roughness: 0.3 })), mesh(cyl(0.05, 0.05, 0.06, 14), silver, 0, 0.23, 0), mesh(cyl(0.122, 0.122, 0.08, 24), mat('#1A1A1E'), 0, -0.16, 0))
    const bolt = mesh(box(0.05, 0.16, 0.02), basic('#FFE34F'), 0, 0.02, 0.122)
    bolt.rotation.z = 0.4
    g.add(bolt)
    color = '#7FFF8A'
  } else if (id === 'crown') {
    const ring = mesh(cyl(0.22, 0.2, 0.14, 28, true), gold)
    ring.material.side = THREE.DoubleSide
    g.add(ring)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU
      g.add(mesh(cone(0.05, 0.14, 8), gold, Math.cos(a) * 0.21, 0.13, Math.sin(a) * 0.21))
      g.add(mesh(sphere(0.03, 8), basic(k % 2 ? '#FF3A5A' : '#3AA0FF'), Math.cos(a) * 0.215, 0.01, Math.sin(a) * 0.215))
    }
    color = '#FFD84F'
  } else if (id === 'chip') {
    g.add(mesh(box(0.34, 0.05, 0.34), mat('#1F5A3A', { roughness: 0.4 })), mesh(box(0.18, 0.06, 0.18), mat('#14171C', { metalness: 0.5, roughness: 0.3 })))
    for (let k = 0; k < 5; k++)
      for (const s of [-1, 1]) {
        g.add(mesh(box(0.03, 0.02, 0.06), gold, -0.12 + k * 0.06, 0, s * 0.2))
        g.add(mesh(box(0.06, 0.02, 0.03), gold, s * 0.2, 0, -0.12 + k * 0.06))
      }
    g.rotation.x = 0.6
    color = '#7FFFC8'
  } else if (id === 'relic') {
    g.add(mesh(sphere(0.2, 28), mat('#7A4CFF', { emissive: '#4A1CC0', emissiveIntensity: 0.9, roughness: 0.3 })))
    const r = mesh(torus(0.32, 0.018), basic('#E0C8FF'))
    r.rotation.x = Math.PI / 2.4
    g.add(r)
    color = '#B46CFF'
  }
  const halo = glow(color, 0.9, 0.35)
  g.add(halo)
  return { g, color, halo }
}

// the helper artifacts sit on pedestals behind their crew; the rest circle above the button
const ART_HOME = { tuna: 'cat', scroll: 'skill', oil: 'robot', battery: 'drone', chip: 'claude' }
const ORBITERS = ['pillow', 'hourglass', 'magnet', 'clover', 'key', 'relic']

// ---------- the evil cat ----------

function bossModel(i) {
  const g = new THREE.Group()
  const fur = mat('#1E191C', { roughness: 0.75 })
  const body = new THREE.Group()
  g.add(body)
  const torso = mesh(sphere(0.45, 28), fur, 0, 0.5, 0)
  torso.scale.set(1, 0.95, 0.85)
  body.add(torso)
  const head = new THREE.Group()
  head.position.set(0, 1.18, 0.05)
  head.add(mesh(sphere(0.38, 28), fur))
  for (const s of [-1, 1]) {
    const ear = mesh(cone(0.15, 0.32, 4), fur, s * 0.24, 0.33, -0.02)
    ear.rotation.z = -s * 0.4
    const inner = mesh(cone(0.08, 0.18, 4), basic('#6A2034'), s * 0.23, 0.31, 0.04)
    inner.rotation.z = -s * 0.4
    head.add(ear, inner)
  }
  const eyeMat = basic('#FF2A3A')
  const eyesG = []
  for (const s of [-1, 1]) {
    const e = mesh(sphere(0.075, 14), eyeMat, s * 0.14, 0.05, 0.31)
    e.scale.set(1.2, 0.8, 0.6)
    const slit = mesh(box(0.02, 0.09, 0.02), basic('#200000'), s * 0.14, 0.05, 0.36)
    const eg = glow('#FF2A3A', 0.45, 0.9)
    eg.position.set(s * 0.14, 0.05, 0.38)
    head.add(e, slit, eg)
    eyesG.push(eg)
  }
  const mono = mesh(torus(0.11, 0.018), mat('#FFD84F', { metalness: 0.9, roughness: 0.2 }), 0.14, 0.05, 0.37)
  const chain = mesh(cyl(0.006, 0.006, 0.4, 4), mat('#FFD84F', { metalness: 0.9 }), 0.24, -0.14, 0.34)
  chain.rotation.z = 0.3
  head.add(mono, chain)
  const grin = mesh(torus(0.1, 0.012, Math.PI), basic('#FFFFFF'), 0, -0.12, 0.33)
  grin.rotation.z = Math.PI
  head.add(grin)
  for (const s of [-1, 1]) {
    head.add(mesh(cone(0.018, 0.06, 4), basic('#FFFFFF'), s * 0.05, -0.2, 0.33))
    for (const t of [-0.04, 0.03]) {
      const w = mesh(cyl(0.004, 0.004, 0.42, 3), basic('#BBBBBB'), s * 0.3, -0.1 + t, 0.25)
      w.rotation.z = Math.PI / 2 + s * t * 3
      head.add(w)
    }
  }
  body.add(head)
  // cape: a cloth that waves, its vertices are moved every frame
  const capeGeo = new THREE.PlaneGeometry(0.85, 0.62, 10, 10)
  const cape = new THREE.Mesh(capeGeo, mat('#B3122A', { side: THREE.DoubleSide, roughness: 0.6 }))
  cape.position.set(0, 0.64, -0.36)
  cape.castShadow = true
  cape.userData.rest = capeGeo.attributes.position.array.slice()
  body.add(cape)
  const collar = mesh(torus(0.3, 0.05), mat('#B3122A'), 0, 0.92, 0)
  collar.rotation.x = Math.PI / 2
  body.add(collar)
  const paw = mesh(sphere(0.12), fur, 0.36, 0.62, 0.22)
  body.add(paw, mesh(sphere(0.12), fur, -0.36, 0.55, 0.18))
  for (const s of [-1, 1]) body.add(mesh(sphere(0.14), fur, s * 0.22, 0.08, 0.15))
  const tail = new THREE.Group()
  tail.position.set(0.3, 0.35, -0.3)
  const tailM = mesh(capsule(0.06, 0.6), fur, 0, 0.35, 0)
  tail.add(tailM)
  tail.rotation.z = -0.5
  body.add(tail)
  if (i >= 1) {
    const plate = mesh(new THREE.SphereGeometry(0.47, 24, 12, 0, TAU, Math.PI * 0.25, Math.PI * 0.5), mat('#9AA3AE', { metalness: 0.9, roughness: 0.3 }), 0, 0.5, 0)
    plate.scale.set(1.02, 0.97, 0.9)
    body.add(plate)
    for (const s of [-1, 1]) body.add(mesh(sphere(0.16, 14), mat('#8A939E', { metalness: 0.9, roughness: 0.3 }), s * 0.42, 0.78, 0))
  }
  let aura = null
  if (i >= 2) {
    const crown = artModel('crown').g
    crown.scale.setScalar(1.2)
    crown.position.set(0, 0.42, 0)
    head.add(crown)
    aura = glow('#B46CFF', 3.4, 0.5)
    aura.position.y = 0.9
    g.add(aura)
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), basic('#000000', { transparent: true, opacity: 0.35, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.012
  g.add(shadow)
  const furMats = [fur]
  return { g, body, head, cape, paw, tail, eyes: eyesG, aura, furMats, shadow }
}

function chestModel() {
  const g = new THREE.Group()
  const wood = mat('#8A5A2B', { roughness: 0.7 })
  const band = mat('#C9A24A', { metalness: 0.8, roughness: 0.3 })
  const body = new THREE.Group()
  g.add(body)
  body.add(mesh(box(0.6, 0.34, 0.4), wood, 0, 0.17, 0))
  for (const x of [-0.22, 0.22]) body.add(mesh(box(0.05, 0.35, 0.41), band, x, 0.17, 0))
  const lid = new THREE.Group()
  lid.position.set(0, 0.34, -0.2)
  const top = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 20, 1, false, 0, Math.PI), wood, 0, 0, 0.2)
  top.rotation.z = Math.PI / 2
  lid.add(top)
  for (const x of [-0.22, 0.22]) {
    const b = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 20, 1, false, 0, Math.PI), band, x, 0, 0.2)
    b.rotation.z = Math.PI / 2
    lid.add(b)
  }
  body.add(lid, mesh(box(0.1, 0.12, 0.04), mat('#FFD84F', { metalness: 0.8, roughness: 0.25 }), 0, 0.3, 0.21))
  const inner = glow('#FFE7A0', 0.01, 0)
  inner.position.set(0, 0.45, 0)
  body.add(inner)
  return { g, body, lid, inner }
}

// ---------- the stage ----------

export function create(canvas, opts) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  if (!renderer.getContext()) return null
  const calm = opts.calm || (() => false)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  const target = new THREE.Vector3(0.4, 0.35, 0.15)

  scene.add(new THREE.HemisphereLight('#FFF0E8', '#3A2420', 1.1))
  const sun = new THREE.DirectionalLight('#FFF1E0', 2.2)
  sun.position.set(-3, 7, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 })
  sun.shadow.bias = -0.0015
  sun.shadow.radius = 4
  scene.add(sun)
  const redLight = new THREE.PointLight('#FF3A2A', 3, 5, 1.8)
  redLight.position.set(0, 1.3, 0.4)
  scene.add(redLight)
  const rim = new THREE.DirectionalLight('#7FA8FF', 0.8)
  rim.position.set(4, 3, -5)
  scene.add(rim)

  // floor: a round platform with lights round its edge
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.2, 0.16, 96), [mat('#1A1312', { roughness: 0.6, metalness: 0.4 }), mat('#2A1D1B', { map: floorTexture(), roughness: 0.55, metalness: 0.3 }), mat('#100B0A')])
  floor.position.y = -0.08
  floor.receiveShadow = true
  scene.add(floor)
  const edge = new THREE.Mesh(torus(3.08, 0.025), add('#FF5A4A', 0.6))
  edge.rotation.x = Math.PI / 2
  edge.position.y = 0.005
  scene.add(edge)
  const runway = []
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU
    const l = new THREE.Mesh(box(0.1, 0.03, 0.05), basic('#FF5A4A'))
    l.position.set(Math.cos(a) * 2.88, 0.015, Math.sin(a) * 2.88)
    l.rotation.y = -a
    scene.add(l)
    runway.push(l)
  }
  const spinRing = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.4, 64, 1, 0, TAU * 0.8), add('#FF8A6A', 0.35))
  spinRing.rotation.x = -Math.PI / 2
  spinRing.position.y = 0.004
  scene.add(spinRing)

  // the button
  const button = new THREE.Group()
  scene.add(button)
  const metal = mat('#5A606B', { metalness: 0.85, roughness: 0.32 })
  const base = mesh(cyl(1.0, 1.1, 0.34, 64), metal, 0, 0.17, 0)
  base.receiveShadow = true
  const lip = mesh(torus(0.86, 0.06), mat('#7A818C', { metalness: 0.9, roughness: 0.2 }), 0, 0.34, 0)
  lip.rotation.x = Math.PI / 2
  const well = mesh(cyl(0.8, 0.8, 0.03, 48), mat('#15171B', { roughness: 0.4 }), 0, 0.345, 0)
  button.add(base, lip, well)
  const leds = []
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * TAU
    const l = new THREE.Mesh(sphere(0.035, 8), basic('#FF5A4A'))
    l.position.set(Math.cos(a) * 1.02, 0.25, Math.sin(a) * 1.02)
    const lg = glow('#FF5A4A', 0.22, 0.6)
    lg.position.copy(l.position)
    button.add(l, lg)
    leds.push({ l, lg })
  }
  const capPivot = new THREE.Group()
  capPivot.position.y = 0.34
  button.add(capPivot)
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#E8352B', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, emissive: '#FF2A1A', emissiveIntensity: 0.12 })
  const capSide = mesh(cyl(0.7, 0.72, 0.3, 64), capMat, 0, 0.15, 0)
  const capTop = mesh(new THREE.SphereGeometry(0.7, 64, 24, 0, TAU, 0, Math.PI / 2), capMat, 0, 0.3, 0)
  capTop.scale.y = 0.24
  capPivot.add(capSide, capTop)
  const capHalo = glow('#FF4A3A', 3.2, 0.25)
  capHalo.position.set(0, 0.5, 0)
  scene.add(capHalo)
  const pickables = { button: [base, capSide, capTop, well, lip], chest: [] }

  // ---------- generic effects ----------

  const tweens = []
  const tween = (dur, fn, done, delay = 0) => tweens.push({ t0: performance.now() + delay, dur, fn, done })
  const fxObjs = []
  function shockwave(y, color, size = 1, speed = 1) {
    if (calm()) return
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), add(color, 0.8))
    m.rotation.x = -Math.PI / 2
    m.position.y = y
    scene.add(m)
    fxObjs.push({ m, life: 1, decay: 0.035 * speed, update: (o, k) => {
      o.m.scale.setScalar(size * (1 + (1 - k) * 1.6))
      o.m.material.opacity = k * k * 0.8
    } })
  }
  const chipGeo = box(0.07, 0.035, 0.07)
  const coinGeo = cyl(0.07, 0.07, 0.02, 16)
  const chipMats = { red: mat('#E8352B', { roughness: 0.3 }), gold: mat('#FFC83A', { metalness: 0.9, roughness: 0.25, emissive: '#5A3A00' }), cyan: mat('#9FE8FF', { emissive: '#3AA8D0', emissiveIntensity: 0.7 }) }
  // debris that jumps out, bounces on the floor and fades
  function debris(origin, n, kind = 'red', power = 1) {
    if (calm()) n = Math.min(n, 2)
    for (let k = 0; k < n; k++) {
      if (fxObjs.length > 260) return
      const m = new THREE.Mesh(kind === 'gold' ? coinGeo : chipGeo, chipMats[kind])
      m.castShadow = true
      m.position.copy(origin)
      const a = rnd(0, TAU)
      const v = rnd(0.02, 0.06) * power
      const o = { m, life: 1, decay: rnd(0.008, 0.014), vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(0.05, 0.11) * power, sx: rnd(-0.3, 0.3), sz: rnd(-0.3, 0.3) }
      o.update = (q, life) => {
        q.vy -= 0.006
        q.m.position.x += q.vx
        q.m.position.y += q.vy
        q.m.position.z += q.vz
        if (q.m.position.y < 0.03) {
          q.m.position.y = 0.03
          q.vy = Math.abs(q.vy) * 0.45
          q.vx *= 0.7
          q.vz *= 0.7
          q.sx *= 0.6
          q.sz *= 0.6
        }
        q.m.rotation.x += q.sx
        q.m.rotation.z += q.sz
        q.m.scale.setScalar(Math.min(1, life * 4))
      }
      scene.add(m)
      fxObjs.push(o)
    }
  }
  // a straight beam of light (laser, chest column)
  function beam(from, to, color, width, dur) {
    const len = from.distanceTo(to)
    const grp = new THREE.Group()
    const outer = new THREE.Mesh(cyl(1, 1, 1, 12, true), add(color, 0.55))
    const inner = new THREE.Mesh(cyl(0.4, 0.4, 1, 8, true), add('#FFFFFF', 0.95))
    grp.add(outer, inner)
    grp.position.copy(from).add(to).multiplyScalar(0.5)
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    grp.scale.set(width, len, width)
    const endGlow = glow(color, width * 8, 0.8)
    endGlow.position.copy(to)
    scene.add(grp, endGlow)
    const t0 = performance.now()
    fxObjs.push({ m: grp, extra: endGlow, life: 1, decay: 16 / dur, update: (o, k) => {
      const w = width * (0.3 + k * 0.9) * (1 + Math.sin((performance.now() - t0) * 0.08) * 0.15)
      o.m.scale.set(w, len, w)
      outer.material.opacity = k * 0.6
      inner.material.opacity = k
      o.extra.material.opacity = k
    } })
  }
  function flare(pos, color, size, decay = 0.06) {
    const s = glow(color, size, 1)
    s.position.copy(pos)
    scene.add(s)
    fxObjs.push({ m: s, life: 1, decay, update: (o, k) => {
      o.m.scale.setScalar(size * (1.4 - k * 0.4))
      o.m.material.opacity = k
    } })
  }

  // ---------- camera ----------

  const cam = { shake: 0, punch: 0, sway: 0, w: 1, h: 1, focus: null }
  // a short dolly towards something that matters (Zarpas landing, a new artifact)
  const focusOn = (p, ms) => !calm() && (cam.focus = { p: p.clone(), t0: performance.now(), ms })
  const look = new THREE.Vector3()
  function placeCamera(now) {
    let f = 0
    look.copy(target)
    if (cam.focus) {
      const k = (now - cam.focus.t0) / cam.focus.ms
      if (k >= 1) cam.focus = null
      else {
        f = Math.sin(clamp01(k) * Math.PI) ** 0.6
        look.lerp(cam.focus.p, f * 0.45)
      }
    }
    const aspect = cam.w / cam.h
    const vf = THREE.MathUtils.degToRad(camera.fov)
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect)
    const dist = Math.max(3.95 / Math.tan(hf / 2), 2.45 / Math.tan(vf / 2)) * (1 - cam.punch * 0.06 - f * 0.22)
    const el = THREE.MathUtils.degToRad(31)
    const az = calm() ? 0 : Math.sin(now * 0.00017) * 0.06
    camera.position.set(look.x + Math.sin(az) * Math.cos(el) * dist, look.y + Math.sin(el) * dist, look.z + Math.cos(az) * Math.cos(el) * dist)
    if (cam.shake > 0.001) camera.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(cam.shake * 0.012))
    camera.lookAt(look)
    if (cam.shake > 0.001) camera.rotateZ(rnd(-1, 1) * cam.shake * 0.0015)
    camera.updateProjectionMatrix()
  }
  function resize(w, h) {
    cam.w = Math.max(1, w)
    cam.h = Math.max(1, h)
    renderer.setSize(cam.w, cam.h, false)
    camera.aspect = cam.w / cam.h
    placeCamera(performance.now())
  }
  const v = new THREE.Vector3()
  function toPx(p) {
    v.copy(p).project(camera)
    return { x: ((v.x + 1) / 2) * cam.w, y: ((1 - v.y) / 2) * cam.h }
  }
  // old arena coordinates: below the cap top they lie on the floor, above it they rise over the button
  function arenaWorld(x, y) {
    if (y >= 20) return new THREE.Vector3(x * S, 0.3, ((y - 20) * S) / 0.44)
    return new THREE.Vector3(x * S, 0.3 + (20 - y) * S * 1.05, 0)
  }

  // ---------- the cap: a spring, so hits pile up ----------

  const cap = { y: 0, v: 0, flash: 0 }
  function capHit(force) {
    cap.v -= 0.05 * force
    cap.flash = Math.min(1, cap.flash + force * force * 0.6)
  }

  // ---------- the crew ----------

  const crew = []
  const homeOf = {}
  function clearCrew() {
    for (const c of crew) scene.remove(c.rig)
    crew.length = 0
    for (const k in homeOf) delete homeOf[k]
  }
  function addHelper(kind, angle, coat) {
    const built = kind === 'cat' ? catModel(coat) : kind === 'skill' ? skillModel() : kind === 'robot' ? robotModel() : kind === 'drone' ? droneModel() : claudeModel()
    const rig = new THREE.Group()
    const r = kind === 'drone' || kind === 'claude' ? RING * 0.92 : RING
    const hover = kind === 'drone' ? 1.45 : kind === 'claude' ? 1.95 : 0
    rig.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r)
    rig.lookAt(0, 0, 0)
    const body = new THREE.Group()
    body.position.y = hover
    body.add(built.g)
    rig.add(body)
    const scale = { cat: 0.85, skill: 0.85, robot: 0.9, drone: 1, claude: 0.75 }[kind]
    built.g.scale.setScalar(scale)
    if (hover) {
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), basic('#000000', { transparent: true, opacity: 0.22, depthWrite: false }))
      sh.rotation.x = -Math.PI / 2
      sh.position.y = 0.012
      rig.add(sh)
    }
    scene.add(rig)
    const c = { kind, rig, body, parts: built.parts, hover, r, phase: rnd(0, TAU), anim: null }
    crew.push(c)
    homeOf[kind] = homeOf[kind] || []
    homeOf[kind].push(angle)
    return c
  }
  const tmp = new THREE.Vector3()
  // the point on the cap rim that faces a helper
  function impactFor(c, up = 0) {
    const d = tmp.set(c.rig.position.x, 0, c.rig.position.z).normalize()
    return new THREE.Vector3(d.x * 0.62, CAP_TOP + up + cap.y, d.z * 0.62)
  }
  // a helper's press: wind-up, strike, a hold on impact, springy recovery. onHit(impactPx, headPx)
  function helperPress(c, dur, onHit) {
    const head = () => toPx(c.body.localToWorld(new THREE.Vector3(0, 0.75, 0)))
    if (calm()) return onHit(toPx(impactFor(c)), head())
    const reach = c.r - 0.75
    if (c.kind === 'cat') {
      c.anim = { t0: performance.now(), dur, fn: k => {
        // crouch → pounce → paw swipe → hop back
        const z = k < 0.25 ? -0.12 * smooth(k / 0.25) : k < 0.45 ? lerp(-0.12, reach * 0.62, smooth((k - 0.25) / 0.2)) : k < 0.62 ? reach * 0.62 : lerp(reach * 0.62, 0, smooth((k - 0.62) / 0.38))
        const y = k > 0.25 && k < 0.45 ? Math.sin(((k - 0.25) / 0.2) * Math.PI) * 0.35 : k > 0.62 ? Math.sin(((k - 0.62) / 0.38) * Math.PI) * 0.18 : 0
        c.body.position.set(0, y, z)
        c.body.rotation.x = k < 0.25 ? 0.15 * (k / 0.25) : k < 0.45 ? -0.45 : k < 0.62 ? -0.2 : 0
        const sq = k < 0.25 ? 1 - 0.18 * (k / 0.25) : k < 0.3 ? 1.12 : 1
        c.body.scale.set(2 - sq, sq, 2 - sq)
        c.parts.paw.position.y = k > 0.42 && k < 0.62 ? 0.05 + Math.sin(((k - 0.42) / 0.2) * Math.PI) * 0.22 : 0.05
        c.parts.paw.position.z = k > 0.42 && k < 0.62 ? 0.14 + Math.sin(((k - 0.42) / 0.2) * Math.PI) * 0.18 : 0.14
      } }
      setTimeout(() => onHit(toPx(impactFor(c)), head()), dur * 0.47)
    } else if (c.kind === 'skill') {
      dur *= 1.35
      c.anim = { t0: performance.now(), dur, fn: k => {
        const hop = k < 0.15 ? 0 : k < 0.62 ? Math.sin(((k - 0.15) / 0.47) * Math.PI) * 0.95 : k < 0.9 ? Math.sin(((k - 0.62) / 0.28) * Math.PI) * 0.3 : 0
        const z = k < 0.15 ? 0 : k < 0.62 ? lerp(0, reach * 0.55, smooth((k - 0.15) / 0.47)) : lerp(reach * 0.55, 0, smooth((k - 0.62) / 0.38))
        const sq = k < 0.15 ? 1 - 0.3 * Math.sin((k / 0.15) * Math.PI) : Math.abs(k - 0.62) < 0.05 ? 0.62 : k < 0.62 ? 1.15 : 1
        c.body.position.set(0, hop, z)
        c.body.scale.set(1 + (1 - sq) * 0.8, sq, 1 + (1 - sq) * 0.8)
        c.body.rotation.x = k > 0.15 && k < 0.62 ? -0.3 + ((k - 0.15) / 0.47) * 0.9 : 0
      } }
      setTimeout(() => onHit(toPx(impactFor(c)), head()), dur * 0.6)
    } else if (c.kind === 'robot') {
      const len = reach - 0.05
      c.anim = { t0: performance.now(), dur, fn: k => {
        // the arm points at the cap and the piston shoots out with an overshoot
        c.parts.arm.lookAt(tmp.set(0, CAP_TOP + 0.05, 0))
        const ext = k < 0.15 ? -0.08 * (k / 0.15) : k < 0.4 ? easeOutBack((k - 0.15) / 0.25) : k < 0.55 ? 1 : 1 - ((k - 0.55) / 0.45) ** 2
        c.parts.rod.scale.z = 0.12 + Math.max(0, ext) * len * 1.7
        c.parts.fist.position.z = 0.14 + Math.max(0, ext) * len * 1.7
        c.body.rotation.x = k < 0.15 ? -0.12 * (k / 0.15) : k < 0.5 ? 0.06 : 0
        c.body.position.z = k > 0.15 && k < 0.5 ? -0.06 : 0
      } }
      setTimeout(() => {
        onHit(toPx(impactFor(c)), head())
        debris(impactFor(c), 2, 'red', 0.7)
      }, dur * 0.4)
    } else {
      const big = c.kind === 'claude'
      dur *= 1.2
      const muzzle = () => c.parts.muzzle.getWorldPosition(new THREE.Vector3())
      flare(muzzle(), big ? '#FFD84F' : '#FF3A5A', big ? 0.9 : 0.5, 0.035)
      c.anim = { t0: performance.now(), dur, fn: k => {
        c.body.position.y = c.hover + (k < 0.3 ? -0.06 * (k / 0.3) : k < 0.42 ? 0.16 : 0.16 * (1 - (k - 0.42) / 0.58))
        c.body.rotation.x = k < 0.4 ? 0.35 * (k / 0.4) : 0.35 * (1 - (k - 0.4) / 0.6)
        if (big) c.parts.star.rotation.z += 0.02 + (k < 0.45 ? k * 0.4 : 0)
      } }
      setTimeout(() => {
        const to = impactFor(c, -0.02).multiplyScalar(0.4).setY(CAP_TOP + cap.y)
        beam(muzzle(), to, big ? '#FFD84F' : '#FF3A5A', big ? 0.05 : 0.025, dur * 0.55)
        flare(to, big ? '#FFE07A' : '#FF6A8A', big ? 0.8 : 0.4, 0.09)
        onHit(toPx(to), head(), toPx(muzzle()))
      }, dur * 0.4)
    }
  }

  // ---------- artifacts ----------

  const arts = {}
  let artList = []
  function artSlot(id, now) {
    if (id === 'crown') return capPivot.localToWorld(new THREE.Vector3(0, 0.42, 0))
    if (id === 'glove') return new THREE.Vector3(-0.75, 1.55 + Math.sin(now * 0.002) * 0.08, 0.75)
    if (ART_HOME[id]) {
      const angles = homeOf[ART_HOME[id]]
      const fallback = { cat: 2.3, skill: 3.3, robot: 4.4, drone: 5.4, claude: 0.8 }[ART_HOME[id]]
      const a = angles && angles.length ? angles.reduce((s, x) => s + x, 0) / angles.length : fallback
      return new THREE.Vector3(Math.cos(a) * 2.75, 0.42 + Math.sin(now * 0.002 + a) * 0.05, Math.sin(a) * 3.0)
    }
    const owned = ORBITERS.filter(o => arts[o])
    const k = owned.indexOf(id)
    const a = now * 0.00035 + (k / Math.max(1, owned.length)) * TAU
    return new THREE.Vector3(Math.cos(a) * 1.45, 1.75 + Math.sin(now * 0.0021 + k) * 0.1, Math.sin(a) * 1.15)
  }
  function setArts(ids, reveal, onLand) {
    for (const id of ids) {
      if (arts[id]) continue
      const a = artModel(id)
      const item = { ...a, id, spin: rnd(0, TAU) }
      if (ART_HOME[id]) {
        // a little pedestal under the trophies
        const ped = new THREE.Group()
        ped.add(mesh(cyl(0.16, 0.2, 0.3, 20), mat('#3A3036', { metalness: 0.5, roughness: 0.4 }), 0, 0.15, 0), mesh(cyl(0.2, 0.2, 0.03, 20), add(a.color, 0.6), 0, 0.31, 0))
        item.ped = ped
        scene.add(ped)
      }
      if (id === 'crown') a.g.scale.setScalar(1.1)
      if (id === 'glove') a.g.scale.setScalar(1.3)
      scene.add(a.g)
      arts[id] = item
      if (id === reveal && !calm()) {
        // the reveal: it appears big in front of the button, spins in a burst of light and flies to its place
        item.reveal = { t0: performance.now(), from: new THREE.Vector3(0, 1.5, 1.6) }
        flare(item.reveal.from, a.color, 4, 0.02)
        focusOn(item.reveal.from, 1500)
        shockwave(0.05, a.color, 1.4, 0.6)
        setTimeout(() => onLand && onLand(toPx(artSlot(id, performance.now()))), 1700)
      }
    }
    artList = Object.values(arts)
  }
  let gloveSlap = 0
  function playerPress(crit) {
    if (arts.glove && !calm()) gloveSlap = performance.now()
    shockwave(0.36, crit ? '#FFD84F' : '#FF6A5A', 1, crit ? 0.7 : 1)
    if (crit) shockwave(0.05, '#FFFFFF', 1.2, 1.2)
    debris(new THREE.Vector3(rnd(-0.3, 0.3), CAP_TOP, rnd(-0.2, 0.3)), crit ? 14 : 3, crit ? 'gold' : 'red', crit ? 1.3 : 1)
    if (crit) flare(new THREE.Vector3(0, CAP_TOP + 0.1, 0.2), '#FFE07A', 2.2, 0.08)
  }

  // ---------- chest ----------

  let chest = null
  function chestShow() {
    if (chest) return
    chest = chestModel()
    chest.g.position.set(0, 0, 2.45)
    chest.t0 = performance.now()
    chest.state = 'drop'
    scene.add(chest.g)
    pickables.chest = []
    chest.g.traverse(o => o.isMesh && pickables.chest.push(o))
  }
  function chestOpen(color, tier) {
    if (!chest) return
    const c = chest
    c.state = 'open'
    c.t0 = performance.now()
    pickables.chest = []
    const top = new THREE.Vector3(0, 0.4, 2.45)
    beam(top, top.clone().setY(6), color, 0.18 + tier * 0.08, 1300)
    flare(top, color, 3 + tier * 1.5, 0.03)
    shockwave(0.05, color, 0.9 + tier * 0.3, 0.7)
    debris(top, 6 + tier * 6, 'gold', 1.2)
    if (tier >= 1) debris(top, tier * 3, 'cyan', 1.1)
  }

  // ---------- boss ----------

  let boss = null
  const BOSS_AT = new THREE.Vector3(2.35, 0, 0.55)
  function bossShow(i) {
    if (boss) scene.remove(boss.g)
    boss = bossModel(i)
    boss.g.position.copy(BOSS_AT)
    boss.g.rotation.y = -0.75
    boss.g.scale.setScalar(0.85)
    boss.state = 'drop'
    boss.t0 = performance.now()
    boss.hurt = 0
    scene.add(boss.g)
    focusOn(BOSS_AT.clone().setY(0.8), 1700)
  }
  function bossHurt(crit) {
    if (!boss) return
    boss.hurt = crit ? 1 : 0.6
    boss.knock = (crit ? 0.25 : 0.1) + (boss.knock || 0)
    if (crit) debris(boss.head.getWorldPosition(new THREE.Vector3()), 4, 'cyan', 0.8)
  }
  function bossSwipe() {
    if (boss) boss.swipe = performance.now()
  }
  function bossGone(how) {
    if (!boss) return
    boss.state = how
    boss.t0 = performance.now()
    if (how === 'win') {
      const p = boss.head.getWorldPosition(new THREE.Vector3())
      flare(p, '#FF5A6A', 5, 0.025)
      shockwave(0.05, '#FF5A6A', 2.2, 0.5)
      debris(p, 20, 'gold', 1.6)
    }
  }
  const bossHead = () => (boss ? toPx(boss.head.localToWorld(new THREE.Vector3(0, 0.45, 0))) : null)

  // ---------- picking ----------

  const ray = new THREE.Raycaster()
  function pick(x, y) {
    ray.setFromCamera(new THREE.Vector2((x / cam.w) * 2 - 1, -(y / cam.h) * 2 + 1), camera)
    if (pickables.chest.length && ray.intersectObjects(pickables.chest, false).length) return 'chest'
    if (ray.intersectObjects(pickables.button, false).length) return 'button'
    return null
  }

  // ---------- the frame ----------

  const gold = new THREE.Color('#FFC21A')
  const red = new THREE.Color('#E8352B')
  const tmpC = new THREE.Color()
  let last = performance.now()
  function frame(st) {
    const now = performance.now()
    const dt = Math.min(50, now - last) / 16.67
    last = now
    const still = calm()
    // the cap spring
    if (!st.frozen) {
      cap.v += (-cap.y * 0.28 - cap.v * 0.32) * dt
      cap.y = Math.max(-0.2, cap.y + cap.v * dt)
    }
    const sq = -cap.y
    capPivot.position.y = 0.34 + cap.y
    capPivot.scale.set(1 + sq * 0.35, 1 - sq * 1.6, 1 + sq * 0.35)
    cap.flash *= 0.86 ** dt
    tmpC.copy(st.gold ? gold : red)
    capMat.color.lerp(tmpC, 0.12)
    capMat.emissive.copy(st.gold ? gold : new THREE.Color('#FF2A1A'))
    capMat.emissiveIntensity = 0.12 + st.heat * 0.2 + cap.flash * 0.45
    redLight.color.copy(st.gold ? gold : new THREE.Color('#FF3A2A'))
    redLight.intensity = 2.5 + st.heat * 4 + st.rayBoost * 6 + cap.flash * 4
    capHalo.material.color.copy(st.gold ? gold : new THREE.Color('#FF4A3A'))
    capHalo.material.opacity = 0.15 + st.heat * 0.2 + st.rayBoost * 0.25
    capHalo.scale.setScalar(3 + st.rayBoost * 1.6 + st.heat)
    // LEDs: three chasers that speed up with production
    const n = leds.length
    leds.forEach((L, i) => {
      let b = st.ledFlash
      for (let k = 0; k < 3; k++) {
        const pos = (((now * st.speed + (k * n) / 3) % n) + n) % n
        const d = Math.min(Math.abs(i - pos), n - Math.abs(i - pos))
        b = Math.max(b, 1 - d / 3)
      }
      L.l.material.color.setRGB(1, st.gold ? 0.85 : 0.3 + b * 0.6, st.gold ? 0.3 : 0.25 + b * 0.45)
      L.lg.material.color.copy(L.l.material.color)
      L.lg.material.opacity = 0.15 + b * 0.85
    })
    runway.forEach((l, i) => {
      const pos = (now * st.speed * 1.6) % runway.length
      const d = Math.min(Math.abs(i - pos), runway.length - Math.abs(i - pos))
      const b = Math.max(0.15, 1 - d / 5, st.ledFlash * 0.8)
      l.material.color.setRGB(b, st.gold ? b * 0.8 : b * 0.35, st.gold ? b * 0.2 : b * 0.25)
    })
    if (!still) spinRing.rotation.z += 0.004 + st.heat * 0.03 + st.rayBoost * 0.05
    edge.material.opacity = 0.35 + st.heat * 0.4 + st.rayBoost * 0.3
    // crew: idle life plus the press in progress
    for (const c of crew) {
      const t = now * 0.001 + c.phase
      if (c.anim) {
        const k = (now - c.anim.t0) / c.anim.dur
        if (k >= 1) {
          c.anim = null
          c.body.position.set(0, c.hover, 0)
          c.body.rotation.set(0, 0, 0)
          c.body.scale.set(1, 1, 1)
          if (c.kind === 'robot') {
            c.parts.rod.scale.z = 0.12
            c.parts.fist.position.z = 0.14
          }
        } else c.anim.fn(k)
      } else if (!still) {
        const breathe = 1 + Math.sin(t * 2.4) * 0.03
        c.body.scale.set(1 + (1 - breathe) * 0.5, breathe, 1 + (1 - breathe) * 0.5)
        if (c.hover) c.body.position.y = c.hover + Math.sin(t * 2.2) * 0.07
      }
      if (still) continue
      if (c.kind === 'cat') {
        c.parts.tail.rotation.z = Math.sin(t * 3) * 0.5
        c.parts.head.rotation.y = Math.sin(t * 0.7) * 0.25
      } else if (c.kind === 'drone') {
        for (const r of c.parts.rotors) r.rotation.y += 0.9
        c.body.rotation.z = Math.sin(t * 1.7) * 0.06
      } else if (c.kind === 'claude') {
        c.parts.star.rotation.z += 0.01 + st.heat * 0.03
        c.parts.star.rotation.y = Math.sin(t) * 0.4
        c.parts.aura.material.opacity = 0.4 + Math.sin(t * 3) * 0.15
      } else if (c.kind === 'robot') {
        c.parts.bulb.material.opacity = Math.sin(t * 6) > 0 ? 0.95 : 0.2
        c.parts.head.rotation.y = Math.sin(t * 0.9) * 0.3
      }
    }
    // artifacts float in their places; the glove slaps the button with the player
    for (const a of artList) {
      const slot = artSlot(a.id, now)
      if (a.ped) a.ped.position.set(slot.x, 0, slot.z)
      if (a.ped) slot.y += 0.36
      if (a.reveal) {
        const k = (now - a.reveal.t0) / 1700
        if (k >= 1) a.reveal = null
        else {
          const grow = k < 0.2 ? easeOutBack(k / 0.2) : 1
          const fly = smooth(clamp01((k - 0.55) / 0.45))
          a.g.position.copy(a.reveal.from).lerp(slot, fly)
          a.g.position.y += Math.sin(fly * Math.PI) * 0.8
          a.g.scale.setScalar(lerp(2.6 * grow, a.id === 'glove' ? 1.3 : a.id === 'crown' ? 1.1 : 1, fly))
          a.g.rotation.y = a.spin + k * 14
          a.halo.material.opacity = 1 - fly * 0.65
          a.halo.scale.setScalar(2.4 - fly * 1.5)
          continue
        }
      }
      a.g.position.copy(slot)
      if (a.id === 'glove' && gloveSlap) {
        const k = (now - gloveSlap) / 260
        if (k >= 1) gloveSlap = 0
        else {
          const s = k < 0.35 ? easeIn(k / 0.35) : 1 - smooth((k - 0.35) / 0.65)
          a.g.position.lerp(new THREE.Vector3(0.15, CAP_TOP + 0.28 + cap.y, 0.1), s)
        }
        a.g.rotation.set(0.2, -0.6, 0)
      } else if (a.id === 'crown') {
        a.g.rotation.y += still ? 0 : 0.01
        a.g.scale.set(1.1 * capPivot.scale.x, 1.1 * capPivot.scale.y, 1.1 * capPivot.scale.z)
      } else if (!still) a.g.rotation.y += 0.012
      a.halo.material.opacity = 0.3 + Math.sin(now * 0.003 + a.spin) * 0.12
    }
    // chest
    if (chest) {
      const k = (now - chest.t0) / (chest.state === 'drop' ? 800 : 900)
      if (chest.state === 'drop') {
        const fall = clamp01(k / 0.55)
        chest.g.position.y = k < 0.55 ? (1 - easeIn(fall)) * 4 : Math.abs(Math.sin(((k - 0.55) / 0.45) * Math.PI)) * 0.25 * (1 - clamp01(k))
        const s = k > 0.5 && k < 0.65 ? 0.78 : 1
        chest.body.scale.set(2 - s, s, 2 - s)
        if (k >= 1) chest.state = 'idle'
      } else if (chest.state === 'idle') {
        chest.body.rotation.z = Math.sin(now * 0.012) * 0.06 * (Math.sin(now * 0.002) > 0.3 ? 1 : 0)
        chest.lid.rotation.x = -Math.abs(Math.sin(now * 0.006)) * 0.12
        chest.inner.material.opacity = 0.4
        chest.inner.scale.setScalar(0.5 + Math.abs(Math.sin(now * 0.006)) * 0.5)
      } else if (chest.state === 'open') {
        chest.lid.rotation.x = -Math.min(1, k * 3) * 1.9
        chest.inner.material.opacity = 1 - k
        chest.inner.scale.setScalar(3)
        const s = k < 0.6 ? 1 + Math.sin(k * 10) * 0.05 : 1 - smooth((k - 0.6) / 0.4)
        chest.g.scale.setScalar(Math.max(0.001, s))
        chest.g.rotation.y = k > 0.6 ? (k - 0.6) * 6 : 0
        if (k >= 1) {
          scene.remove(chest.g)
          chest = null
        }
      }
    }
    // boss
    if (boss) {
      const b = boss
      const k = (now - b.t0) / 800
      const t = now * 0.001
      if (b.state === 'drop') {
        b.g.position.y = k < 0.7 ? (1 - easeIn(clamp01(k / 0.7))) * 6 : 0
        const s = k > 0.65 && k < 0.85 ? 0.72 : 1
        b.body.scale.set(2 - s, s, 2 - s)
        if (k >= 1) b.state = 'fight'
      } else if (b.state === 'fight') {
        b.body.position.y = Math.abs(Math.sin(t * 3)) * 0.06
        b.body.rotation.z = Math.sin(t * 1.5) * 0.06
        b.head.rotation.z = Math.sin(t * 2.1) * 0.12
        b.knock = (b.knock || 0) * 0.85
        b.body.position.x = b.knock * 0.6
        b.body.rotation.x = -b.knock
        if (b.swipe) {
          const s = (now - b.swipe) / 500
          if (s >= 1) b.swipe = 0
          b.paw.position.set(0.36 - Math.sin(clamp01(s) * Math.PI) * 0.7, 0.62 + Math.sin(clamp01(s) * Math.PI) * 0.3, 0.22 + Math.sin(clamp01(s) * Math.PI) * 0.5)
          b.body.rotation.y = -Math.sin(clamp01(s) * Math.PI) * 0.5
        }
      } else if (b.state === 'win') {
        const w = clamp01((now - b.t0) / 1300)
        b.g.position.set(BOSS_AT.x + w * 2.5, easeIn(w) * 7 + Math.sin(w * Math.PI) * 1, BOSS_AT.z - w * 2)
        b.g.rotation.y += 0.35
        b.g.rotation.z = w * 4
        b.g.scale.setScalar(0.85 * (1 - w * 0.85))
        b.shadow.visible = false
        if (w >= 1) {
          scene.remove(b.g)
          boss = null
        }
      } else if (b.state === 'flee') {
        const w = clamp01((now - b.t0 - 900) / 1500)
        b.g.rotation.y = w > 0 ? Math.PI / 2 : -0.75
        b.g.position.x = BOSS_AT.x + easeIn(w) * 5
        b.g.position.y = Math.abs(Math.sin(w * 18)) * 0.25
        if (w >= 1) {
          scene.remove(b.g)
          boss = null
        }
      }
      if (boss) {
        b.hurt = (b.hurt || 0) * 0.6 ** dt
        for (const m of b.furMats) {
          m.emissive.setRGB(b.hurt * 0.45, b.hurt * 0.05, b.hurt * 0.08)
        }
        for (const e of b.eyes) e.material.opacity = 0.6 + Math.sin(t * 5) * 0.3
        b.tail.rotation.z = -0.5 + Math.sin(t * 2.6) * 0.35
        if (b.aura) b.aura.material.opacity = 0.35 + Math.sin(t * 2) * 0.15
        // the cape waves
        const pos = b.cape.geometry.attributes.position
        const rest = b.cape.userData.rest
        for (let q = 0; q < pos.count; q++) {
          const x = rest[q * 3]
          const y = rest[q * 3 + 1]
          const down = 0.31 - y
          pos.array[q * 3 + 2] = rest[q * 3 + 2] + x * x * 0.7 - Math.sin(t * 4 + x * 3 + y * 2) * 0.06 * down - down * down * 0.2
        }
        pos.needsUpdate = true
      }
    }
    // effects
    for (let i = fxObjs.length - 1; i >= 0; i--) {
      const o = fxObjs[i]
      if (!st.frozen) o.life -= o.decay * dt
      if (o.life <= 0) {
        scene.remove(o.m)
        if (o.extra) scene.remove(o.extra)
        if (o.m.geometry && o.m.geometry !== chipGeo && o.m.geometry !== coinGeo) o.m.geometry.dispose()
        fxObjs.splice(i, 1)
        continue
      }
      if (!st.frozen) o.update(o, o.life)
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]
      const k = (now - tw.t0) / tw.dur
      if (k < 0) continue
      tw.fn(Math.min(1, k))
      if (k >= 1) {
        tweens.splice(i, 1)
        tw.done && tw.done()
      }
    }
    cam.shake *= 0.86
    cam.punch *= 0.88
    placeCamera(now)
    renderer.render(scene, camera)
  }

  return {
    resize,
    frame,
    pick,
    capHit,
    playerPress,
    clearCrew,
    addHelper,
    helperPress,
    setArts,
    chestShow,
    chestOpen,
    chestHide: () => chest && (scene.remove(chest.g), (chest = null), (pickables.chest = [])),
    bossShow,
    bossHurt,
    bossSwipe,
    bossGone,
    bossHead,
    arena: (x, y) => toPx(arenaWorld(x, y)),
    point: (x, y, z) => toPx(new THREE.Vector3(x, y, z)),
    shake: px => (cam.shake = Math.min(14, cam.shake + px)),
    punch: k => (cam.punch = Math.min(1.5, cam.punch + (k - 1) * 18)),
    dispose() {
      renderer.dispose()
      pmrem.dispose()
    },
  }
}
window.RG3D = { create }
