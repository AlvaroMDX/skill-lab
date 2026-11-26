// Skill manager tab: places on the left, their skills in the middle, the open skill on the right.
;(() => {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {}, getState() {}, setState() {} }
  const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
  const DESC_MAX = 1024
  const saved = vscode.getState() || {}
  let places = []
  let skills = []
  let sel = { place: saved.place || 'all', skill: saved.skill || null }
  let current = null
  let form = null
  let dirty = false
  let query = ''
  let mode = 'edit'
  let showIdle = false
  let externalChange = false

  const $ = (q, el = document) => el.querySelector(q)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const kb = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toLocaleString('es-ES', { maximumFractionDigits: 0 })} KB` : `${(n / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`)
  const placeOf = id => places.find(p => p.id === id)
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const remember = () => vscode.setState({ place: sel.place, skill: sel.skill })
  const ICON = { all: '◎', user: '👤', repo: '📁', synced: '☁️' }

  document.getElementById('app').innerHTML = `
    <header class="top">
      <div class="brand"><b>Gestor de skills</b><span>Qué skill afecta a cada repo, editarlas, moverlas y llevártelas a otro PC</span></div>
      <input class="search" type="search" placeholder="Buscar por nombre o descripción…" spellcheck="false">
      <button class="primary" data-act="new">＋ Nueva</button>
      <button data-act="import" title="Restaurar skills desde un zip descargado con este gestor">⬆ Importar</button>
      <div class="drop"><button data-act="exportMenu" title="Descargar las skills en un zip para migrarlas">⬇ Descargar ▾</button><div class="menu" hidden></div></div>
      <button class="icon" data-act="refresh" title="Volver a leer las carpetas">⟳</button>
    </header>
    <nav class="places"></nav>
    <section class="list"></section>
    <main class="editor"></main>
    <div class="toast" hidden></div>`

  // ---------- modal: VS Code webviews have no confirm() or prompt() ----------

  function modal({ title, html, buttons, init }) {
    return new Promise(resolve => {
      const back = document.createElement('div')
      back.className = 'modal-back'
      back.innerHTML = `<div class="modal" role="dialog"><h3>${esc(title)}</h3><div class="mbody">${html || ''}</div><div class="mbtns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : b.danger ? 'danger' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`
      const close = v => {
        back.remove()
        document.removeEventListener('keydown', onKey, true)
        resolve(v)
      }
      const onKey = e => {
        if (e.key === 'Escape') close(null)
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
          const primary = buttons.findIndex(b => b.primary)
          if (primary >= 0) {
            e.preventDefault()
            back.querySelector(`[data-i="${primary}"]`).click()
          }
        }
      }
      back.addEventListener('click', e => {
        if (e.target === back) close(null)
        const b = e.target.closest('[data-i]')
        if (!b) return
        const def = buttons[Number(b.dataset.i)]
        const value = def.collect ? def.collect(back) : def.value
        if (value === undefined) return
        close(value)
      })
      document.addEventListener('keydown', onKey, true)
      document.body.appendChild(back)
      init?.(back)
      back.querySelector('input, select, textarea, .primary')?.focus()
    })
  }

  function toast(text, kind = '') {
    const t = $('.toast')
    t.textContent = text
    t.className = `toast ${kind}`
    t.hidden = false
    clearTimeout(toast.t)
    toast.t = setTimeout(() => (t.hidden = true), 4200)
  }

  async function leaveIfClean() {
    if (!dirty) return true
    const v = await modal({ title: 'Cambios sin guardar', html: `<p>${esc(form?.name || current?.name)} tiene cambios sin guardar.</p>`, buttons: [{ label: 'Seguir editando', value: 'stay' }, { label: 'Descartar', value: 'drop', danger: true }, { label: 'Guardar', value: 'save', primary: true }] })
    if (v === 'save') {
      save()
      return false
    }
    if (v === 'drop') {
      dirty = false
      return true
    }
    return false
  }

  // ---------- left: places ----------

  function counts(id) {
    return skills.filter(s => s.place === id).length
  }

  function renderPlaces() {
    const repos = places.filter(p => p.kind === 'repo')
    const used = repos.filter(p => counts(p.id))
    const idle = repos.filter(p => !counts(p.id))
    const item = (p, sub) => {
      const n = p.id === 'all' ? skills.length : counts(p.id)
      return `<button class="place ${sel.place === p.id ? 'on' : ''} ${p.kind === 'synced' ? 'ro' : ''}" data-place="${esc(p.id)}" title="${esc(p.root || '')}"><i>${ICON[p.kind]}</i><span><b>${esc(p.label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><em>${n}</em>${p.extra ? `<u class="forget" data-forget="${esc(p.id)}" title="Quitar de la lista (no borra nada)">✕</u>` : ''}</button>`
    }
    const user = places.find(p => p.kind === 'user')
    const synced = places.find(p => p.kind === 'synced')
    $('.places').innerHTML = `
      ${item({ id: 'all', kind: 'all', label: 'Todas' }, 'Todas las ubicaciones')}
      ${user ? item(user, 'Nivel usuario · afecta a todos los repos') : ''}
      <h4>Repos con skills</h4>
      ${used.map(p => item(p, 'Solo este repo')).join('') || '<p class="none">Ningún repo tiene skills propias todavía. Arrastra una aquí abajo o usa «Mover a».</p>'}
      <button class="fold" data-act="idle">${showIdle ? '▾' : '▸'} Otros repos (${idle.length})</button>
      ${showIdle ? idle.map(p => item(p, 'Sin skills propias')).join('') : ''}
      <button class="add" data-act="addRepo">＋ Añadir repo…</button>
      ${synced ? `<h4>Solo lectura</h4>${item(synced, 'Las sincroniza tu cuenta')}` : ''}
      <p class="tip">Arrastra una skill sobre una ubicación para moverla; con <kbd>Ctrl</kbd>, para copiarla.</p>`
  }

  // ---------- middle: skills of the selected place ----------

  const matches = s => !query || `${s.name} ${s.description} ${placeOf(s.place)?.label}`.toLowerCase().includes(query)

  function card(s, inherited) {
    const p = placeOf(s.place)
    return `<button class="card ${sel.skill === s.id ? 'on' : ''} ${inherited ? 'inh' : ''} ${s.readonly ? 'ro' : ''}" data-skill="${esc(s.id)}" draggable="${s.readonly ? 'false' : 'true'}">
      <b>${esc(s.name)}</b>${sel.place === 'all' || inherited ? `<span class="chip ${p?.kind}">${ICON[p?.kind] || ''} ${esc(p?.label)}</span>` : ''}
      <small>${esc(s.description)}</small>
      <em>${plural(s.files, 'fichero', 'ficheros')} · ${kb(s.bytes)}${s.readonly ? ' · solo lectura' : ''}</em></button>`
  }

  function renderList() {
    const p = placeOf(sel.place)
    let head = ''
    let html = ''
    if (sel.place === 'all') {
      head = `<h2>Todas las skills</h2><p>${plural(skills.length, 'skill', 'skills')} en ${plural(new Set(skills.map(s => s.place)).size, 'ubicación', 'ubicaciones')}.</p>`
      for (const pl of places) {
        const list = skills.filter(s => s.place === pl.id && matches(s))
        if (list.length) html += `<h5>${ICON[pl.kind]} ${esc(pl.label)} <span>${list.length}</span></h5>${list.map(s => card(s)).join('')}`
      }
    } else if (p?.kind === 'repo') {
      const own = skills.filter(s => s.place === p.id && matches(s))
      const inh = skills.filter(s => s.place === 'user' && matches(s))
      head = `<h2>📁 ${esc(p.label)}</h2><p class="path">${esc(p.root)}</p><p>Le afectan <b>${own.length + inh.length}</b>: ${plural(own.length, 'propia', 'propias')} y ${inh.length} de usuario.</p>`
      html = `<h5>Propias de este repo <span>${own.length}</span></h5>${own.map(s => card(s)).join('') || '<p class="none">Sin skills propias. Crea una con «＋ Nueva» o arrastra una de usuario a este repo en la columna de la izquierda.</p>'}
        <h5>De usuario: también le afectan <span>${inh.length}</span></h5>${inh.map(s => card(s, true)).join('')}`
    } else if (p) {
      const list = skills.filter(s => s.place === p.id && matches(s))
      head = `<h2>${ICON[p.kind]} ${esc(p.label)}</h2><p>${p.kind === 'user' ? 'Se cargan en todos los repos y carpetas.' : 'Las trae tu cuenta de Anthropic: se pueden leer y copiar, no editar.'}</p>`
      html = list.map(s => card(s)).join('') || '<p class="none">No hay skills aquí.</p>'
    }
    if (query && !html.includes('class="card')) html = `<p class="none">Nada coincide con «${esc(query)}».</p>`
    $('.list').innerHTML = `<div class="lhead">${head}</div><div class="cards">${html}</div>`
  }

  // ---------- right: the open skill ----------

  function placeOptions(selected) {
    const opts = places.filter(p => p.kind !== 'synced').map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${p.kind === 'user' ? '👤 Usuario (todos los repos)' : `📁 ${esc(p.label)}`}</option>`)
    return opts.join('') + '<option value="@pick">📂 Otra carpeta…</option>'
  }

  function renderEditor() {
    const ed = $('.editor')
    if (!current) {
      ed.innerHTML = `<div class="empty"><div class="big">📚</div><h2>Elige una skill</h2><p>Aquí podrás cambiarle el nombre, la descripción, el contenido y la ubicación, y ver sus ficheros.</p><p>Las de <b>Usuario</b> afectan a todos los repos; las de un repo, solo a ese.</p></div>`
      return
    }
    const p = placeOf(current.place)
    const ro = current.readonly
    const affects = p?.kind === 'user' ? 'Todos los repos y carpetas' : p?.kind === 'repo' ? `Solo ${p.label}` : 'Todos (la trae tu cuenta)'
    const twins = (current.twins || []).map(id => placeOf(id)?.label).filter(Boolean)
    ed.innerHTML = `
      <div class="ehead">
        <div><h2>${esc(form.name || current.name)}<span class="dot" ${dirty ? '' : 'hidden'} title="Sin guardar">●</span></h2>
          <p class="where"><span class="chip ${p?.kind}">${ICON[p?.kind] || ''} ${esc(p?.label)}</span> Afecta a: <b>${esc(affects)}</b> · <a href="#" data-act="reveal" title="Abrir la carpeta">${esc(current.path)}</a></p></div>
        <div class="ebtns">${ro ? '' : `<button data-act="discard" ${dirty ? '' : 'disabled'}>Descartar</button><button class="primary" data-act="save" ${dirty ? '' : 'disabled'}>Guardar <kbd>Ctrl+S</kbd></button>`}</div>
      </div>
      ${externalChange ? '<p class="warn">⚠ Esta skill ha cambiado fuera del gestor. Si guardas, te preguntaré antes de pisar ese cambio.</p>' : ''}
      ${twins.length ? `<p class="warn">⚠ Hay otra skill con el mismo nombre en ${esc(twins.join(', '))}: Claude verá las dos.</p>` : ''}
      ${ro ? '<p class="info">☁️ Esta skill la sincroniza tu cuenta y se reescribe sola. Cópiala a Usuario o a un repo para tener una versión tuya editable.</p>' : ''}
      <div class="grid">
        <label>Nombre<input class="f-name" value="${esc(form.name)}" ${ro ? 'readonly' : ''} spellcheck="false" maxlength="64"><small class="hint f-name-hint">Minúsculas, números y guiones. La carpeta se renombra igual.</small></label>
        <label>Ubicación<div class="row"><select class="f-place">${placeOptions(current.place)}</select><button data-act="move" ${ro ? 'disabled' : ''} title="Mover la carpeta entera">Mover</button><button data-act="copy" title="Dejar una copia allí">Copiar</button></div><small class="hint">Usuario = todos los repos. Un repo = solo ese.</small></label>
      </div>
      <label class="desc">Descripción <small class="count"></small><textarea class="f-desc" rows="${Math.min(9, Math.max(3, Math.ceil(form.description.length / 120) + form.description.split('\n').length - 1))}" ${ro ? 'readonly' : ''}>${esc(form.description)}</textarea><small class="hint">Es lo que lee Claude para decidir cuándo cargarla: qué hace y con qué frases se pide.</small></label>
      <div class="content">
        <div class="tabs"><button data-mode="edit" class="${mode === 'edit' ? 'on' : ''}">Contenido</button><button data-mode="preview" class="${mode === 'preview' ? 'on' : ''}">Vista previa</button><span></span><button data-act="openMd" title="Abrir SKILL.md en una pestaña de VS Code">Abrir en el editor ↗</button></div>
        ${mode === 'edit' ? `<textarea class="f-body" spellcheck="false" ${ro ? 'readonly' : ''}>${esc(form.body)}</textarea>` : `<article class="md">${markdown(form.body)}</article>`}
      </div>
      <details class="extra" ${form.extra.trim() ? 'open' : ''}><summary>Otros campos de la cabecera (YAML) ${form.extra.trim() ? `<span>${form.extra.split('\n').filter(l => /^[A-Za-z0-9_-]+\s*:/.test(l)).map(l => l.split(':')[0]).join(', ')}</span>` : '<span>ninguno</span>'}</summary>
        <textarea class="f-extra" rows="${Math.min(10, Math.max(3, form.extra.split('\n').length + 1))}" spellcheck="false" ${ro ? 'readonly' : ''} placeholder="allowed-tools: Bash(git:*)&#10;disable-model-invocation: true">${esc(form.extra)}</textarea>
        <small class="hint">Campos como allowed-tools, model o disable-model-invocation. Lo que no toques se guarda tal cual.</small></details>
      <section class="files"><h4>Ficheros <span>${current.files.length}</span>${ro ? '' : '<button data-act="addFile">＋ Fichero</button>'}</h4>
        ${current.files.map(f => `<div class="file"><button class="fname" data-open="${esc(f.rel)}" title="Abrir en VS Code">${f.rel === 'SKILL.md' ? '📘' : /\.(md|txt)$/i.test(f.rel) ? '📄' : /\.(js|ts|py|ps1|sh|cjs|mjs)$/i.test(f.rel) ? '⚙️' : /\.(png|jpe?g|svg|gif)$/i.test(f.rel) ? '🖼️' : '📎'} ${esc(f.rel)}</button><small>${kb(f.size)}</small>${ro || f.rel === 'SKILL.md' ? '' : `<button class="icon ghost" data-delfile="${esc(f.rel)}" title="Mandar a la papelera">🗑</button>`}</div>`).join('')}
      </section>
      <section class="danger-zone"><button data-act="exportOne">⬇ Descargar esta skill</button>${ro ? '' : '<button class="danger" data-act="delete">🗑 Mandar a la papelera</button>'}</section>`
    countDesc()
    validateName()
  }

  function countDesc() {
    const c = $('.editor .count')
    if (!c || !form) return
    const n = form.description.length
    c.textContent = `${n.toLocaleString('es-ES')} / ${DESC_MAX.toLocaleString('es-ES')}`
    c.classList.toggle('over', n > DESC_MAX)
  }

  function validateName() {
    const hint = $('.editor .f-name-hint')
    if (!hint || !form) return
    const ok = NAME_RE.test(form.name)
    hint.textContent = ok ? (form.name !== current.folderName ? `Al guardar, la carpeta pasa a llamarse ${form.name}.` : 'Minúsculas, números y guiones. La carpeta se renombra igual.') : 'Solo minúsculas, números y guiones, empezando por letra o número.'
    hint.classList.toggle('bad', !ok)
  }

  function setDirty(v) {
    dirty = v
    const dot = $('.editor .dot')
    if (dot) dot.hidden = !v
    $('.editor [data-act="save"]')?.toggleAttribute('disabled', !v)
    $('.editor [data-act="discard"]')?.toggleAttribute('disabled', !v)
  }

  // a small Markdown renderer for the preview: headings, lists, code, tables, bold and links
  function markdown(src) {
    const inline = t =>
      esc(t)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<u title="$2">$1</u>')
    const lines = src.split('\n')
    let out = ''
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/^```/.test(l)) {
        let code = ''
        while (++i < lines.length && !/^```/.test(lines[i])) code += lines[i] + '\n'
        out += `<pre>${esc(code)}</pre>`
      } else if (/^#{1,6}\s/.test(l)) {
        const n = /^#+/.exec(l)[0].length
        out += `<h${n}>${inline(l.slice(n + 1))}</h${n}>`
      } else if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        const row = (r, tag) => `<tr>${r.trim().replace(/^\||\|$/g, '').split('|').map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('')}</tr>`
        let t = row(l, 'th')
        i++
        while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) t += row(lines[++i], 'td')
        out += `<table>${t}</table>`
      } else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
        const ordered = /^\s*\d+\./.test(l)
        let items = ''
        i--
        while (i + 1 < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i + 1])) items += `<li>${inline(lines[++i].replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>`
        out += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
      } else if (/^>\s?/.test(l)) out += `<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`
      else if (/^---+$/.test(l.trim())) out += '<hr>'
      else if (l.trim()) out += `<p>${inline(l)}</p>`
    }
    return out
  }

  // ---------- actions ----------

  async function openSkill(id) {
    if (sel.skill === id && current) return
    if (!(await leaveIfClean())) return
    sel.skill = id
    remember()
    renderList()
    vscode.postMessage({ type: 'open', id })
  }

  function save() {
    if (!current || current.readonly || !dirty) return
    if (!NAME_RE.test(form.name)) return toast('El nombre solo admite minúsculas, números y guiones.', 'bad')
    if (!form.description.trim()) return toast('La descripción no puede quedar vacía.', 'bad')
    vscode.postMessage({ type: 'save', id: current.id, name: form.name, description: form.description, extra: form.extra, body: form.body, lead: current.lead, mtime: current.mtime })
  }

  async function newSkill() {
    const target = placeOf(sel.place)?.kind === 'repo' || sel.place === 'user' ? sel.place : 'user'
    const v = await modal({
      title: 'Nueva skill',
      html: `<label>Nombre<input class="m-name" placeholder="p. ej. revisar-migraciones" spellcheck="false" maxlength="64"></label><small class="hint m-hint">Minúsculas, números y guiones.</small>
        <label>Dónde<select class="m-place">${places.filter(p => p.kind !== 'synced').map(p => `<option value="${esc(p.id)}" ${p.id === target ? 'selected' : ''}>${p.kind === 'user' ? '👤 Usuario (todos los repos)' : `📁 ${esc(p.label)}`}</option>`).join('')}</select></label>`,
      buttons: [
        { label: 'Cancelar', value: null },
        {
          label: 'Crear',
          primary: true,
          collect: back => {
            const name = back.querySelector('.m-name').value.trim()
            if (!NAME_RE.test(name)) {
              back.querySelector('.m-hint').classList.add('bad')
              back.querySelector('.m-name').focus()
              return undefined
            }
            return { name, place: back.querySelector('.m-place').value }
          },
        },
      ],
    })
    if (v) vscode.postMessage({ type: 'create', ...v })
  }

  async function exportMenu() {
    const menu = $('.top .menu')
    if (!menu.hidden) return (menu.hidden = true)
    const p = placeOf(sel.place)
    const items = [
      ['all', `Todas: usuario y repos (${skills.filter(s => s.place !== 'synced').length})`],
      ['user', `Solo las de usuario (${counts('user')})`],
      ...(p?.kind === 'repo' && counts(p.id) ? [[`place:${p.id}`, `Solo las de ${p.label} (${counts(p.id)})`]] : []),
      ...(current ? [['skill', `Solo ${current.name}`]] : []),
    ]
    menu.innerHTML = items.map(([scope, label]) => `<button data-scope="${esc(scope)}">${esc(label)}</button>`).join('') + '<p>Las sincronizadas con tu cuenta no van: ya te llegan solas al iniciar sesión.</p>'
    menu.hidden = false
  }

  function move(copy) {
    if (dirty) return toast('Guarda o descarta los cambios antes de moverla o copiarla.', 'bad')
    const to = $('.editor .f-place').value
    if (to === current.place && !copy) return toast('Ya está en esa ubicación.')
    if (to === current.place && copy) return toast('Elige otra ubicación para la copia.')
    vscode.postMessage({ type: 'move', id: current.id, to, copy })
  }

  // ---------- events ----------

  document.addEventListener('click', async e => {
    const t = e.target.closest('button, a, [data-forget]')
    if (!t) {
      $('.top .menu').hidden = true
      return
    }
    if (t.dataset.forget) {
      e.stopPropagation()
      return vscode.postMessage({ type: 'forgetRepo', place: t.dataset.forget })
    }
    if (t.dataset.scope) {
      $('.top .menu').hidden = true
      return vscode.postMessage({ type: 'export', scope: t.dataset.scope, id: current?.id })
    }
    if (!t.closest('.drop')) $('.top .menu').hidden = true
    if (t.dataset.place) {
      if (!(await leaveIfClean())) return
      sel.place = t.dataset.place
      remember()
      renderPlaces()
      renderList()
      return
    }
    if (t.dataset.skill) return openSkill(t.dataset.skill)
    if (t.dataset.mode) {
      mode = t.dataset.mode
      return renderEditor()
    }
    if (t.dataset.open) return vscode.postMessage({ type: 'openFile', id: current.id, rel: t.dataset.open })
    if (t.dataset.delfile) return vscode.postMessage({ type: 'deleteFile', id: current.id, rel: t.dataset.delfile })
    const act = t.dataset.act
    if (!act) return
    e.preventDefault()
    if (act === 'new') return newSkill()
    if (act === 'import') return vscode.postMessage({ type: 'import' })
    if (act === 'exportMenu') return exportMenu()
    if (act === 'refresh') return vscode.postMessage({ type: 'refresh' })
    if (act === 'addRepo') return vscode.postMessage({ type: 'addRepo' })
    if (act === 'idle') {
      showIdle = !showIdle
      return renderPlaces()
    }
    if (act === 'save') return save()
    if (act === 'discard') {
      form = { name: current.name, description: current.description, extra: current.extra, body: current.body }
      setDirty(false)
      return renderEditor()
    }
    if (act === 'reveal') return vscode.postMessage({ type: 'reveal', id: current.id })
    if (act === 'openMd') return vscode.postMessage({ type: 'openFile', id: current.id, rel: 'SKILL.md' })
    if (act === 'move' || act === 'copy') return move(act === 'copy')
    if (act === 'delete') return vscode.postMessage({ type: 'delete', id: current.id })
    if (act === 'exportOne') return vscode.postMessage({ type: 'export', scope: 'skill', id: current.id })
    if (act === 'addFile') {
      const rel = await modal({
        title: 'Nuevo fichero en la skill',
        html: '<label>Ruta dentro de la skill<input class="m-rel" placeholder="references/guia.md" spellcheck="false"></label><small class="hint">Se crea vacío y se abre en VS Code.</small>',
        buttons: [{ label: 'Cancelar', value: null }, { label: 'Crear', primary: true, collect: back => back.querySelector('.m-rel').value.trim() || undefined }],
      })
      if (rel) vscode.postMessage({ type: 'addFile', id: current.id, rel })
    }
  })

  document.addEventListener('input', e => {
    const el = e.target
    if (el.classList.contains('search')) {
      query = el.value.trim().toLowerCase()
      return renderList()
    }
    if (!form) return
    if (el.classList.contains('f-name')) {
      form.name = el.value.trim()
      $('.editor h2').firstChild.textContent = form.name || current.name
      validateName()
    } else if (el.classList.contains('f-desc')) {
      form.description = el.value
      countDesc()
    } else if (el.classList.contains('f-body')) form.body = el.value
    else if (el.classList.contains('f-extra')) form.extra = el.value
    else return
    setDirty(form.name !== current.name || form.description !== current.description || form.body !== current.body || form.extra !== current.extra)
  })

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
    // tab inside the content inserts spaces instead of leaving the box
    if (e.key === 'Tab' && e.target.classList?.contains('f-body')) {
      e.preventDefault()
      const ta = e.target
      const { selectionStart: a, selectionEnd: b } = ta
      ta.setRangeText('  ', a, b, 'end')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

  // drag a card onto a place: move it there, or copy it holding Ctrl
  document.addEventListener('dragstart', e => {
    const c = e.target.closest?.('.card')
    if (!c) return
    e.dataTransfer.setData('text/skill', c.dataset.skill)
    e.dataTransfer.effectAllowed = 'copyMove'
    document.body.classList.add('dragging')
  })
  document.addEventListener('dragend', () => {
    document.body.classList.remove('dragging')
    document.querySelectorAll('.place.drop-on').forEach(p => p.classList.remove('drop-on'))
  })
  document.addEventListener('dragover', e => {
    const p = e.target.closest?.('.place')
    document.querySelectorAll('.place.drop-on').forEach(x => x !== p && x.classList.remove('drop-on'))
    if (!p || p.dataset.place === 'all' || p.classList.contains('ro')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move'
    p.classList.add('drop-on')
  })
  document.addEventListener('drop', e => {
    const p = e.target.closest?.('.place')
    const id = e.dataTransfer.getData('text/skill')
    if (!p || !id) return
    e.preventDefault()
    p.classList.remove('drop-on')
    const s = skills.find(x => x.id === id)
    if (!s || s.place === p.dataset.place) return
    if (dirty && current?.id === id) return toast('Guarda o descarta los cambios antes de moverla o copiarla.', 'bad')
    vscode.postMessage({ type: 'move', id, to: p.dataset.place, copy: e.ctrlKey || e.altKey || s.readonly })
  })

  // ---------- messages from the extension ----------

  window.addEventListener('message', ({ data: msg }) => {
    if (msg.type === 'list') {
      places = msg.places
      skills = msg.skills
      if (sel.place !== 'all' && !placeOf(sel.place)) sel.place = 'all'
      renderPlaces()
      if (current) {
        const now = skills.find(s => s.id === current.id)
        if (!now && !dirty) {
          current = null
          sel.skill = null
          renderEditor()
        } else if (now && Math.abs(now.mtime - current.mtime) > 1) {
          if (dirty) {
            externalChange = true
            renderEditor()
            setDirty(true)
          } else vscode.postMessage({ type: 'open', id: current.id })
        }
      } else if (sel.skill && skills.some(s => s.id === sel.skill)) vscode.postMessage({ type: 'open', id: sel.skill })
      renderList()
    } else if (msg.type === 'skill') {
      current = msg.skill
      form = { name: current.name, description: current.description, extra: current.extra, body: current.body }
      sel.skill = current.id
      externalChange = false
      remember()
      setDirty(false)
      renderEditor()
      renderList()
    } else if (msg.type === 'select') {
      if (msg.place) sel.place = msg.place
      if (msg.skill) sel.skill = msg.skill
      remember()
      renderPlaces()
      renderList()
    } else if (msg.type === 'saved') {
      toast('Guardada ✓', 'ok')
    } else if (msg.type === 'removed') {
      if (current?.id === msg.id) {
        current = null
        form = null
        sel.skill = null
        setDirty(false)
        renderEditor()
      }
      toast('Enviada a la papelera')
    } else if (msg.type === 'error') toast(msg.message, 'bad')
  })

  renderPlaces()
  renderList()
  renderEditor()
  vscode.postMessage({ type: 'ready' })
})()
