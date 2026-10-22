// build: npx esbuild tools/labdemo.ts --bundle --platform=node --outfile=tools/labdemo.js; run: node tools/labdemo.js <outDir>
// renders Skill Lab with fictional puestos/skills and writes preview pages for README screenshots
import * as fs from 'fs'
import { applyConfig, LABS } from '../src/labs'
import { renderScene, colorOf } from '../src/scene'

const out = process.argv[2]!
applyConfig({
  returnDelaySeconds: 20,
  labs: {
    tienda: { name: 'Tienda online', theme: 'lab', row: 'top', width: 8 },
    app: { name: 'App móvil', theme: 'arcade', row: 'top', width: 8 },
    datos: { name: 'Datos', theme: 'library', row: 'top', width: 8 },
    personal: { name: 'Personal', theme: 'cafe', row: 'bottom', width: 8 },
    api: { name: 'API', theme: 'gym', row: 'bottom', width: 8 },
    general: { name: 'General', theme: 'lab', row: 'bottom', width: 8 },
  },
  order: ['tienda', 'app', 'datos', 'personal', 'api', 'general'],
})
const roster = ['code-review', 'commit-style', 'frontend-design', 'pdf', 'docx', 'xlsx', 'swagger', 'api-tests', 'deploy', 'migrations',
  'humanizer', 'prompt-master', 'release-notes', 'security-review', 'charts', 'i18n', 'onboarding', 'standup']
const now = Date.now()
const at = (lab: string | null, uses: number) => ({ lab, from: null, since: now - 60_000, uses })
const crew: Record<string, any> = {
  'code-review': at('tienda', 14), 'frontend-design': at('tienda', 9), 'commit-style': at('api', 31), swagger: at('api', 7),
  'api-tests': at('api', 5), charts: at('datos', 4), xlsx: at('datos', 6), 'release-notes': at('app', 3), i18n: at('app', 2),
  humanizer: at('personal', 8), standup: at('personal', 12), pdf: at(null, 3), docx: at(null, 2), deploy: at(null, 6),
  migrations: at(null, 4), 'prompt-master': at(null, 1), 'security-review': at(null, 2), onboarding: at(null, 1),
}
const agents = [
  { id: 's1', label: 'tienda-web', lab: 'tienda', activity: 'escribiendo', subagents: [{ id: 'a1', label: 'Explore' }] },
  { id: 's2', label: 'api', lab: 'api', activity: 'ejecutando', subagents: [] },
  { id: 's3', label: 'informes', lab: 'datos', activity: 'pensando', subagents: [] },
]
const cats = [{ name: 'Michi', coat: 'naranja' }, { name: 'Luna', coat: 'siames' }]
const media = 'file:///' + require('path').resolve(__dirname, '../media').split('\\').join('/') + '/'
const head = fs.readFileSync(__dirname + '/body.html', 'utf8').replace('{{MEDIA}}', media)
const oldModel = JSON.parse(fs.readFileSync(__dirname + '/settings.json', 'utf8'))
const model = {
  ...oldModel,
  labs: LABS.map(l => ({ id: l.id, name: l.name, accent: l.accent, match: '', width: l.width, row: l.row, theme: l.theme, custom: l.custom, removable: l.id !== 'general' })),
  projectsRoot: 'C:/Proyectos',
  medals: {},
  needsSetup: false,
  skills: roster.map(name => ({ name, color: colorOf(name), fixed: null, hidden: false, uses: crew[name].uses, lab: crew[name].lab })),
  settings: { ...oldModel.settings, cats },
}
for (const night of [false, true]) {
  const r = renderScene({ roster, crew, agents: agents as any, now, pet: true, cats: cats as any, night })
  const msg = { type: 'scene', svg: r.svg, geo: r.geo, clockMode: night ? 'night' : 'day', stats: { asleep: r.asleep, working: r.working, strolling: r.strolling, sessions: r.sessions } }
  const extra = night ? '' : `setTimeout(()=>{if(location.hash==='#layout')document.querySelector('[data-act=layout][data-tab=labs]').click()},800);`
  fs.writeFileSync(`${out}/${night ? 'night' : 'day'}.html`, `${head}
<script>window.__model=${JSON.stringify(model)};window.__msgs=[];const reply=()=>setTimeout(()=>window.postMessage({type:"model",model:JSON.parse(JSON.stringify(window.__model))},"*"),0);window.acquireVsCodeApi=()=>({getState:()=>null,setState:()=>{},postMessage:m=>{window.__msgs.push(m);if(m.type==="model")reply()}})</script><script src="${media}main.js"></script><script>window.postMessage(${JSON.stringify(msg)},"*");${extra}</script></body></html>`)
}
console.log('ok', LABS.length)
