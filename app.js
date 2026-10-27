'use strict';
// ============================================================
//  CĒNECA · PENDIENTES
//  Cada tarea está "en manos" de alguien: un miembro del equipo,
//  el cliente, la autoridad, o ya está terminada. Pasarla = cambiar
//  de manos + un motivo corto (Vo.Bo., Correcciones, Firma…).
// ============================================================

// ---------- UTILIDADES ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const ahora = () => new Date().toISOString();
const TZ = 'America/Monterrey';
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const sumarDias = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const fechaCorta = ymd => !ymd ? '' : new Date(ymd + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const fechaISO = iso => !iso ? '' : new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const fechaHora = iso => !iso ? '' : new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const diaISO = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
function hace(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
function fechaRel(ymd) {
  const h = hoy();
  if (ymd === h) return 'Hoy';
  if (ymd === sumarDias(h, 1)) return 'Mañana';
  if (ymd === sumarDias(h, -1)) return 'Ayer';
  return fechaCorta(ymd);
}
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
const DEMO = location.protocol === 'file:' || new URLSearchParams(location.search).has('demo');

// ---------- EQUIPO ----------
const MIEMBROS = CONFIG.MIEMBROS;
const ESPERA = [{ id: 'cliente', nombre: 'Cliente' }, { id: 'autoridad', nombre: 'Autoridad' }];
const PRIORIDADES = [
  { id: 'urgente', nombre: 'Urgente', rank: 0 }, { id: 'alta', nombre: 'Alta', rank: 1 },
  { id: 'media', nombre: 'Media', rank: 2 }, { id: 'baja', nombre: 'Baja', rank: 3 }
];
let YO = null;
const esMiembro = id => MIEMBROS.some(m => m.id === id);
const esEspera = id => ESPERA.some(e => e.id === id);
function nombreDe(id) {
  if (id === 'terminada') return 'Terminada';
  return (MIEMBROS.find(m => m.id === id) || ESPERA.find(e => e.id === id) || { nombre: id || '—' }).nombre;
}
const otros = () => MIEMBROS.filter(m => m.id !== YO);
const iniciales = n => (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
const dotClase = id => esMiembro(id) ? (['santiago', 'elizabeth'].includes(id) ? 'd-' + id : 'd-otro') : (id === 'terminada' ? 'd-otro' : 'd-espera');

// ---------- AUTH (Google OAuth por popup, igual que el Workspace) ----------
const Auth = (() => {
  let _user = null, _token = null, _renovando = false;
  const vigente = () => parseInt(localStorage.getItem('ws_token_exp') || '0') > Date.now() + 30000;
  function url(prompt) {
    const hint = _user?.email ? `&login_hint=${encodeURIComponent(_user.email)}` : '';
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(CONFIG.CLIENT_ID)}&redirect_uri=${encodeURIComponent(location.origin + location.pathname)}&response_type=token&scope=${encodeURIComponent(CONFIG.SCOPES)}&prompt=${prompt}${hint}`;
  }
  function guardarToken(hash) {
    const p = new URLSearchParams(hash.substring(1));
    _token = p.get('access_token');
    localStorage.setItem('ws_token', _token);
    localStorage.setItem('ws_token_exp', String(Date.now() + parseInt(p.get('expires_in') || '3600') * 1000));
  }
  function signIn() {
    const su = localStorage.getItem('ws_user'), st = localStorage.getItem('ws_token');
    if (su && st && vigente()) { _user = JSON.parse(su); _token = st; App.onSignedIn(_user); return; }
    if (su && st) {
      _user = JSON.parse(su);
      renovarSilencioso().then(ok => ok ? App.onSignedIn(_user) : login('select_account'));
      return;
    }
    login('select_account');
  }
  function login(prompt) {
    const popup = window.open(url(prompt), 'googlelogin', 'width=500,height=600,left=400,top=100');
    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) { clearInterval(timer); return; }
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(timer); guardarToken(hash); popup.close();
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + _token } })
            .then(r => r.json()).then(info => {
              _user = { name: info.name, email: info.email, picture: info.picture, id: info.sub };
              localStorage.setItem('ws_user', JSON.stringify(_user));
              App._resetAviso(); App.onSignedIn(_user);
            });
        }
      } catch (e) { /* cross-origin mientras está en Google */ }
    }, 500);
  }
  function renovarSilencioso() {
    if (_renovando) return Promise.resolve(false);
    _renovando = true;
    return new Promise(resolve => {
      const ifr = document.createElement('iframe');
      ifr.style.display = 'none'; ifr.src = url('none');
      let listo = false;
      const fin = ok => { if (listo) return; listo = true; _renovando = false; clearTimeout(to); try { ifr.remove(); } catch (e) { } resolve(ok); };
      const to = setTimeout(() => fin(false), 8000);
      ifr.onload = () => {
        try { const h = ifr.contentWindow.location.hash; if (h && h.includes('access_token')) { guardarToken(h); fin(true); } else fin(false); }
        catch (e) { fin(false); }
      };
      document.body.appendChild(ifr);
    });
  }
  async function manejarTokenExpirado() { const ok = await renovarSilencioso(); if (!ok) App.avisarReconectar(); return ok; }
  function signOut() {
    ['ws_user', 'ws_token', 'ws_token_exp', 'pend_demo_user'].forEach(k => localStorage.removeItem(k));
    location.reload();
  }
  return {
    signIn, signOut, manejarTokenExpirado, reconectar: () => login('select_account'),
    getUser: () => _user || JSON.parse(localStorage.getItem('ws_user') || 'null'),
    getToken: () => _token || localStorage.getItem('ws_token')
  };
})();

// ---------- DRIVE ----------
const Drive = (() => {
  const B = 'https://www.googleapis.com/drive/v3', U = 'https://www.googleapis.com/upload/drive/v3';
  const S = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
  async function req(u, opt = {}, retry = true) {
    const res = await fetch(u, { cache: 'no-store', ...opt, headers: { Authorization: 'Bearer ' + Auth.getToken(), ...(opt.headers || {}) } });
    if (res.status === 401 && retry && await Auth.manejarTokenExpirado()) return req(u, opt, false);
    if (!res.ok) throw new Error('Drive ' + res.status);
    return res;
  }
  async function buscar(q) {
    const r = await (await req(`${B}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&${S}`)).json();
    return r.files[0]?.id || null;
  }
  async function carpeta(nombre, padre) {
    const id = await buscar(`name='${nombre}' and mimeType='application/vnd.google-apps.folder' and '${padre}' in parents and trashed=false`);
    if (id) return id;
    const c = await (await req(`${B}/files?${S}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }) })).json();
    return c.id;
  }
  const archivo = (nombre, padre) => buscar(`name='${nombre}' and '${padre}' in parents and trashed=false`);
  async function leer(id) { const t = await (await req(`${B}/files/${id}?alt=media&${S}`)).text(); return t ? JSON.parse(t) : null; }
  async function escribir(id, data) {
    await req(`${U}/files/${id}?uploadType=media&${S}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  }
  async function crear(nombre, padre, data) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: nombre, parents: [padre] })], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    return (await (await req(`${U}/files?uploadType=multipart&fields=id&${S}`, { method: 'POST', body: form })).json()).id;
  }
  return { carpeta, archivo, leer, escribir, crear };
})();

// Dónde viven los datos: Drive (normal) o este navegador (modo demo, para probar)
const Remoto = DEMO ? {
  async init() { },
  async cargar() { return ls.get('pend_demo_db', null); },
  async guardar(d) { ls.set('pend_demo_db', d); }
} : {
  folder: null, fileId: null,
  async init() {
    this.folder = await Drive.carpeta(CONFIG.DATA_FOLDER, CONFIG.SHARED_FOLDER_ID);
    this.fileId = await Drive.archivo(CONFIG.DATA_FILE, this.folder);
  },
  async cargar() {
    if (!this.fileId) this.fileId = await Drive.archivo(CONFIG.DATA_FILE, this.folder);
    return this.fileId ? Drive.leer(this.fileId) : null;
  },
  async guardar(d) {
    if (!this.fileId) this.fileId = await Drive.crear(CONFIG.DATA_FILE, this.folder, d);
    else await Drive.escribir(this.fileId, d);
  }
};

// ---------- DATOS + SINCRONIZACIÓN ----------
// Todo se guarda con fecha de modificación (upd) y nada se borra de verdad
// (del:true), para que los cambios de los dos se combinen sin pisarse.
const vacio = () => ({ v: 2, tareas: {}, clientes: {}, areas: {} });
let DB = vacio();

function unirLista(a = [], b = []) {
  const m = new Map();
  [...a, ...b].forEach(x => { const p = m.get(x.id); if (!p || (x.upd || x.en || '') > (p.upd || p.en || '')) m.set(x.id, x); });
  return [...m.values()].sort((x, y) => (x.en || '').localeCompare(y.en || ''));
}
function unirTarea(x, y) {
  const n = (y.upd || '') > (x.upd || '') ? y : x;
  return { ...n, comentarios: unirLista(x.comentarios, y.comentarios), historial: unirLista(x.historial, y.historial), horas: unirLista(x.horas, y.horas) };
}
function unir(a, b) {
  const out = vacio();
  for (const col of ['tareas', 'clientes', 'areas']) {
    const A = a[col] || {}, Bc = b[col] || {};
    for (const id of new Set([...Object.keys(A), ...Object.keys(Bc)])) {
      const x = A[id], y = Bc[id];
      out[col][id] = !x ? y : !y ? x : col === 'tareas' ? unirTarea(x, y) : ((y.upd || '') > (x.upd || '') ? y : x);
    }
  }
  return out;
}

// ¿El resultado combinado tiene algo que el archivo remoto todavía no?
function tieneNovedades(local, remoto) {
  for (const col of ['tareas', 'clientes', 'areas']) {
    for (const [id, x] of Object.entries(local[col] || {})) {
      const y = (remoto[col] || {})[id];
      if (!y || y.upd !== x.upd) return true;
      if (col === 'tareas' && ((x.comentarios || []).length !== (y.comentarios || []).length || (x.historial || []).length !== (y.historial || []).length)) return true;
    }
  }
  return false;
}

const Sync = {
  sucio: false, ocupado: false, otraVez: false, timer: null, ok: false,
  marcar() { this.sucio = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.correr(), 700); UI.estado('Guardando…'); },
  async correr() {
    if (this.ocupado) { this.otraVez = true; return; }
    this.ocupado = true;
    try {
      const remoto = await Remoto.cargar() || vacio();
      const antes = JSON.stringify(DB);
      DB = unir(DB, remoto);
      if (this.sucio || tieneNovedades(DB, remoto)) {
        this.sucio = false;
        await Remoto.guardar(DB);
      }
      if (JSON.stringify(DB) !== antes) UI.render({ remoto: true });
      this.ok = true;
      UI.estado('Guardado ✓');
    } catch (e) {
      console.error(e); this.sucio = true;
      UI.estado('Sin conexión · reintentando', true);
    } finally {
      this.ocupado = false;
      if (this.otraVez) { this.otraVez = false; this.correr(); }
    }
  }
};

function tocar(t) { t.upd = ahora(); }
function guardar(opts) { Sync.marcar(); UI.render(opts); }
const tareas = () => Object.values(DB.tareas).filter(t => !t.del);
const activas = () => tareas().filter(t => t.con !== 'terminada');
const catalogo = col => Object.values(DB[col]).filter(x => !x.del).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const nombreCat = (col, id) => (id && DB[col][id]) ? DB[col][id].nombre : '';
const subs = t => (t.subtareas || []);
const vencida = t => t.limite && t.con !== 'terminada' && t.limite < hoy();

function sembrarAreas() {
  if (Object.keys(DB.areas).length) return;
  CONFIG.AREAS.forEach(n => { const id = 'a-' + n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''); DB.areas[id] = { id, nombre: n, upd: '2000-01-01T00:00:00.000Z' }; });
}

function nuevaTarea(titulo, con, extra = {}) {
  const t = {
    id: uid(), titulo, notas: '', cliente: null, area: null, prioridad: 'media', limite: null,
    con, motivo: '', seguimiento: esMiembro(con) ? con : YO, desde: ahora(),
    subtareas: [], comentarios: [],
    historial: [{ id: uid(), en: ahora(), por: YO, de: null, a: con, motivo: 'Creada' }],
    creada: ahora(), creadaPor: YO, terminada: null, upd: ahora(), ...extra
  };
  DB.tareas[t.id] = t;
  return t;
}

function pasar(t, a, motivo, nota) {
  const antes = JSON.stringify(t);
  const de = t.con;
  t.historial = [...(t.historial || []), { id: uid(), en: ahora(), por: YO, de, a, motivo: a === 'terminada' ? '' : (motivo || '') }];
  if (esMiembro(a)) t.seguimiento = a; else if (esMiembro(de)) t.seguimiento = de;
  t.con = a;
  t.motivo = a === 'terminada' ? '' : (motivo || '');
  t.desde = ahora();
  t.terminada = a === 'terminada' ? ahora() : null;
  if (nota && nota.trim()) t.comentarios = [...(t.comentarios || []), { id: uid(), por: YO, en: ahora(), t: nota.trim() }];
  tocar(t); guardar();
  const msg = a === 'terminada' ? 'Tarea terminada ✓' : `Pasada a ${nombreDe(a)}${motivo ? ' · ' + motivo : ''}`;
  UI.toast(msg, () => { DB.tareas[t.id] = { ...JSON.parse(antes), upd: ahora() }; guardar(); });
}

function crearCat(col, nombre) {
  nombre = nombre.trim(); if (!nombre) return null;
  const ya = catalogo(col).find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (ya) return ya.id;
  const id = uid(); DB[col][id] = { id, nombre, upd: ahora() }; Sync.marcar(); return id;
}

// ---------- ESTADO DE LA INTERFAZ ----------
const S = {
  vista: ls.get('pend_vista', 'tablero'),
  f: { q: '', cliente: '', area: '', prio: '', con: '' },
  colMovil: 0,
  orden: { k: 'limite', dir: 1 },
  dw: null,            // id de la tarea abierta
  cap: { cliente: null },
  pasar: null          // estado del diálogo "Pasar a…"
};

function pasaFiltro(t) {
  const f = S.f;
  if (f.cliente && t.cliente !== f.cliente) return false;
  if (f.area && t.area !== f.area) return false;
  if (f.prio && t.prioridad !== f.prio) return false;
  if (f.con && t.con !== f.con) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const txt = [t.titulo, t.notas, nombreCat('clientes', t.cliente), ...subs(t).map(s => s.t)].join(' ').toLowerCase();
    if (!txt.includes(q)) return false;
  }
  return true;
}
const rankP = p => (PRIORIDADES.find(x => x.id === p) || { rank: 2 }).rank;
function ordenar(a, b) {
  const va = vencida(a) ? 0 : 1, vb = vencida(b) ? 0 : 1;
  if (va !== vb) return va - vb;
  const pa = rankP(a.prioridad), pb = rankP(b.prioridad);
  if (pa !== pb) return pa - pb;
  if (a.limite !== b.limite) return !a.limite ? 1 : !b.limite ? -1 : a.limite.localeCompare(b.limite);
  return (a.desde || '').localeCompare(b.desde || '');
}

// ---------- ÍCONOS ----------
const IC = {
  reloj: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4" stroke-linecap="round"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3.2 3L13 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sub: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="3"/><path d="M5 8.2l2 2L11 6" stroke-linecap="round"/></svg>',
  com: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h10v7H7l-3 3v-3H3z" stroke-linejoin="round"/></svg>',
  cal: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3" stroke-linecap="round"/></svg>'
};

// ---------- RENDER ----------
const UI = {
  render(opts = {}) {
    if (!YO) return;
    this.resumen();
    this.vista();
    if (S.dw) {
      const dw = $('#drawer');
      // No redibujar el panel mientras alguien escribe en él
      if (!(opts.remoto && dw.contains(document.activeElement)) && opts.drawer !== false) Drawer.render();
    }
  },

  estado(txt, err) { const e = $('#estado'); if (!e) return; e.textContent = txt; e.classList.toggle('err', !!err); },

  cabecera() {
    const u = Auth.getUser();
    const nombre = DEMO ? nombreDe(YO) : ((u?.name || '').split(' ')[0] || nombreDe(YO));
    const h = parseInt(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }));
    $('#saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${nombre}`;
    const f = new Date().toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    $('#fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
    $('#avatar').textContent = iniciales(nombreDe(YO));
    const para = $('#cap-para');
    if (!para.options.length) {
      // "Para mí" siempre primero y seleccionado
      const orden = [MIEMBROS.find(m => m.id === YO), ...otros()].filter(Boolean);
      para.innerHTML = orden.map(m => `<option value="${m.id}">${m.id === YO ? 'Para mí' : 'Para ' + esc(m.nombre)}</option>`).join('')
        + `<option value="cliente">Ya enviada · esperando cliente</option><option value="autoridad">Ya enviada · esperando autoridad</option>`;
      para.value = YO;
    }
  },

  resumen() {
    const h = hoy();
    const mias = activas().filter(t => t.con === YO);
    const venc = mias.filter(t => t.limite && t.limite < h).length;
    const paraHoy = mias.filter(t => t.limite === h).length;
    const corr = mias.filter(t => t.motivo === 'Correcciones').length;
    const vobo = mias.filter(t => t.motivo === 'Vo.Bo.').length;
    const espera = activas().filter(t => esEspera(t.con) && t.seguimiento === YO).length;
    const n = mias.length;
    let html = `<span class="res-main">${n ? `Tienes <b>${n}</b> pendiente${n === 1 ? '' : 's'}` : 'No tienes pendientes'}</span>`;
    if (venc) html += `<span class="rchip red"><b>${venc}</b> vencida${venc === 1 ? '' : 's'}</span>`;
    if (paraHoy) html += `<span class="rchip amb"><b>${paraHoy}</b> para hoy</span>`;
    if (vobo) html += `<span class="rchip amb"><b>${vobo}</b> por dar Vo.Bo.</span>`;
    if (corr) html += `<span class="rchip red"><b>${corr}</b> con correcciones</span>`;
    if (espera) html += `<span class="rchip"><b>${espera}</b> esperando respuesta</span>`;
    otros().forEach(m => { const c = activas().filter(t => t.con === m.id).length; html += `<span class="rchip">${esc(m.nombre)} tiene <b>${c}</b></span>`; });
    if (!n) html += `<span class="rchip ok">Todo al día</span>`;
    $('#resumen').innerHTML = html;
  },

  filtros() {
    const f = S.f;
    const sel = (k, vacioTxt, opciones) => `<select class="sel-mini" data-filtro="${k}"><option value="">${vacioTxt}</option>${opciones.map(o => `<option value="${o.id}" ${f[k] === o.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>`;
    const personas = S.vista === 'lista' ? sel('con', 'Con quien sea', [...MIEMBROS, ...ESPERA]) : '';
    const activo = f.q || f.cliente || f.area || f.prio || f.con;
    $('#filtros').innerHTML = `
      <input class="search" data-filtro="q" placeholder="Buscar…" value="${esc(f.q)}"/>
      ${sel('cliente', 'Todos los clientes', catalogo('clientes'))}
      ${sel('area', 'Todas las áreas', catalogo('areas'))}
      ${S.vista !== 'terminadas' ? sel('prio', 'Cualquier prioridad', PRIORIDADES) : ''}
      ${personas}
      ${activo ? '<button class="f-clear" data-act="limpiar-f">Limpiar filtros</button>' : ''}`;
  },

  vista() {
    document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === S.vista));
    $('#captura').classList.toggle('hidden', S.vista === 'terminadas');
    if (!$('#filtros').contains(document.activeElement)) this.filtros();
    const el = $('#vista');
    if (S.vista === 'lista') el.innerHTML = this.lista();
    else if (S.vista === 'terminadas') el.innerHTML = this.terminadas();
    else el.innerHTML = this.tablero();
  },

  columnas() {
    return [
      { id: YO, titulo: 'Mis tareas', corto: 'Mías' },
      ...otros().map(m => ({ id: m.id, titulo: 'Tareas de ' + m.nombre, corto: m.nombre })),
      { id: 'espera', titulo: 'En espera', corto: 'En espera', sub: 'Cliente o autoridad' }
    ];
  },
  tareasDe(colId) {
    return activas().filter(t => colId === 'espera' ? esEspera(t.con) : t.con === colId).filter(pasaFiltro).sort(ordenar);
  },

  tablero() {
    const cols = this.columnas();
    if (S.colMovil >= cols.length) S.colMovil = 0;
    const tabs = `<div class="coltabs">${cols.map((c, i) => `<button class="${i === S.colMovil ? 'on' : ''}" data-act="colmovil" data-i="${i}"><i class="dot ${dotClase(c.id)}"></i><span class="nm">${esc(c.corto)}</span> <span class="muted">${this.tareasDe(c.id).length}</span></button>`).join('')}</div>`;
    const html = cols.map((c, i) => {
      const lista = this.tareasDe(c.id);
      let cards;
      if (!lista.length) cards = `<div class="empty">${c.id === 'espera' ? 'Nada esperando al cliente ni a la autoridad' : c.id === YO ? 'Nada pendiente. Arrastra aquí o usa la barra de arriba.' : 'Sin pendientes'}</div>`;
      else if (c.id === 'espera') {
        cards = ESPERA.map(e => { const g = lista.filter(t => t.con === e.id); return g.length ? `<div class="grp">${e.nombre} · ${g.length}</div>${g.map(t => this.card(t)).join('')}` : ''; }).join('');
      } else cards = lista.map(t => this.card(t)).join('');
      return `<section class="col ${i === S.colMovil ? 'act' : ''}" data-drop="${c.id}">
        <div class="col-h"><i class="dot ${dotClase(c.id)}"></i><h2>${esc(c.titulo)}</h2><span class="cnt">${lista.length}</span>${c.sub ? `<span class="csub">${c.sub}</span>` : ''}</div>
        <div class="cards">${cards}</div></section>`;
    }).join('');
    return tabs + `<div class="board" style="--cols:${cols.length}">${html}</div>`;
  },

  card(t) {
    const h = hoy();
    const st = subs(t), ok = st.filter(s => s.ok).length;
    const cli = nombreCat('clientes', t.cliente), area = nombreCat('areas', t.area);
    const ult = (t.historial || []).slice(-1)[0];
    let quien = '';
    if (esEspera(t.con)) quien = `Seguimiento: ${nombreDe(t.seguimiento)} · ${hace(t.desde)}`;
    else if (ult && ult.por && ult.por !== t.con && ult.a === t.con) quien = `De ${nombreDe(ult.por)} · ${hace(t.desde)}`;
    else quien = hace(t.desde || t.creada);
    const prio = `<span class="tag t-${t.prioridad || 'media'}">${nombreDe2(t.prioridad || 'media')}</span>`;
    const motivo = t.motivo ? `<span class="tag ${t.motivo === 'Correcciones' ? 't-warn' : 't-mot'}">${esc(t.motivo)}</span>` : '';
    const due = t.limite ? `<span class="due ${t.limite < h ? 'ov' : t.limite === h ? 'hoy' : ''}">${IC.cal} ${fechaRel(t.limite)}</span>` : '';
    return `<article class="card p-${t.prioridad}" draggable="true" data-act="abrir" data-id="${t.id}">
      <div class="c-tags">${motivo}${prio}</div>
      <h3 class="c-title">${esc(t.titulo)}</h3>
      <div class="c-meta">${cli ? `<span class="chip">${esc(cli)}</span>` : ''}${area ? `<span class="chip ghost">${esc(area)}</span>` : ''}${due}${st.length ? `<span class="mini ${ok === st.length ? 'done' : ''}">${IC.sub} ${ok}/${st.length}</span>` : ''}${(t.comentarios || []).length ? `<span class="mini">${IC.com} ${t.comentarios.length}</span>` : ''}${horasDe(t).length ? `<span class="mini">${IC.reloj} ${fmtMin(horasDe(t).reduce((a, h) => a + h.min, 0))}</span>` : ''}</div>
      <div class="c-foot"><span class="age">${esc(quien)}</span><button class="pass" data-act="pasar" data-id="${t.id}">Pasar →</button></div>
    </article>`;
  },

  lista() {
    const o = S.orden;
    const val = {
      titulo: t => t.titulo.toLowerCase(), con: t => nombreDe(t.con), motivo: t => t.motivo || '~',
      cliente: t => nombreCat('clientes', t.cliente) || '~', area: t => nombreCat('areas', t.area) || '~',
      prioridad: t => rankP(t.prioridad), limite: t => t.limite || '9999', upd: t => t.upd || ''
    };
    const rows = activas().filter(pasaFiltro).sort((a, b) => { const x = val[o.k](a), y = val[o.k](b); return (x > y ? 1 : x < y ? -1 : ordenar(a, b)) * o.dir; });
    const th = (k, l) => `<th data-act="orden" data-k="${k}" class="${o.k === k ? 's' + (o.dir < 0 ? ' up' : '') : ''}">${l}</th>`;
    const h = hoy();
    if (!rows.length) return `<div class="empty">No hay tareas con estos filtros</div>`;
    return `<div class="tbl-wrap"><table><thead><tr>${th('titulo', 'Tarea')}${th('con', 'Con')}${th('motivo', 'Motivo')}${th('cliente', 'Cliente')}${th('area', 'Área')}${th('prioridad', 'Prioridad')}${th('limite', 'Límite')}<th>Avance</th>${th('upd', 'Último cambio')}</tr></thead><tbody>
      ${rows.map(t => { const st = subs(t), ok = st.filter(s => s.ok).length; return `<tr class="row" data-act="abrir" data-id="${t.id}">
        <td class="td-t">${esc(t.titulo)}</td>
        <td><span class="holder"><i class="dot ${dotClase(t.con)}"></i>${nombreDe(t.con)}</span></td>
        <td>${t.motivo ? `<span class="tag ${t.motivo === 'Correcciones' ? 't-warn' : 't-mot'}">${esc(t.motivo)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${esc(nombreCat('clientes', t.cliente)) || '<span class="muted">—</span>'}</td>
        <td>${esc(nombreCat('areas', t.area)) || '<span class="muted">—</span>'}</td>
        <td>${nombreDe2(t.prioridad)}</td>
        <td>${t.limite ? `<span class="due ${t.limite < h ? 'ov' : t.limite === h ? 'hoy' : ''}">${fechaRel(t.limite)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${st.length ? `<span class="mini ${ok === st.length ? 'done' : ''}">${ok}/${st.length}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted">${hace(t.upd)}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  },

  terminadas() {
    const lista = tareas().filter(t => t.con === 'terminada').filter(pasaFiltro).sort((a, b) => (b.terminada || '').localeCompare(a.terminada || ''));
    if (!lista.length) return `<div class="empty">Todavía no hay tareas terminadas${S.f.q || S.f.cliente || S.f.area ? ' con estos filtros' : ''}</div>`;
    let dia = '', html = '';
    lista.forEach(t => {
      const d = diaISO(t.terminada || t.upd);
      if (d !== dia) { dia = d; html += `<div class="done-day">${d === hoy() ? 'Hoy' : d === sumarDias(hoy(), -1) ? 'Ayer' : new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`; }
      const ult = (t.historial || []).filter(x => x.a === 'terminada').slice(-1)[0];
      const cli = nombreCat('clientes', t.cliente);
      html += `<div class="done-row" data-act="abrir" data-id="${t.id}"><span class="ok">${IC.check}</span>
        <div class="dt"><div>${esc(t.titulo)}</div><div class="dm">${cli ? esc(cli) + ' · ' : ''}Terminada por ${nombreDe(ult?.por || t.seguimiento)} · ${fechaHora(t.terminada)}</div></div>
        <button class="btn sm" data-act="reabrir" data-id="${t.id}">Reabrir</button></div>`;
    });
    return `<div class="done-list">${html}</div>`;
  },

  toast(msg, deshacer) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${deshacer ? '<button id="t-undo">Deshacer</button>' : ''}`;
    el.classList.remove('hidden');
    if (deshacer) $('#t-undo').onclick = () => { deshacer(); el.classList.add('hidden'); };
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), deshacer ? 6000 : 2600);
  }
};
// ---------- HORAS ----------
// "0:30" · "1:15" · "1.5" (horas) · "45" (minutos) · "2" (horas)
function leerTiempo(txt) {
  txt = String(txt || '').trim().replace(',', '.');
  if (!txt) return 0;
  if (txt.includes(':')) { const [h, m] = txt.split(':'); return (parseInt(h) || 0) * 60 + (parseInt(m) || 0); }
  const n = parseFloat(txt); if (isNaN(n)) return 0;
  if (txt.includes('.')) return Math.round(n * 60);
  return n < 10 ? n * 60 : n;
}
const fmtMin = m => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const horasDe = t => (t.horas || []).filter(h => !h.del).sort((a, b) => a.fecha.localeCompare(b.fecha));
const inicialesDe = id => (MIEMBROS.find(m => m.id === id) || {}).iniciales || iniciales(nombreDe(id));

const nombreDe2 = p => (PRIORIDADES.find(x => x.id === p) || { nombre: '—' }).nombre;

// ---------- PANEL DE DETALLE ----------
const Drawer = {
  abrir(id) { S.dw = id; $('#drawer').classList.remove('hidden'); $('#scrim').classList.remove('hidden'); this.render(); $('#drawer').scrollTop = 0; },
  cerrar() { S.dw = null; $('#drawer').classList.add('hidden'); $('#scrim').classList.add('hidden'); Pop.cerrar(); },
  t() { return S.dw ? DB.tareas[S.dw] : null; },
  render() {
    const t = this.t();
    if (!t || t.del) { this.cerrar(); return; }
    const st = subs(t), ok = st.filter(s => s.ok).length;
    const cli = nombreCat('clientes', t.cliente), area = nombreCat('areas', t.area);
    const row = (k, v) => `<div class="pk">${k}</div><div style="display:flex;align-items:center;gap:4px;min-width:0">${v}</div>`;
    const hist = (t.historial || []).slice().reverse().map(x => {
      let txt;
      if (x.motivo === 'Creada') txt = `<b>${nombreDe(x.por)}</b> la creó para ${nombreDe(x.a)}`;
      else if (x.a === 'terminada') txt = `<b>${nombreDe(x.por)}</b> la marcó como terminada`;
      else if (x.motivo === 'Reabierta') txt = `<b>${nombreDe(x.por)}</b> la reabrió para ${nombreDe(x.a)}`;
      else txt = `<b>${nombreDe(x.por)}</b> la pasó a ${nombreDe(x.a)}${x.motivo ? ` · ${esc(x.motivo)}` : ''}`;
      return `<div class="hi">${txt}<span class="when">${fechaHora(x.en)}</span></div>`;
    }).join('');
    $('#drawer').innerHTML = `
      <div class="dw-head">
        <span class="holder"><i class="dot ${dotClase(t.con)}"></i>${t.con === 'terminada' ? 'Terminada' : 'Con ' + nombreDe(t.con)}${t.motivo ? ` · <span class="tag ${t.motivo === 'Correcciones' ? 't-warn' : 't-mot'}">${esc(t.motivo)}</span>` : ''}</span>
        <div class="dw-act">
          ${t.con === 'terminada' ? `<button class="btn sm" data-act="reabrir" data-id="${t.id}">Reabrir</button>` : `<button class="btn sm pri" data-act="pasar" data-id="${t.id}">Pasar →</button>`}
          <button class="icon" data-act="cerrar-dw" title="Cerrar">×</button>
        </div>
      </div>
      <textarea class="dw-title" data-f="titulo" rows="1" placeholder="Sin título">${esc(t.titulo)}</textarea>
      <div class="props">
        ${row('Cliente', `<button class="pv" data-act="combo" data-k="cliente">${cli ? `<span class="chip">${esc(cli)}</span>` : '<span class="ph">Elegir cliente</span>'}</button>`)}
        ${row('Área', `<button class="pv" data-act="combo" data-k="area">${area ? `<span class="chip ghost">${esc(area)}</span>` : '<span class="ph">Elegir área</span>'}</button>`)}
        ${row('Prioridad', `<select class="pv-in" data-f="prioridad">${PRIORIDADES.map(p => `<option value="${p.id}" ${t.prioridad === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}</select>`)}
        ${row('Fecha límite', `<input type="date" class="pv-in" data-f="limite" value="${t.limite || ''}"/>${t.limite ? ` <button class="icon sm" data-act="sin-fecha" title="Quitar fecha">×</button>` : ''}`)}
        ${t.con !== 'terminada' && esEspera(t.con) ? row('Seguimiento', `<select class="pv-in" data-f="seguimiento">${MIEMBROS.map(m => `<option value="${m.id}" ${t.seguimiento === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select>`) : ''}
        ${row('Creada', `<span class="pv muted">${fechaISO(t.creada)} · ${nombreDe(t.creadaPor)}</span>`)}
        ${t.terminada ? row('Terminada', `<span class="pv muted">${fechaHora(t.terminada)}</span>`) : ''}
      </div>
      <div class="dsec"><h4>Notas</h4><textarea class="notas" data-f="notas" placeholder="Detalles, contexto, ligas a documentos…">${esc(t.notas || '')}</textarea></div>
      <div class="dsec"><h4>Subtareas ${st.length ? `<span>${ok}/${st.length}</span>` : ''}</h4>
        ${st.length ? `<div class="progress"><i style="width:${Math.round(ok / st.length * 100)}%"></i></div>` : ''}
        ${st.map(s => `<div class="st ${s.ok ? 'on' : ''}"><button class="ck ${s.ok ? 'on' : ''}" data-act="st-ok" data-sid="${s.id}">${s.ok ? IC.check : ''}</button><input class="st-t" data-st="${s.id}" value="${esc(s.t)}"/><button class="icon sm" data-act="st-del" data-sid="${s.id}" title="Quitar">×</button></div>`).join('')}
        <input class="addin" data-add="sub" placeholder="+ Agregar subtarea (Enter)"/>
      </div>
      <div class="dsec"><h4>Horas ${horasDe(t).length ? `<span>${fmtMin(horasDe(t).reduce((a, h) => a + h.min, 0))} hrs</span>` : ''}</h4>
        ${horasDe(t).map(h => `<div class="hr-row"><span class="hd">${fechaCorta(h.fecha)}</span><span class="hi2">${esc(inicialesDe(h.por))}</span><span class="ht">${esc(h.desc || t.titulo)}</span><span class="hh">${fmtMin(h.min)}</span><button class="icon sm" data-act="hr-del" data-hid="${h.id}" title="Quitar">×</button></div>`).join('')}
        <div class="hr-add">
          <input type="date" class="fi" id="hr-f" value="${hoy()}"/>
          <select class="fi" id="hr-p">${MIEMBROS.map(m => `<option value="${m.id}" ${m.id === YO ? 'selected' : ''}>${esc(m.iniciales || m.nombre)}</option>`).join('')}</select>
          <input class="fi" id="hr-t" placeholder="0:30" inputmode="decimal"/>
          <input class="fi desc" id="hr-d" placeholder="Descripción (si no, usa el título)"/>
          <button class="btn sm pri" data-act="hr-add">Agregar</button>
        </div>
        <div class="hr-chips">${['0:15', '0:30', '1:00', '2:00'].map(x => `<button class="opt sm" data-act="hr-chip" data-v="${x}">${x}</button>`).join('')}</div>
      </div>
      <div class="dsec"><h4>Comentarios ${(t.comentarios || []).length ? `<span>${t.comentarios.length}</span>` : ''}</h4>
        ${(t.comentarios || []).map(c => `<div class="com"><div class="avatar av-${esc(c.por)}">${iniciales(nombreDe(c.por))}</div><div class="com-b"><div class="com-m"><b>${nombreDe(c.por)}</b> · ${fechaHora(c.en)}</div><div class="com-t">${esc(c.t)}</div></div></div>`).join('')}
        <textarea class="addin" data-add="com" rows="2" placeholder="Escribe un comentario… (Enter para enviar, Shift+Enter salto de línea)"></textarea>
      </div>
      <div class="dsec"><h4>Historial</h4><div class="hist">${hist}</div></div>
      <div class="dw-foot"><span class="muted" style="font-size:11px">Último cambio ${hace(t.upd)}</span><button class="btn sm danger" data-act="eliminar" data-id="${t.id}">Eliminar tarea</button></div>`;
    ajustarAlto($('#drawer .dw-title'));
  }
};
function ajustarAlto(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

// ---------- DIÁLOGO "PASAR A…" ----------
const Modal = {
  abrir(html) { $('#modalbox').classList.remove('wide'); $('#modalbox').innerHTML = html; $('#modal').classList.remove('hidden'); },
  cerrar() { $('#modal').classList.add('hidden'); $('#modalbox').innerHTML = ''; $('#modalbox').classList.remove('wide'); S.pasar = null; }
};
function sugerirMotivo(t, a) {
  if (a === 'cliente') return 'Respuesta';
  if (esMiembro(a) && a !== YO && t.con === YO) return 'Vo.Bo.';
  return '';
}
function abrirPasar(id, pre, mensaje) {
  const t = DB.tareas[id]; if (!t) return;
  let a = pre;
  if (!a || a === t.con) a = esEspera(t.con) ? (t.seguimiento || YO) : (t.con === YO ? (otros()[0]?.id || 'cliente') : YO);
  if (a === 'espera') a = 'cliente';
  S.pasar = { id, a, motivo: sugerirMotivo(t, a), nota: '', mensaje };
  renderPasar();
}
function renderPasar() {
  const P = S.pasar, t = DB.tareas[P.id];
  const destinos = [...MIEMBROS.filter(m => m.id !== t.con), ...ESPERA.filter(e => e.id !== t.con), { id: 'terminada', nombre: 'Terminada ✓' }];
  const esMot = CONFIG.MOTIVOS.includes(P.motivo);
  Modal.abrir(`
    <div class="mt">Pasar tarea</div>
    <div class="msub">${esc(t.titulo)}</div>
    ${P.mensaje ? `<div class="msg">${esc(P.mensaje)}</div>` : ''}
    <span class="lbl">¿A quién?</span>
    <div class="opts">${destinos.map(d => `<button class="opt ${P.a === d.id ? 'on' : ''}" data-act="p-a" data-v="${d.id}"><i class="dot ${dotClase(d.id)}"></i>${d.id === YO ? 'Yo' : esc(d.nombre)}</button>`).join('')}</div>
    ${P.a !== 'terminada' ? `
      <span class="lbl">¿Qué falta?</span>
      <div class="opts">${CONFIG.MOTIVOS.map(m => `<button class="opt sm ${P.motivo === m ? 'on' : ''}" data-act="p-m" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <input class="fi" style="margin-top:8px" id="p-motivo" placeholder="u otro motivo…" value="${esMot ? '' : esc(P.motivo)}"/>` : ''}
    <span class="lbl">Nota (opcional)</span>
    <textarea class="fi" id="p-nota" placeholder="Se agrega como comentario">${esc(P.nota)}</textarea>
    <div class="ma"><button class="btn" data-act="modal-x">Cancelar</button><button class="btn pri" data-act="p-ok">${P.a === 'terminada' ? 'Marcar como terminada' : 'Pasar a ' + (P.a === YO ? 'mí' : esc(nombreDe(P.a)))}</button></div>`);
}
function leerPasar() {
  const P = S.pasar; if (!P) return;
  const nota = $('#p-nota'); if (nota) P.nota = nota.value;
  const mot = $('#p-motivo'); if (mot && mot.value.trim()) P.motivo = mot.value.trim();
}

// ---------- CATÁLOGO: CLIENTES Y ÁREAS ----------
function abrirCatalogo() {
  const uso = (col, id) => tareas().filter(t => t[col === 'clientes' ? 'cliente' : 'area'] === id && t.con !== 'terminada').length;
  const bloque = (col, titulo, ph) => `<div><span class="lbl" style="margin-top:0">${titulo}</span>
    ${catalogo(col).map(x => `<div class="cat-row"><input class="fi" data-cat="${col}" data-id="${x.id}" value="${esc(x.nombre)}"/><span class="n" title="Tareas activas">${uso(col, x.id)}</span><button class="icon sm" data-act="cat-del" data-col="${col}" data-id="${x.id}" title="Quitar de la lista">×</button></div>`).join('') || '<div class="muted" style="font-size:12px;padding:6px 0">Aún no hay</div>'}
    <input class="addin" data-catadd="${col}" placeholder="${ph}"/></div>`;
  Modal.abrir(`<div class="mt">Clientes y áreas</div>
    <div class="msub">También se crean solos al escribir uno nuevo dentro de una tarea. Cambiar un nombre aquí lo cambia en todas.</div>
    <div class="cat-grid">${bloque('clientes', 'Clientes', '+ Nuevo cliente (Enter)')}${bloque('areas', 'Áreas', '+ Nueva área (Enter)')}</div>
    <div class="ma"><button class="btn pri" data-act="modal-x">Listo</button></div>`);
}

// ---------- COMBOBOX TIPO NOTION ----------
const Pop = {
  ctx: null,
  abrir(ancla, ctx) {
    this.ctx = { ...ctx, q: '', hl: 0 };
    const el = $('#pop'); el.classList.remove('hidden');
    const r = ancla.getBoundingClientRect();
    const w = 260, x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const y = r.bottom + 4 + 300 > window.innerHeight ? Math.max(8, r.top - 300) : r.bottom + 4;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.innerHTML = `<input id="pop-q" placeholder="${esc(ctx.ph)}"/><div class="pop-l" id="pop-l"></div>`;
    this.lista(); setTimeout(() => $('#pop-q')?.focus(), 10);
  },
  opciones() {
    const q = this.ctx.q.trim().toLowerCase();
    const items = catalogo(this.ctx.col).filter(x => !q || x.nombre.toLowerCase().includes(q)).map(x => ({ id: x.id, label: x.nombre }));
    const out = q ? [] : [{ id: null, label: this.ctx.vacio, ph: true }];
    out.push(...items);
    if (q && !catalogo(this.ctx.col).some(x => x.nombre.toLowerCase() === q)) out.push({ crear: this.ctx.q.trim(), label: `Crear «${this.ctx.q.trim()}»` });
    return out;
  },
  lista() {
    const ops = this.opciones(); this.ctx.ops = ops;
    if (this.ctx.hl >= ops.length) this.ctx.hl = 0;
    $('#pop-l').innerHTML = ops.map((o, i) => `<button class="pop-o ${o.crear ? 'new' : ''} ${o.id && o.id === this.ctx.valor ? 'sel' : ''} ${i === this.ctx.hl ? 'hl' : ''}" data-act="pop-pick" data-i="${i}">${o.ph ? `<span class="ph">${esc(o.label)}</span>` : esc(o.label)}</button>`).join('') || '<div class="muted" style="padding:8px">Escribe para crear</div>';
  },
  elegir(i) {
    const o = this.ctx.ops[i]; if (!o) return;
    const id = o.crear ? crearCat(this.ctx.col, o.crear) : o.id;
    const cb = this.ctx.onPick; this.cerrar(); cb(id);
  },
  cerrar() { $('#pop').classList.add('hidden'); this.ctx = null; }
};

function agregarHoras(t) {
  const min = leerTiempo($('#hr-t').value);
  if (!min) { UI.toast('Escribe el tiempo, p. ej. 0:30'); $('#hr-t').focus(); return; }
  const fecha = $('#hr-f').value || hoy();
  t.horas = [...(t.horas || []), { id: uid(), fecha, por: $('#hr-p').value || YO, min, desc: $('#hr-d').value.trim(), en: ahora(), upd: ahora() }];
  tocar(t); guardar();
  UI.toast(`${fmtMin(min)} hrs registradas`);
  $('#hr-t')?.focus();
}

// ---------- CÓMPUTO DE HORAS → WORD ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const Reporte = {
  st: null,
  abrir() {
    const m = hoy().slice(0, 7);
    const cli = S.f.cliente || catalogo('clientes').find(c => this.filasDe(c.id, m).length)?.id || catalogo('clientes')[0]?.id || '';
    this.st = { cliente: cli, mes: m, fecha: '' };
    this.cargarCliente(); this.render();
  },
  cargarCliente() {
    const c = DB.clientes[this.st.cliente];
    this.st.razon = c ? (c.razon || c.nombre.toUpperCase()) : '';
    this.st.incluidas = c && c.incluidas != null ? c.incluidas : '';
    const [y, mo] = this.st.mes.split('-').map(Number);
    this.st.fecha = new Date(y, mo, 0).toLocaleDateString('en-CA');
  },
  filasDe(cli, mes) {
    const out = [];
    tareas().filter(t => t.cliente === cli).forEach(t => horasDe(t).filter(h => h.fecha.startsWith(mes)).forEach(h => out.push({ h, t })));
    return out.sort((a, b) => a.h.fecha.localeCompare(b.h.fecha) || (a.h.en || '').localeCompare(b.h.en || ''));
  },
  leer() {
    const v = id => $('#' + id)?.value ?? '';
    const cli = v('rep-c'), mes = v('rep-m');
    const cambioBase = cli !== this.st.cliente || mes !== this.st.mes;
    this.st.razon = v('rep-r'); this.st.incluidas = v('rep-i'); this.st.fecha = v('rep-f');
    if (cambioBase) { this.st.cliente = cli; this.st.mes = mes || hoy().slice(0, 7); this.cargarCliente(); }
  },
  render() {
    const st = this.st, filas = st.cliente ? this.filasDe(st.cliente, st.mes) : [];
    const total = filas.reduce((a, f) => a + f.h.min, 0);
    const inc = parseFloat(st.incluidas) || 0, exc = inc ? Math.max(0, total - inc * 60) : 0;
    const clientes = catalogo('clientes');
    $('#modalbox').parentElement.classList.remove('hidden');
    $('#modalbox').classList.add('wide');
    $('#modalbox').innerHTML = `<div class="mt">Cómputo de horas</div>
      <div class="msub">Junta las horas registradas en las tareas del cliente durante el mes y llena el formato de Word.</div>
      ${clientes.length ? `<div class="rep-grid">
        <div><label>Cliente</label><select class="fi" id="rep-c" data-rep="1">${clientes.map(c => `<option value="${c.id}" ${c.id === st.cliente ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
        <div><label>Mes</label><input type="month" class="fi" id="rep-m" data-rep="1" value="${st.mes}" style="color-scheme:dark"/></div>
        <div><label>Razón social (ATENCIÓN:)</label><input class="fi" id="rep-r" data-repsum="1" value="${esc(st.razon)}"/></div>
        <div><label>Horas incluidas al mes (vacío si no aplica)</label><input class="fi" id="rep-i" data-repsum="1" inputmode="decimal" value="${esc(st.incluidas)}" placeholder="p. ej. 16"/></div>
        <div><label>Fecha del documento</label><input type="date" class="fi" id="rep-f" data-repsum="1" value="${st.fecha}" style="color-scheme:dark"/></div>
      </div>
      <div class="rep-tbl">${filas.length ? `<table><thead><tr><th>No.</th><th>Fecha</th><th>Asunto</th><th>Horas</th></tr></thead><tbody>
        ${filas.map((f, i) => `<tr><td class="muted">${i + 1}</td><td style="white-space:nowrap">${fechaCorta(f.h.fecha)}</td><td>${esc(inicialesDe(f.h.por))} – ${esc(f.h.desc || f.t.titulo)}</td><td style="font-family:var(--mono)">${fmtMin(f.h.min)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="empty" style="border:none">No hay horas registradas para este cliente en ${MESES[+st.mes.slice(5, 7) - 1]}. Se registran dentro de cada tarea, en la sección «Horas».</div>`}</div>
      <div class="rep-sum" id="rep-sum">${this.htmlResumen(total, inc, exc)}</div>`
      : `<div class="empty">Primero da de alta clientes (desde una tarea o en «Clientes y áreas»).</div>`}
      <div class="ma"><button class="btn" data-act="modal-x">Cerrar</button>${clientes.length ? `<button class="btn pri" data-act="rep-word" ${filas.length ? '' : 'disabled style="opacity:.4;pointer-events:none"'}>Descargar Word</button>` : ''}</div>`;
  },
  htmlResumen(total, inc, exc) {
    return `<span class="rchip">Total <b>${fmtMin(total)} hrs</b></span>${inc ? `<span class="rchip">Incluidas <b>${fmtMin(inc * 60)}</b></span><span class="rchip ${exc ? 'red' : 'ok'}">${exc ? `Excedente <b>${fmtMin(exc)} hrs</b>` : 'Dentro de lo incluido'}</span>` : ''}`;
  },
  resumen() {
    const st = this.st, total = this.filasDe(st.cliente, st.mes).reduce((a, f) => a + f.h.min, 0);
    const inc = parseFloat(String(st.incluidas).replace(',', '.')) || 0;
    const el = $('#rep-sum'); if (el) el.innerHTML = this.htmlResumen(total, inc, inc ? Math.max(0, total - inc * 60) : 0);
  },
  async libs() {
    const cargar = src => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
    if (!window.PizZip) await cargar('lib/pizzip.min.js');
    if (!window.docxtemplater) await cargar('lib/docxtemplater.min.js');
  },
  async descargar(btn) {
    this.leer();
    const st = this.st, filas = this.filasDe(st.cliente, st.mes);
    if (!filas.length) return;
    const c = DB.clientes[st.cliente];
    const inc = parseFloat(st.incluidas);
    // Guardar razón social y horas incluidas en el cliente para la próxima vez
    if (c && (c.razon !== st.razon || String(c.incluidas ?? '') !== String(st.incluidas))) { c.razon = st.razon; c.incluidas = isNaN(inc) ? null : inc; c.upd = ahora(); Sync.marcar(); }
    const txt = btn.textContent; btn.textContent = 'Generando…';
    try {
      await this.libs();
      const res = await fetch(CONFIG.PLANTILLA_HORAS, { cache: 'no-store' });
      if (!res.ok) throw new Error('No encontré la plantilla ' + CONFIG.PLANTILLA_HORAS);
      const zip = new PizZip(await res.arrayBuffer());
      const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      const [y, mo] = st.mes.split('-').map(Number);
      const total = filas.reduce((a, f) => a + f.h.min, 0);
      const f2 = n => String(n).padStart(2, '0');
      doc.render({
        fecha_doc: new Date(st.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
        razon_social: st.razon,
        mes: `${MESES[mo - 1]} de ${y}`.toUpperCase(),
        hay_incluidas: !isNaN(inc) && inc > 0, incluidas: inc, incluidas_hhmm: fmtMin((inc || 0) * 60),
        total: fmtMin(total),
        filas: filas.map((f, i) => { const [yy, mm, dd] = f.h.fecha.split('-'); return { n: i + 1, fecha: `${dd} / ${mm} / ${yy}`, iniciales: inicialesDe(f.h.por), asunto: f.h.desc || f.t.titulo, horas: fmtMin(f.h.min) }; })
      });
      const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a');
      const nombre = (c?.nombre || 'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
      a.href = URL.createObjectURL(blob); a.download = `Horas_Servicios_${nombre}_${MESES[mo - 1]}_${y}.docx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      UI.toast('Word generado ✓');
    } catch (e) {
      console.error(e); UI.toast('No se pudo generar el Word: ' + e.message);
    } finally { btn.textContent = txt; }
  }
};

// ---------- EVENTOS ----------
function alClic(e) {
  const el = e.target.closest('[data-act]');
  if (!$('#pop').classList.contains('hidden') && !e.target.closest('#pop') && !(el && el.dataset.act.startsWith('combo'))) Pop.cerrar();
  if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  const t = id ? DB.tareas[id] : Drawer.t();
  switch (a) {
    case 'vista': S.vista = el.dataset.v; ls.set('pend_vista', S.vista); if (S.vista !== 'lista') S.f.con = ''; UI.filtros(); UI.vista(); break;
    case 'colmovil': S.colMovil = +el.dataset.i; UI.vista(); break;
    case 'abrir': Drawer.abrir(id); break;
    case 'cerrar-dw': Drawer.cerrar(); break;
    case 'pasar': e.stopPropagation(); abrirPasar(id); break;
    case 'p-a': leerPasar(); S.pasar.a = el.dataset.v; { const tt = DB.tareas[S.pasar.id]; if (!S.pasar.motivo || CONFIG.MOTIVOS.includes(S.pasar.motivo)) S.pasar.motivo = sugerirMotivo(tt, S.pasar.a) || S.pasar.motivo; } renderPasar(); break;
    case 'p-m': leerPasar(); S.pasar.motivo = S.pasar.motivo === el.dataset.v ? '' : el.dataset.v; renderPasar(); break;
    case 'p-ok': {
      const P = S.pasar; leerPasar();
      const mot = $('#p-motivo'); if (mot && !mot.value.trim() && !CONFIG.MOTIVOS.includes(P.motivo)) P.motivo = '';
      const tt = DB.tareas[P.id]; Modal.cerrar(); pasar(tt, P.a, P.motivo, P.nota); break;
    }
    case 'modal-x': Modal.cerrar(); break;
    case 'reabrir': e.stopPropagation(); pasar(t, t.seguimiento && esMiembro(t.seguimiento) ? t.seguimiento : YO, 'Reabierta'); break;
    case 'eliminar': {
      const copia = JSON.stringify(t); t.del = true; tocar(t); Drawer.cerrar(); guardar();
      UI.toast('Tarea eliminada', () => { DB.tareas[t.id] = { ...JSON.parse(copia), del: false, upd: ahora() }; guardar(); }); break;
    }
    case 'sin-fecha': t.limite = null; tocar(t); guardar(); break;
    case 'st-ok': {
      const s = subs(t).find(x => x.id === el.dataset.sid); if (!s) break;
      s.ok = !s.ok; tocar(t); guardar();
      const st = subs(t);
      if (s.ok && st.length && st.every(x => x.ok) && t.con !== 'terminada') abrirPasar(t.id, 'terminada', 'Completaste todas las subtareas. ¿La terminas o se la pasas a alguien?');
      break;
    }
    case 'st-del': t.subtareas = subs(t).filter(x => x.id !== el.dataset.sid); tocar(t); guardar(); break;
    case 'combo': {
      const k = el.dataset.k, col = k === 'cliente' ? 'clientes' : 'areas';
      Pop.abrir(el, { col, valor: t[k], vacio: k === 'cliente' ? 'Sin cliente' : 'Sin área', ph: k === 'cliente' ? 'Buscar o crear cliente…' : 'Buscar o crear área…', onPick: v => { t[k] = v; tocar(t); guardar(); } });
      break;
    }
    case 'combo-cap':
      Pop.abrir(el, { col: 'clientes', valor: S.cap.cliente, vacio: 'Sin cliente', ph: 'Buscar o crear cliente…', onPick: v => { S.cap.cliente = v; $('#cap-cli').textContent = nombreCat('clientes', v) || 'Sin cliente'; $('#cap-t').focus(); } });
      break;
    case 'pop-pick': Pop.elegir(+el.dataset.i); break;
    case 'catalogo': abrirCatalogo(); break;
    case 'hr-chip': $('#hr-t').value = el.dataset.v; $('#hr-d').focus(); break;
    case 'hr-add': agregarHoras(t); break;
    case 'hr-del': {
      const h = (t.horas || []).find(x => x.id === el.dataset.hid); if (!h) break;
      h.del = true; h.upd = ahora(); tocar(t); guardar();
      UI.toast('Registro de horas quitado', () => { h.del = false; h.upd = ahora(); tocar(t); guardar(); }); break;
    }
    case 'horas': $('#menu').classList.add('hidden'); $('#burger').setAttribute('aria-expanded', 'false'); Reporte.abrir(); break;
    case 'rep-word': Reporte.descargar(el); break;
    case 'cat-del': {
      const x = DB[el.dataset.col][el.dataset.id]; x.del = true; x.upd = ahora(); guardar(); abrirCatalogo();
      UI.toast(`«${x.nombre}» quitado de la lista`, () => { x.del = false; x.upd = ahora(); guardar(); if (!$('#modal').classList.contains('hidden')) abrirCatalogo(); }); break;
    }
    case 'orden': S.orden = S.orden.k === el.dataset.k ? { k: el.dataset.k, dir: -S.orden.dir } : { k: el.dataset.k, dir: 1 }; UI.vista(); break;
    case 'limpiar-f': S.f = { q: '', cliente: '', area: '', prio: '', con: '' }; UI.filtros(); UI.vista(); break;
  }
}

let tRender = null;
function alEscribir(e) {
  const el = e.target;
  if (el.dataset.filtro === 'q') { S.f.q = el.value; UI.vista(); return; }
  if (el.dataset.repsum) { Reporte.leer(); Reporte.resumen(); return; }
  if (el.id === 'pop-q') { Pop.ctx.q = el.value; Pop.ctx.hl = 0; Pop.lista(); return; }
  const t = Drawer.t(); if (!t) return;
  if (el.dataset.f === 'titulo' || el.dataset.f === 'notas') {
    t[el.dataset.f] = el.dataset.f === 'titulo' ? el.value.replace(/\n/g, ' ') : el.value;
    if (el.dataset.f === 'titulo') ajustarAlto(el);
    tocar(t); Sync.marcar();
    clearTimeout(tRender); tRender = setTimeout(() => UI.render({ drawer: false }), 400);
  } else if (el.dataset.st) {
    const s = subs(t).find(x => x.id === el.dataset.st); if (s) { s.t = el.value; tocar(t); Sync.marcar(); }
  }
}
function alCambiar(e) {
  const el = e.target;
  if (el.dataset.rep) { Reporte.leer(); Reporte.render(); return; }
  if (el.dataset.repsum) { Reporte.leer(); Reporte.resumen(); return; }
  if (el.dataset.filtro && el.dataset.filtro !== 'q') { S.f[el.dataset.filtro] = el.value; UI.filtros(); UI.vista(); return; }
  if (el.dataset.cat) {
    const x = DB[el.dataset.cat][el.dataset.id], v = el.value.trim();
    if (x && v && v !== x.nombre) { x.nombre = v; x.upd = ahora(); guardar(); }
    return;
  }
  const t = Drawer.t(); if (!t) return;
  if (['prioridad', 'limite', 'seguimiento'].includes(el.dataset.f)) { t[el.dataset.f] = el.value || null; tocar(t); guardar(); }
  if (el.dataset.st) guardar({ drawer: false });
}
function alTecla(e) {
  const el = e.target;
  if (e.key === 'Escape') {
    if (!$('#pop').classList.contains('hidden')) Pop.cerrar();
    else if (!$('#modal').classList.contains('hidden')) Modal.cerrar();
    else if (S.dw) Drawer.cerrar();
    return;
  }
  if (el.id === 'pop-q') {
    const n = Pop.ctx.ops.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); Pop.ctx.hl = (Pop.ctx.hl + 1) % n; Pop.lista(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); Pop.ctx.hl = (Pop.ctx.hl - 1 + n) % n; Pop.lista(); }
    if (e.key === 'Enter') { e.preventDefault(); Pop.elegir(Pop.ctx.hl); }
    return;
  }
  if (e.key !== 'Enter') return;
  const t = Drawer.t();
  if (el.dataset.f === 'titulo') { e.preventDefault(); el.blur(); return; }
  if (el.dataset.add === 'sub' && el.value.trim()) {
    e.preventDefault();
    t.subtareas = [...subs(t), { id: uid(), t: el.value.trim(), ok: false }]; tocar(t); guardar();
    $('#drawer [data-add="sub"]')?.focus(); return;
  }
  if (['hr-t', 'hr-d'].includes(el.id)) { e.preventDefault(); agregarHoras(t); return; }
  if (el.dataset.add === 'com' && !e.shiftKey) {
    e.preventDefault(); if (!el.value.trim()) return;
    t.comentarios = [...(t.comentarios || []), { id: uid(), por: YO, en: ahora(), t: el.value.trim() }]; tocar(t); guardar();
    $('#drawer [data-add="com"]')?.focus(); return;
  }
  if (el.dataset.st) { e.preventDefault(); $('#drawer [data-add="sub"]')?.focus(); return; }
  if (el.dataset.catadd && el.value.trim()) {
    e.preventDefault(); crearCat(el.dataset.catadd, el.value); guardar(); abrirCatalogo();
    $(`#modalbox [data-catadd="${el.dataset.catadd}"]`)?.focus(); return;
  }
  if (el.dataset.cat) { e.preventDefault(); el.blur(); }
}

// Arrastrar y soltar entre columnas (escritorio)
let arrastrando = null;
function enlazarDnD() {
  document.addEventListener('dragstart', e => {
    const c = e.target.closest?.('.card'); if (!c) return;
    arrastrando = c.dataset.id; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastrando);
  });
  document.addEventListener('dragend', e => { e.target.closest?.('.card')?.classList.remove('dragging'); document.querySelectorAll('.col.drag').forEach(c => c.classList.remove('drag')); arrastrando = null; });
  document.addEventListener('dragover', e => {
    const col = e.target.closest?.('[data-drop]'); if (!col || !arrastrando) return;
    e.preventDefault();
    document.querySelectorAll('.col.drag').forEach(c => c !== col && c.classList.remove('drag'));
    col.classList.add('drag');
  });
  document.addEventListener('drop', e => {
    const col = e.target.closest?.('[data-drop]'); if (!col || !arrastrando) return;
    e.preventDefault(); col.classList.remove('drag');
    const t = DB.tareas[arrastrando], dest = col.dataset.drop;
    if (!t) return;
    if (dest === t.con || (dest === 'espera' && esEspera(t.con))) return;
    abrirPasar(t.id, dest);
  });
}

// ---------- APP ----------
const App = {
  async init() {
    document.addEventListener('click', alClic);
    document.addEventListener('input', alEscribir);
    document.addEventListener('change', alCambiar);
    document.addEventListener('keydown', alTecla);
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.cerrar(); });
    $('#signout').addEventListener('click', () => Auth.signOut());
    // Menú de hamburguesa (esquina superior izquierda)
    const burger = $('#burger'), menu = $('#menu');
    const toggleMenu = abrir => { menu.classList.toggle('hidden', !abrir); burger.setAttribute('aria-expanded', abrir ? 'true' : 'false'); };
    burger.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu.classList.contains('hidden')); });
    document.addEventListener('click', e => { if (!e.target.closest('#menu')) toggleMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });
    $('#captura').addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#cap-t'), txt = inp.value.trim(); if (!txt) return;
      const para = $('#cap-para').value || YO;
      const t = nuevaTarea(txt, para, { cliente: S.cap.cliente, motivo: para === 'cliente' ? 'Respuesta' : '' });
      inp.value = ''; guardar();
      UI.toast(para === YO ? 'Tarea agregada' : esEspera(para) ? `Agregada a En espera (${nombreDe(para)})` : `Tarea agregada para ${nombreDe(para)}`, () => { t.del = true; tocar(t); guardar(); });
    });
    enlazarDnD();
    window.addEventListener('resize', () => Pop.cerrar());

    if (DEMO) {
      $('#auth-desc').innerHTML = '<em>Modo de prueba.</em> Los datos se guardan solo en este navegador.';
      $('#auth-btns').innerHTML = `<div class="demo-btns">${MIEMBROS.map(m => `<button class="gbtn" data-demo="${m.id}">Entrar como ${esc(m.nombre)}</button>`).join('')}</div>`;
      $('#auth-btns').addEventListener('click', e => { const b = e.target.closest('[data-demo]'); if (b) { ls.set('pend_demo_user', b.dataset.demo); this.onSignedIn(null); } });
      if (ls.get('pend_demo_user', null)) this.onSignedIn(null);
      return;
    }
    $('#signin').addEventListener('click', () => Auth.signIn());
    if (localStorage.getItem('ws_user') && localStorage.getItem('ws_token')) Auth.signIn();
  },

  quienSoy(u) {
    if (DEMO) return ls.get('pend_demo_user', MIEMBROS[0].id);
    const email = (u?.email || '').toLowerCase();
    const porCorreo = MIEMBROS.find(m => (m.correos || []).map(c => c.toLowerCase()).includes(email));
    if (porCorreo) return porCorreo.id;
    const recordado = ls.get('pend_quien_' + email, null);
    if (recordado && esMiembro(recordado)) return recordado;
    const nombre = (u?.name || '').toLowerCase();
    const porNombre = MIEMBROS.find(m => nombre.includes(m.nombre.toLowerCase().slice(0, 4)));
    return porNombre ? porNombre.id : null;
  },

  async onSignedIn(u) {
    let yo = this.quienSoy(u);
    if (!yo) {
      // Correo desconocido: preguntar una sola vez y recordarlo
      yo = await new Promise(res => {
        Modal.abrir(`<div class="mt">¿Quién eres?</div><div class="msub">No reconozco el correo ${esc(u?.email || '')}. Elige tu nombre; lo recordaré en este navegador.</div>
          <div class="opts">${MIEMBROS.map(m => `<button class="opt" data-quien="${m.id}">${esc(m.nombre)}</button>`).join('')}</div>`);
        $('#modalbox').addEventListener('click', e => { const b = e.target.closest('[data-quien]'); if (b) { ls.set('pend_quien_' + (u?.email || '').toLowerCase(), b.dataset.quien); Modal.cerrar(); res(b.dataset.quien); } });
      });
    }
    YO = yo;
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    UI.cabecera();
    UI.estado('Cargando…');
    try {
      await Remoto.init();
      DB = unir(vacio(), await Remoto.cargar() || vacio());
      Sync.ok = true;
    } catch (e) {
      console.error(e);
      UI.toast('No se pudo conectar con Google Drive. Revisa permisos de la carpeta.');
      UI.estado('Sin conexión', true);
    }
    const sinAreas = !Object.keys(DB.areas).length;
    sembrarAreas();
    if (sinAreas && Sync.ok) Sync.marcar(); else UI.estado('Guardado ✓');
    UI.render();
    setInterval(() => { if (!document.hidden) Sync.correr(); }, CONFIG.SYNC_SEGUNDOS * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.correr(); });
    setInterval(() => UI.cabecera(), 5 * 60 * 1000);
  },

  _avisando: false,
  avisarReconectar() {
    if (this._avisando) return; this._avisando = true;
    Modal.abrir(`<div class="mt">Sesión expirada</div><div class="msub">Tu sesión de Google caducó (pasa cada hora por seguridad). Reconéctate para seguir guardando; no se pierde nada de lo que hiciste.</div>
      <div class="ma"><button class="btn pri" id="reco">Reconectar con Google</button></div>`);
    $('#reco').onclick = () => { Modal.cerrar(); Auth.reconectar(); };
  },
  _resetAviso() { this._avisando = false; }
};

window.addEventListener('DOMContentLoaded', () => App.init());
