// =================================================================
//  CENECA WORKSPACE — Motor de la aplicación
//  Módulos: Auth · Drive · Data · Vistas · Bootstrap
// =================================================================

// ---------- AUTH ----------
const Auth = (() => {
  let _user=null,_token=null,_tokenClient=null;
  function init(){
    return new Promise(resolve=>{
      if(CONFIG.CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID_HERE'){resolve();return;}
      const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';
      s.onload=()=>{
        google.accounts.id.initialize({client_id:CONFIG.CLIENT_ID,callback:_cred,auto_select:true});
        _tokenClient=google.accounts.oauth2.initTokenClient({client_id:CONFIG.CLIENT_ID,scope:CONFIG.SCOPES,
          callback:r=>{if(r.access_token){_token=r.access_token;localStorage.setItem('ws_token',_token);App.onSignedIn(_user,_token);}}});
        const saved=localStorage.getItem('ws_token');if(saved)_token=saved;
        resolve();
      };document.head.appendChild(s);
    });
  }
  function _cred(resp){
    const p=_jwt(resp.credential);
    _user={name:p.name,email:p.email,picture:p.picture,id:p.sub};
    localStorage.setItem('ws_user',JSON.stringify(_user));
    _tokenClient.requestAccessToken({prompt:'consent'});
  }
  function _jwt(t){return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}
  function signIn(){
    const su=localStorage.getItem('ws_user');
    if(su&&_token){_user=JSON.parse(su);App.onSignedIn(_user,_token);return;}
    if(CONFIG.CLIENT_ID==='YOUR_GOOGLE_CLIENT_ID_HERE'){
      _user={name:'Santiago',email:'santiago@ceneca.com.mx',picture:null,id:'demo'};_token='demo';
      localStorage.setItem('ws_user',JSON.stringify(_user));localStorage.setItem('ws_token','demo');
      App.onSignedIn(_user,_token);return;
    }
    _tokenClient.requestAccessToken({prompt:'consent'});
  }
  function signOut(){localStorage.clear();location.reload();}
  function getUser(){return _user||JSON.parse(localStorage.getItem('ws_user')||'null');}
  function getToken(){return _token||localStorage.getItem('ws_token');}
  function isDemo(){return getToken()==='demo';}
  return{init,signIn,signOut,getUser,getToken,isDemo};
})();

// ---------- DRIVE ----------
const Drive = (() => {
  const B='https://www.googleapis.com/drive/v3',U='https://www.googleapis.com/upload/drive/v3';
  function _h(){return{Authorization:`Bearer ${Auth.getToken()}`,'Content-Type':'application/json'};}
  async function _r(url,o={}){if(Auth.isDemo())return null;const res=await fetch(url,{headers:_h(),...o});if(!res.ok)throw new Error('Drive '+res.status);return res.json();}
  async function ensureFolder(name,parent='root'){
    if(Auth.isDemo())return 'demo-'+name;
    const q=`name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`;
    const r=await _r(`${B}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    if(r.files.length)return r.files[0].id;
    const c=await _r(`${B}/files`,{method:'POST',body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})});
    return c.id;
  }
  async function listFiles(folderId){
    if(Auth.isDemo())return _demo(folderId);
    const q=`'${folderId}' in parents and trashed=false`;
    const r=await _r(`${B}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,version)&orderBy=folder,name`);
    return r.files;
  }
  async function uploadFile(file,folderId){
    if(Auth.isDemo())return{id:'demo-'+Date.now(),name:file.name,mimeType:file.type,size:file.size,modifiedTime:new Date().toISOString(),version:'1'};
    const meta={name:file.name,parents:[folderId]};const form=new FormData();
    form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));form.append('file',file);
    const res=await fetch(`${U}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,version`,{method:'POST',headers:{Authorization:`Bearer ${Auth.getToken()}`},body:form});
    return res.json();
  }
  function downloadUrl(id){return `${B}/files/${id}?alt=media`;}
  async function webViewLink(id){if(Auth.isDemo())return '#';const r=await _r(`${B}/files/${id}?fields=webViewLink`);return r.webViewLink;}
  async function getVersions(id){if(Auth.isDemo())return[{id:'1',modifiedTime:new Date().toISOString(),size:'10240'}];const r=await _r(`${B}/files/${id}/revisions?fields=revisions(id,modifiedTime,size)`);return r.revisions||[];}
  async function deleteFile(id){if(Auth.isDemo())return;await fetch(`${B}/files/${id}`,{method:'DELETE',headers:_h()});}
  async function saveData(fn,data,root){
    if(Auth.isDemo()){localStorage.setItem('ws_d_'+fn,JSON.stringify(data));return;}
    const q=`name='${fn}' and '${root}' in parents and trashed=false`;
    const ex=await _r(`${B}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if(ex.files.length){await fetch(`${U}/files/${ex.files[0].id}?uploadType=media`,{method:'PATCH',headers:_h(),body:JSON.stringify(data)});}
    else{const form=new FormData();form.append('metadata',new Blob([JSON.stringify({name:fn,parents:[root]})],{type:'application/json'}));form.append('file',new Blob([JSON.stringify(data)],{type:'application/json'}));await fetch(`${U}/files?uploadType=multipart`,{method:'POST',headers:{Authorization:`Bearer ${Auth.getToken()}`},body:form});}
  }
  async function loadData(fn,root){
    if(Auth.isDemo()){const r=localStorage.getItem('ws_d_'+fn);return r?JSON.parse(r):null;}
    const q=`name='${fn}' and '${root}' in parents and trashed=false`;
    const r=await _r(`${B}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if(!r.files.length)return null;
    const c=await fetch(`${B}/files/${r.files[0].id}?alt=media`,{headers:{Authorization:`Bearer ${Auth.getToken()}`}});
    return c.json();
  }
  function _demo(f){
    if(String(f).toLowerCase().includes('acme')||String(f).includes('demo-Acme'))
      return[{id:'f1',name:'Contrato_2024.pdf',mimeType:'application/pdf',size:'204800',modifiedTime:new Date(Date.now()-86400000).toISOString(),version:'3'},
             {id:'f2',name:'Propuesta_Q1.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:'51200',modifiedTime:new Date(Date.now()-172800000).toISOString(),version:'1'}];
    return[];
  }
  return{ensureFolder,listFiles,uploadFile,downloadUrl,webViewLink,getVersions,deleteFile,saveData,loadData};
})();

// ---------- DATOS ----------
const Data = (() => {
  let _root=null;
  let _db={tareas:[],clientes:[],notas:[],actividad:[]};
  function _d(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];}
  function _ago(m){return new Date(Date.now()-m*60000).toISOString();}
  const DEF={
    tareas:[
      {id:1,titulo:'Revisar propuesta del cliente',clienteId:1,fecha:_d(2),asignado:'ambos',done:false,prioridad:'alta',creadoEn:_ago(0)},
      {id:2,titulo:'Enviar factura a Acme Corp',clienteId:1,fecha:_d(1),asignado:'santiago',done:false,prioridad:'normal',creadoEn:_ago(0)},
      {id:3,titulo:'Preparar informe mensual',clienteId:2,fecha:_d(5),asignado:'elizabeth',done:false,prioridad:'normal',creadoEn:_ago(0)},
      {id:4,titulo:'Seguimiento renovación de contrato',clienteId:3,fecha:_d(-1),asignado:'ambos',done:false,prioridad:'alta',creadoEn:_ago(0)},
      {id:5,titulo:'Actualizar cronograma del proyecto',clienteId:2,fecha:_d(7),asignado:'santiago',done:true,prioridad:'baja',creadoEn:_ago(0)},
    ],
    clientes:[
      {id:1,nombre:'Acme Corp',sector:'Tecnología',estatus:'activo',contacto:'juan@acme.com',notas:'Cliente desde 2022. Prefiere comunicación por email.',color:'#1D9E75',emoji:'🏢',creadoEn:_ago(0)},
      {id:2,nombre:'Blue Sky Media',sector:'Marketing',estatus:'activo',contacto:'sara@bluesky.com',notas:'Cliente nuevo. Retención mensual.',color:'#378ADD',emoji:'📡',creadoEn:_ago(0)},
      {id:3,nombre:'Nexus Solutions',sector:'Consultoría',estatus:'inactivo',contacto:'miguel@nexus.com',notas:'Contrato por renovar en enero.',color:'#EF9F27',emoji:'⚡',creadoEn:_ago(0)},
    ],
    notas:[
      {id:1,titulo:'Notas de inicio de proyecto',cuerpo:'Se discutió el cronograma con el cliente. Hitos clave: Fase 1 a fin de mes, Fase 2 en 6 semanas. Presupuesto aprobado.',clienteId:1,creadoEn:_ago(60),actualizadoEn:_ago(30)},
      {id:2,titulo:'Segunda mente — registro de decisiones',cuerpo:'Usar esta nota para registrar decisiones importantes.\n\n— Google Drive para almacenamiento de archivos\n— Reuniones semanales los lunes con Elizabeth',clienteId:null,creadoEn:_ago(1440),actualizadoEn:_ago(1440)},
    ],
    actividad:[
      {id:1,tipo:'archivo',texto:'<strong>Elizabeth</strong> subió <strong>Contrato_2024.pdf</strong> a Acme Corp',tiempo:_ago(30),icono:'📄',color:'#e1f5ee'},
      {id:2,tipo:'tarea',texto:'<strong>Santiago</strong> completó <strong>Actualizar cronograma del proyecto</strong>',tiempo:_ago(120),icono:'✓',color:'#e1f5ee'},
      {id:3,tipo:'nota',texto:'<strong>Santiago</strong> creó la nota <strong>Notas de inicio de proyecto</strong>',tiempo:_ago(360),icono:'📝',color:'#e6f1fb'},
      {id:4,tipo:'cliente',texto:'<strong>Elizabeth</strong> agregó el cliente <strong>Blue Sky Media</strong>',tiempo:_ago(1440),icono:'👤',color:'#faeeda'},
    ]
  };
  async function init(root){
    _root=root;
    for(const k of Object.keys(_db)){
      const l=await Drive.loadData(`ws_${k}.json`,root).catch(()=>null);
      _db[k]=l||DEF[k];
    }
  }
  async function _save(k){if(_root)await Drive.saveData(`ws_${k}.json`,_db[k],_root).catch(()=>{});}
  function _nid(a){return a.length?Math.max(...a.map(x=>x.id))+1:1;}
  // tareas
  function getTareas(){return[..._db.tareas];}
  async function agregarTarea(t){const n={...t,id:_nid(_db.tareas),creadoEn:new Date().toISOString(),done:false};_db.tareas.unshift(n);await _save('tareas');agregarActividad('tarea',`<strong>Tarea agregada:</strong> ${n.titulo}`,'📋','#e6f1fb');return n;}
  async function actualizarTarea(id,c){const i=_db.tareas.findIndex(t=>t.id===id);if(i<0)return;_db.tareas[i]={..._db.tareas[i],...c};await _save('tareas');if(c.done!==undefined)agregarActividad('tarea',`Tarea <strong>${c.done?'completada':'reabierta'}:</strong> ${_db.tareas[i].titulo}`,c.done?'✓':'↩',c.done?'#e1f5ee':'#faeeda');return _db.tareas[i];}
  async function eliminarTarea(id){const t=_db.tareas.find(t=>t.id===id);_db.tareas=_db.tareas.filter(t=>t.id!==id);await _save('tareas');if(t)agregarActividad('tarea',`Tarea <strong>eliminada:</strong> ${t.titulo}`,'🗑','#fcebeb');}
  // clientes
  function getClientes(){return[..._db.clientes];}
  function getCliente(id){return _db.clientes.find(c=>c.id===id);}
  async function agregarCliente(c){const n={...c,id:_nid(_db.clientes),creadoEn:new Date().toISOString()};_db.clientes.push(n);await _save('clientes');agregarActividad('cliente',`<strong>Cliente agregado:</strong> ${n.nombre}`,'👤','#faeeda');return n;}
  async function actualizarCliente(id,c){const i=_db.clientes.findIndex(x=>x.id===id);if(i<0)return;_db.clientes[i]={..._db.clientes[i],...c};await _save('clientes');return _db.clientes[i];}
  async function eliminarCliente(id){const c=_db.clientes.find(c=>c.id===id);_db.clientes=_db.clientes.filter(c=>c.id!==id);await _save('clientes');if(c)agregarActividad('cliente',`Cliente <strong>eliminado:</strong> ${c.nombre}`,'🗑','#fcebeb');}
  // notas
  function getNotas(){return[..._db.notas];}
  function getNota(id){return _db.notas.find(n=>n.id===id);}
  async function guardarNota(nota){
    if(nota.id){const i=_db.notas.findIndex(n=>n.id===nota.id);if(i>=0)_db.notas[i]={..._db.notas[i],...nota,actualizadoEn:new Date().toISOString()};}
    else{const n={...nota,id:_nid(_db.notas),creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString()};_db.notas.unshift(n);agregarActividad('nota',`<strong>Nota creada:</strong> ${n.titulo||'Sin título'}`,'📝','#e6f1fb');}
    await _save('notas');
  }
  async function eliminarNota(id){const n=_db.notas.find(n=>n.id===id);_db.notas=_db.notas.filter(n=>n.id!==id);await _save('notas');if(n)agregarActividad('nota',`Nota <strong>eliminada:</strong> ${n.titulo}`,'🗑','#fcebeb');}
  // actividad
  function getActividad(){return[..._db.actividad].sort((a,b)=>new Date(b.tiempo)-new Date(a.tiempo));}
  async function agregarActividad(tipo,texto,icono,color){const a={id:_nid(_db.actividad),tipo,texto,icono,color,tiempo:new Date().toISOString()};_db.actividad.unshift(a);if(_db.actividad.length>100)_db.actividad=_db.actividad.slice(0,100);await _save('actividad');return a;}
  function buscar(q){const l=q.toLowerCase();return{tareas:_db.tareas.filter(t=>t.titulo.toLowerCase().includes(l)),clientes:_db.clientes.filter(c=>c.nombre.toLowerCase().includes(l)),notas:_db.notas.filter(n=>n.titulo.toLowerCase().includes(l)||n.cuerpo.toLowerCase().includes(l))};}
  return{init,getTareas,agregarTarea,actualizarTarea,eliminarTarea,getClientes,getCliente,agregarCliente,actualizarCliente,eliminarCliente,getNotas,getNota,guardarNota,eliminarNota,getActividad,agregarActividad,buscar};
})();

// ---------- UTILIDADES ----------
const U={
  fecha:s=>!s?'':new Date(s+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'}),
  fechaHora:iso=>!iso?'':new Date(iso).toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}),
  hace:iso=>{if(!iso)return'';const d=Date.now()-new Date(iso).getTime(),m=Math.floor(d/60000);if(m<1)return'ahora mismo';if(m<60)return`hace ${m}m`;const h=Math.floor(m/60);if(h<24)return`hace ${h}h`;return`hace ${Math.floor(h/24)}d`;},
  hoy:()=>new Date().toISOString().split('T')[0],
  esc:s=>(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'),
  iconoArchivo:m=>m==='application/vnd.google-apps.folder'?'📁':m==='application/pdf'?'📄':m&&m.startsWith('image/')?'🖼':m&&(m.includes('word')||m.includes('document'))?'📝':m&&(m.includes('sheet')||m.includes('excel'))?'📊':m&&m.includes('presentation')?'📋':m&&m.startsWith('video/')?'🎬':'📎',
  peso:b=>{if(!b)return'';b=parseInt(b);if(b<1024)return b+' B';if(b<1048576)return Math.round(b/1024)+' KB';return(b/1048576).toFixed(1)+' MB';}
};

// ---------- NAVEGACIÓN ----------
const NAV=[
  {id:'inicio',label:'Inicio',icon:'<rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/>'},
  {id:'tareas',label:'Tareas',icon:'<path d="M2 4h12M2 8h8M2 12h10" stroke-linecap="round"/>'},
  {id:'calendario',label:'Calendario',icon:'<rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/><path d="M1.5 6.5h13M5 1v3M11 1v3" stroke-linecap="round"/>'},
  {id:'archivos',label:'Archivos',icon:'<path d="M2 3.5A1.5 1.5 0 013.5 2h4.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 0010.62 3.5H12.5A1.5 1.5 0 0114 5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V3.5z"/>'},
  {id:'correo',label:'Correo',icon:'<path d="M2 4l6 4 6-4M2 4h12v8H2V4z" stroke-linejoin="round"/>'},
  {id:'clientes',label:'Clientes',icon:'<circle cx="6" cy="5" r="3"/><path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke-linecap="round"/>'},
  {id:'actividad',label:'Actividad',icon:'<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4l2.5 2" stroke-linecap="round"/>'},
  {id:'notas',label:'Notas',icon:'<path d="M3 2h10a1 1 0 011 1v9l-3 3H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M5 6h6M5 9h4" stroke-linecap="round"/>'},
];

const Vistas=(()=>{
  let _cur='inicio';
  function renderNav(){
    document.getElementById('nav').innerHTML=NAV.map(n=>`<button class="ni${n.id===_cur?' active':''}" onclick="Vistas.ir('${n.id}')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">${n.icon}</svg><span>${n.label}</span></button>`).join('');
  }
  function ir(name){
    _cur=name;renderNav();
    const m=document.getElementById('main');
    ({inicio:Inicio,tareas:Tareas,calendario:Calendario,archivos:Archivos,correo:Correo,clientes:Clientes,actividad:Actividad,notas:Notas})[name].render(m);
  }
  return{ir,renderNav,cur:()=>_cur};
})();

// ---------- VISTA: INICIO ----------
const Inicio={render(el){
  const tareas=Data.getTareas(),clientes=Data.getClientes(),hoy=U.hoy();
  const abiertas=tareas.filter(t=>!t.done),vencidas=abiertas.filter(t=>t.fecha&&t.fecha<hoy),hoyTareas=abiertas.filter(t=>t.fecha===hoy);
  const act=Data.getActividad().slice(0,5);
  const h=new Date().getHours(),saludo=h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches';
  el.innerHTML=`<div class="view active">
    <div class="ph"><div><div class="pt">${saludo}, ${(Auth.getUser()?.name||'').split(' ')[0]} 👋</div><div class="psub">${new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div>
    <div style="display:flex;gap:8px"><button class="btn" onclick="Vistas.ir('tareas')">Ver tareas</button><button class="btn btnp" onclick="Tareas.nueva()">+ Nueva tarea</button></div></div>
    ${Auth.isDemo()?`<div class="banner"><span><strong>Modo demo</strong> — agrega tu Google Client ID en config.js para activar Drive, Calendar y Gmail reales.</span><a href="https://console.cloud.google.com" target="_blank" class="btn btns">Configurar →</a></div>`:''}
    <div class="stats">
      <div class="sc"><div class="sn">${abiertas.length}</div><div class="sl">Tareas abiertas</div></div>
      <div class="sc"><div class="sn" style="color:${vencidas.length?'var(--red)':'inherit'}">${vencidas.length}</div><div class="sl">Vencidas</div></div>
      <div class="sc"><div class="sn" style="color:var(--accent)">${hoyTareas.length}</div><div class="sl">Para hoy</div></div>
      <div class="sc"><div class="sn">${clientes.filter(c=>c.estatus==='activo').length}</div><div class="sl">Clientes activos</div></div>
    </div>
    <div class="two">
      <div class="card"><div class="slabel">Próximas tareas</div>${this._proximas(abiertas,hoy)}<button class="btn btns" style="margin-top:14px" onclick="Vistas.ir('tareas')">Todas las tareas →</button></div>
      <div class="card"><div class="slabel">Actividad reciente</div>${act.length?act.map(a=>`<div class="ai" style="padding:8px 0"><div class="adot" style="background:${a.color};width:26px;height:26px;font-size:12px">${a.icono}</div><div><div class="at" style="font-size:13px">${a.texto}</div><div class="atm">${U.hace(a.tiempo)}</div></div></div>`).join(''):'<div class="esub">Sin actividad aún</div>'}<button class="btn btns" style="margin-top:14px" onclick="Vistas.ir('actividad')">Ver todo →</button></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="slabel">Clientes</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:10px">${clientes.map(c=>`<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--r);cursor:pointer" onclick="Vistas.ir('clientes')"><div style="width:34px;height:34px;border-radius:8px;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:16px">${c.emoji}</div><div><div style="font-size:13px;font-weight:500">${c.nombre}</div><div class="sbadge ${c.estatus==='activo'?'sact':'sinact'}" style="font-size:10px;padding:1px 6px;margin-top:2px">${c.estatus==='activo'?'Activo':'Inactivo'}</div></div></div>`).join('')}<div style="display:flex;align-items:center;justify-content:center;padding:10px;border:1px dashed var(--border2);border-radius:var(--r);cursor:pointer;color:var(--text3);font-size:13px" onclick="Clientes.nuevo()">+ Agregar cliente</div></div></div>
  </div>`;
},_proximas(abiertas,hoy){
  const s=abiertas.filter(t=>t.fecha).sort((a,b)=>a.fecha.localeCompare(b.fecha)).slice(0,5);
  if(!s.length)return'<div class="empty" style="padding:20px"><div class="etitle">¡Todo al día!</div></div>';
  return s.map(t=>{const ov=t.fecha<hoy,cl=Data.getCliente(t.clienteId);return`<div class="ti"><div class="ck${t.done?' done':''}" onclick="Tareas.toggle(${t.id})"></div><div class="tbody"><div class="tn">${t.titulo}</div><div class="tmr">${cl?`<span class="tag tgr">${cl.emoji} ${cl.nombre}</span>`:''}<span class="dd${ov?' ov':''}">${ov?'Vencida · ':''}${U.fecha(t.fecha)}</span></div></div></div>`;}).join('');
}};

// ---------- VISTA: TAREAS ----------
const Tareas={_filtro:'todas',render(el){
  const tareas=Data.getTareas();
  el.innerHTML=`<div class="view active">
    <div class="ph"><div><div class="pt">Tareas</div><div class="psub">${tareas.filter(t=>!t.done).length} abiertas · ${tareas.filter(t=>t.done).length} completadas</div></div><button class="btn btnp" onclick="Tareas.nueva()">+ Nueva tarea</button></div>
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">${['todas','mías','elizabeth','vencidas','hoy'].map(f=>`<button class="btn btns${this._filtro===f?' btnp':''}" onclick="Tareas.setFiltro('${f}')">${({todas:'Todas',mías:'Mías',elizabeth:'Elizabeth',vencidas:'Vencidas',hoy:'Para hoy'})[f]}</button>`).join('')}</div>
    <div class="card" style="padding:0;overflow:hidden"><div style="padding:14px 20px;border-bottom:1px solid var(--border)"><span class="slabel" style="margin:0">${this._filtradas(tareas).length} tareas</span></div><div style="padding:0 20px" id="tlist"></div></div>
  </div>`;this._lista();
},_filtradas(tareas){const hoy=U.hoy();return tareas.filter(t=>{if(this._filtro==='mías')return!t.done&&(t.asignado==='ambos'||t.asignado==='santiago');if(this._filtro==='elizabeth')return!t.done&&(t.asignado==='ambos'||t.asignado==='elizabeth');if(this._filtro==='vencidas')return!t.done&&t.fecha&&t.fecha<hoy;if(this._filtro==='hoy')return!t.done&&t.fecha===hoy;return true;});},
_lista(){const el=document.getElementById('tlist');if(!el)return;const hoy=U.hoy();const f=this._filtradas(Data.getTareas()).sort((a,b)=>{if(a.done!==b.done)return a.done?1:-1;if(!a.fecha&&!b.fecha)return 0;if(!a.fecha)return 1;if(!b.fecha)return -1;return a.fecha.localeCompare(b.fecha);});
if(!f.length){el.innerHTML='<div class="empty"><div class="eic">✓</div><div class="etitle">Sin tareas aquí</div></div>';return;}
el.innerHTML=f.map(t=>{const ov=!t.done&&t.fecha&&t.fecha<hoy,cl=Data.getCliente(t.clienteId);const ac=t.asignado==='elizabeth'?'tb':t.asignado==='ambos'?'tgr':'tg';const al={santiago:'Santiago',elizabeth:'Elizabeth',ambos:'Ambos'}[t.asignado]||t.asignado;return`<div class="ti"><div class="ck${t.done?' done':''}" onclick="Tareas.toggle(${t.id})"></div><div class="tbody"><div class="tn${t.done?' done':''}">${t.titulo}</div><div class="tmr"><span class="tag ${ac}">${al}</span>${cl?`<span class="tag tgr">${cl.emoji} ${cl.nombre}</span>`:''}${t.prioridad==='alta'&&!t.done?'<span class="tag tr">Alta</span>':''}${t.fecha?`<span class="dd${ov?' ov':''}">${ov?'Vencida · ':''}${U.fecha(t.fecha)}</span>`:''}</div></div><div class="tact"><button class="ibtn" onclick="Tareas.editar(${t.id})">✎</button><button class="ibtn" onclick="Tareas.eliminar(${t.id})">×</button></div></div>`;}).join('');},
async toggle(id){const t=Data.getTareas().find(t=>t.id===id);if(t)await Data.actualizarTarea(id,{done:!t.done});Vistas.ir(Vistas.cur());},
async eliminar(id){if(!confirm('¿Eliminar esta tarea?'))return;await Data.eliminarTarea(id);Vistas.ir(Vistas.cur());App.toast('Tarea eliminada');},
setFiltro(f){this._filtro=f;this.render(document.getElementById('main'));},
nueva(){const cs=Data.getClientes();App.modal('Nueva tarea',`<div class="fg"><label class="fl">Título</label><input class="fi" id="mt" placeholder="Descripción de la tarea..." /></div><div class="fg"><label class="fl">Cliente</label><select class="fi" id="mc"><option value="">Sin cliente</option>${cs.map(c=>`<option value="${c.id}">${c.emoji} ${c.nombre}</option>`).join('')}</select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="fg"><label class="fl">Fecha límite</label><input type="date" class="fi" id="mf" /></div><div class="fg"><label class="fl">Asignar a</label><select class="fi" id="ma"><option value="ambos">Ambos</option><option value="santiago">Santiago</option><option value="elizabeth">Elizabeth</option></select></div></div><div class="fg"><label class="fl">Prioridad</label><select class="fi" id="mp"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baja">Baja</option></select></div>`,async()=>{const t=document.getElementById('mt').value.trim();if(!t){App.toast('Escribe un título');return false;}await Data.agregarTarea({titulo:t,clienteId:parseInt(document.getElementById('mc').value)||null,fecha:document.getElementById('mf').value||null,asignado:document.getElementById('ma').value,prioridad:document.getElementById('mp').value});Vistas.ir(Vistas.cur());App.toast('Tarea agregada');});},
editar(id){const t=Data.getTareas().find(t=>t.id===id);if(!t)return;const cs=Data.getClientes();App.modal('Editar tarea',`<div class="fg"><label class="fl">Título</label><input class="fi" id="mt" value="${U.esc(t.titulo)}" /></div><div class="fg"><label class="fl">Cliente</label><select class="fi" id="mc"><option value="">Sin cliente</option>${cs.map(c=>`<option value="${c.id}" ${t.clienteId===c.id?'selected':''}>${c.emoji} ${c.nombre}</option>`).join('')}</select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="fg"><label class="fl">Fecha límite</label><input type="date" class="fi" id="mf" value="${t.fecha||''}" /></div><div class="fg"><label class="fl">Asignar a</label><select class="fi" id="ma"><option value="ambos" ${t.asignado==='ambos'?'selected':''}>Ambos</option><option value="santiago" ${t.asignado==='santiago'?'selected':''}>Santiago</option><option value="elizabeth" ${t.asignado==='elizabeth'?'selected':''}>Elizabeth</option></select></div></div><div class="fg"><label class="fl">Prioridad</label><select class="fi" id="mp"><option value="normal" ${t.prioridad==='normal'?'selected':''}>Normal</option><option value="alta" ${t.prioridad==='alta'?'selected':''}>Alta</option><option value="baja" ${t.prioridad==='baja'?'selected':''}>Baja</option></select></div>`,async()=>{await Data.actualizarTarea(id,{titulo:document.getElementById('mt').value.trim(),clienteId:parseInt(document.getElementById('mc').value)||null,fecha:document.getElementById('mf').value||null,asignado:document.getElementById('ma').value,prioridad:document.getElementById('mp').value});Vistas.ir(Vistas.cur());App.toast('Tarea actualizada');});}};

// ---------- VISTA: CALENDARIO ----------
const Calendario={_a:new Date().getFullYear(),_m:new Date().getMonth(),render(el){
  el.innerHTML=`<div class="view active"><div class="ph"><div class="pt">Calendario</div><button class="btn btnp" onclick="Tareas.nueva()">+ Nueva tarea</button></div><div class="card"><div class="calnav"><button class="cnb" onclick="Calendario.prev()">‹</button><div class="cmt" id="cmt"></div><button class="cnb" onclick="Calendario.next()">›</button></div><div class="calh">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d=>`<div>${d}</div>`).join('')}</div><div class="calg" id="calg"></div></div></div>`;this._grid();
},_grid(){const M=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];document.getElementById('cmt').textContent=`${M[this._m]} ${this._a}`;const tareas=Data.getTareas().filter(t=>!t.done&&t.fecha);const por={};tareas.forEach(t=>{(por[t.fecha]=por[t.fecha]||[]).push(t);});const hoy=U.hoy();const first=new Date(this._a,this._m,1).getDay(),days=new Date(this._a,this._m+1,0).getDate(),prev=new Date(this._a,this._m,0).getDate();let h='';for(let i=0;i<first;i++)h+=`<div class="cday other"><div class="dnum">${prev-first+i+1}</div></div>`;for(let d=1;d<=days;d++){const ds=`${this._a}-${String(this._m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const dt=por[ds]||[];h+=`<div class="cday${ds===hoy?' today':''}"><div class="dnum">${d}</div>${dt.slice(0,3).map(t=>{const cl=Data.getCliente(t.clienteId);return`<div class="cev ${t.asignado==='elizabeth'?'cevb':'cevg'}" title="${U.esc(t.titulo)}">${cl?cl.emoji+' ':''}${t.titulo}</div>`;}).join('')}${dt.length>3?`<div class="cev cevg">+${dt.length-3} más</div>`:''}</div>`;}const rem=42-first-days;for(let i=1;i<=rem;i++)h+=`<div class="cday other"><div class="dnum">${i}</div></div>`;document.getElementById('calg').innerHTML=h;},
prev(){this._m--;if(this._m<0){this._m=11;this._a--;}this._grid();},next(){this._m++;if(this._m>11){this._m=0;this._a++;}this._grid();}};

// ---------- VISTA: ARCHIVOS ----------
const Archivos={_cur:null,_crumb:[],render(el){
  el.innerHTML=`<div class="view active"><div class="ph"><div><div class="pt">Archivos</div><div class="psub">Almacenados en tu Google Drive</div></div><div style="display:flex;gap:8px"><button class="btn" onclick="Archivos.nuevaCarpeta()">+ Nueva carpeta</button><button class="btn btnp" onclick="document.getElementById('fup').click()">↑ Subir archivo</button></div></div>
  <input type="file" id="fup" style="display:none" multiple onchange="Archivos.subir(this.files)" />
  <div class="ft"><input class="si" placeholder="Buscar archivos..." /></div>
  <div class="bc" id="bc"></div>
  <div class="uz" id="uz" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="event.preventDefault();this.classList.remove('drag');Archivos.subir(event.dataTransfer.files)" onclick="document.getElementById('fup').click()"><div style="font-size:28px;margin-bottom:8px">📂</div><div style="font-size:14px;font-weight:500">Arrastra archivos aquí o haz clic para subir</div><div style="font-size:12px;color:var(--text3);margin-top:4px">PDFs, documentos, imágenes — cualquier tipo de archivo</div></div>
  <div id="fc"></div></div>`;this._loadRoot();
},async _loadRoot(){const r=App.rootFolderId();if(!r){this._vacio('Conecta Google Drive para ver archivos');return;}this._cur=r;this._crumb=[{id:r,name:'Archivos'}];this._bc();await this._cargar(r);},
async _cargar(id){document.getElementById('fc').innerHTML='<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';let files=[];try{files=await Drive.listFiles(id);}catch(e){this._vacio('No se pudieron cargar los archivos');return;}this._archivos(files);},
_archivos(files){const c=document.getElementById('fc');if(!files.length){c.innerHTML='<div class="empty"><div class="eic">📁</div><div class="etitle">Carpeta vacía</div><div class="esub">Sube un archivo o crea una subcarpeta</div></div>';return;}const carpetas=files.filter(f=>f.mimeType==='application/vnd.google-apps.folder'),docs=files.filter(f=>f.mimeType!=='application/vnd.google-apps.folder');c.innerHTML=`${carpetas.length?`<div class="slabel">Carpetas</div><div style="margin-bottom:16px">${carpetas.map(f=>this._fila(f,true)).join('')}</div>`:''}${docs.length?`<div class="slabel">Archivos (${docs.length})</div><div>${docs.map(f=>this._fila(f,false)).join('')}</div>`:''}`;},
_fila(f,isC){const click=isC?`Archivos.abrirCarpeta('${f.id}','${U.esc(f.name)}')`:`Archivos.previsualizarArchivo('${f.id}','${U.esc(f.name)}','${f.mimeType}')`;return`<div class="frow" onclick="${click}"><div class="fic">${U.iconoArchivo(f.mimeType)}</div><div class="fnm">${f.name}</div><div class="fmt">${isC?'':U.peso(f.size)}</div><div class="fmt" style="margin-left:12px">${isC?'':U.fecha(f.modifiedTime)}</div>${!isC?`<div class="fract">${f.version&&parseInt(f.version)>1?`<button class="ibtn" onclick="event.stopPropagation();Archivos.versiones('${f.id}','${U.esc(f.name)}')" title="Historial">v${f.version}</button>`:''}<button class="ibtn" onclick="event.stopPropagation();Archivos.eliminar('${f.id}','${U.esc(f.name)}')">×</button></div>`:''}</div>`;},
async abrirCarpeta(id,name){this._cur=id;this._crumb.push({id,name});this._bc();await this._cargar(id);},
async previsualizarArchivo(id,name,mime){const pdf=mime==='application/pdf',img=mime&&mime.startsWith('image/');if(pdf||img){if(Auth.isDemo()){App.modal(name,`<div class="empty"><div class="eic">${pdf?'📄':'🖼'}</div><div class="esub">Vista previa disponible al conectar Drive</div></div>`,null,true);return;}const url=Drive.downloadUrl(id);App.modal(name,pdf?`<iframe src="${url}" style="width:100%;height:500px;border:none;border-radius:6px"></iframe>`:`<img src="${url}" style="max-width:100%;border-radius:6px" />`,null,true);}else{const url=await Drive.webViewLink(id);if(url!=='#')window.open(url,'_blank');else App.toast('Vista previa disponible al conectar Drive');}},
async subir(files){if(!files.length)return;for(const f of files){App.toast(`Subiendo ${f.name}...`);try{await Drive.uploadFile(f,this._cur);await Data.agregarActividad('archivo',`<strong>Archivo subido:</strong> ${f.name}`,'📄','#e1f5ee');App.toast(`${f.name} subido`);}catch(e){App.toast(`Error al subir: ${f.name}`);}}await this._cargar(this._cur);},
nuevaCarpeta(){App.modal('Nueva carpeta',`<div class="fg"><label class="fl">Nombre de la carpeta</label><input class="fi" id="fn" placeholder="ej. Acme Corp" /></div>`,async()=>{const n=document.getElementById('fn').value.trim();if(!n){App.toast('Escribe un nombre');return false;}await Drive.ensureFolder(n,this._cur);await this._cargar(this._cur);App.toast('Carpeta creada');});},
async eliminar(id,name){if(!confirm(`¿Eliminar "${name}"?`))return;await Drive.deleteFile(id);await this._cargar(this._cur);App.toast('Archivo eliminado');},
async versiones(id,name){const v=await Drive.getVersions(id);App.modal(`Historial de versiones — ${name}`,`<div style="font-size:13px;color:var(--text2);margin-bottom:14px">${v.length} versión${v.length!==1?'es':''} guardada${v.length!==1?'s':''} en Drive</div>${v.map((x,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)"><span style="font-size:11px;font-family:'DM Mono',monospace;background:var(--surface2);padding:2px 7px;border-radius:4px">v${v.length-i}</span><span style="flex:1;font-size:13px">${U.fechaHora(x.modifiedTime)}</span><span style="font-size:12px;color:var(--text3)">${U.peso(x.size)}</span></div>`).join('')}`,null,true);},
_bc(){const el=document.getElementById('bc');if(!el)return;el.innerHTML=this._crumb.map((b,i)=>i===this._crumb.length-1?`<span>${b.name}</span>`:`<a onclick="Archivos.irA(${i})">${b.name}</a><span style="color:var(--text3)">/</span>`).join('');},
async irA(i){this._crumb=this._crumb.slice(0,i+1);this._cur=this._crumb[i].id;this._bc();await this._cargar(this._cur);},
_vacio(m){const el=document.getElementById('fc');if(el)el.innerHTML=`<div class="empty"><div class="eic">📁</div><div class="esub">${m}</div></div>`;}};

// ---------- VISTA: CORREO ----------
const Correo={render(el){
  const demo=[
    {de:'Juan García',email:'juan@acme.com',asunto:'Re: Revisión de contrato',preview:'Gracias por enviar los documentos. Tenía algunas preguntas sobre la cláusula 4.2...',hora:'10:32',noLeido:true,clienteId:1},
    {de:'Sara López',email:'sara@bluesky.com',asunto:'Informe mensual listo para revisión',preview:'Hola equipo, el informe de octubre está adjunto. Hágame saber sus comentarios...',hora:'9:15',noLeido:true,clienteId:2},
    {de:'Miguel Torres',email:'miguel@nexus.com',asunto:'Discusión sobre renovación de contrato',preview:'Quería dar seguimiento a nuestra conversación sobre la renovación para el próximo año...',hora:'Ayer',noLeido:false,clienteId:3},
  ];
  el.innerHTML=`<div class="view active"><div class="ph"><div><div class="pt">Correo</div><div class="psub">Emails de tus clientes, en un solo lugar</div></div></div>
  ${Auth.isDemo()?`<div class="banner"><span><strong>Vista previa demo</strong> — conecta Gmail (activa Gmail API en Google Cloud) para ver correos reales aquí.</span></div>`:''}
  <div class="card" style="padding:0;overflow:hidden">${demo.map(e=>{const cl=Data.getCliente(e.clienteId);return`<div class="email-row${e.noLeido?' unread':''}" onclick="Correo.abrirEmail('${U.esc(e.de)}','${U.esc(e.asunto)}')"><div class="eav">${e.de.split(' ').map(n=>n[0]).join('')}</div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between"><span class="efrom">${e.de}</span><span class="etime">${e.hora}</span></div><div class="esubj">${e.asunto}</div><div class="eprev">${e.preview}</div><div style="margin-top:4px">${cl?`<span class="tag tgr">${cl.emoji} ${cl.nombre}</span>`:''}</div></div></div>`;}).join('')}</div></div>`;
},abrirEmail(de,asunto){App.modal(asunto,`<div style="font-size:13px;color:var(--text2);margin-bottom:16px">De: <strong>${de}</strong></div><div style="font-size:13.5px;line-height:1.7;color:var(--text);background:var(--surface2);padding:14px;border-radius:var(--rs);margin-bottom:16px">Vista previa del contenido del email. Una vez conectado Gmail, el hilo completo aparece aquí — y puedes responder directamente o convertirlo en tarea.</div><div style="display:flex;gap:8px"><button class="btn btnp" onclick="App.closeModal();App.toast('Responder — disponible al conectar Gmail')">Responder</button><button class="btn" onclick="App.closeModal();Correo.convertirTarea('${U.esc(asunto)}')">→ Convertir en tarea</button></div>`,null,true);},
convertirTarea(asunto){const cs=Data.getClientes();App.modal('Convertir email en tarea',`<div class="fg"><label class="fl">Título de la tarea</label><input class="fi" id="mt" value="Seguimiento: ${U.esc(asunto)}" /></div><div class="fg"><label class="fl">Cliente</label><select class="fi" id="mc"><option value="">Sin cliente</option>${cs.map(c=>`<option value="${c.id}">${c.emoji} ${c.nombre}</option>`).join('')}</select></div><div class="fg"><label class="fl">Fecha límite</label><input type="date" class="fi" id="mf" /></div>`,async()=>{const t=document.getElementById('mt').value.trim();if(!t)return false;await Data.agregarTarea({titulo:t,clienteId:parseInt(document.getElementById('mc').value)||null,fecha:document.getElementById('mf').value||null,asignado:'ambos',prioridad:'normal'});App.toast('Tarea creada desde email');});}};

// ---------- VISTA: CLIENTES ----------
const Clientes={COLORES:['#1D9E75','#378ADD','#EF9F27','#E24B4A','#9B59B6','#E67E22'],EMOJIS:['🏢','📡','⚡','🎯','💡','🚀','🌟','🏆','💼','🔧'],
render(el){const cs=Data.getClientes(),tareas=Data.getTareas(),notas=Data.getNotas();
el.innerHTML=`<div class="view active"><div class="ph"><div><div class="pt">Clientes</div><div class="psub">${cs.filter(c=>c.estatus==='activo').length} activos · ${cs.filter(c=>c.estatus==='inactivo').length} inactivos</div></div><button class="btn btnp" onclick="Clientes.nuevo()">+ Agregar cliente</button></div>
${cs.length?`<div class="cgrid">${cs.map(c=>{const ct=tareas.filter(t=>t.clienteId===c.id&&!t.done).length,cn=notas.filter(n=>n.clienteId===c.id).length;return`<div class="ccard" onclick="Clientes.detalle(${c.id})"><div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px"><div class="cav" style="background:${c.color}22">${c.emoji}</div><span class="sbadge ${c.estatus==='activo'?'sact':'sinact'}">${c.estatus==='activo'?'Activo':'Inactivo'}</span></div><div class="cnm">${c.nombre}</div><div class="csb">${c.sector||'Sin sector'}</div><div class="cst"><div class="csi"><strong>${ct}</strong> tareas abiertas</div><div class="csi"><strong>${cn}</strong> notas</div></div><div style="display:flex;gap:6px;margin-top:12px"><button class="btn btns" onclick="event.stopPropagation();Vistas.ir('archivos')" style="flex:1">Archivos</button><button class="btn btns" onclick="event.stopPropagation();Clientes.editar(${c.id})" style="flex:1">Editar</button></div></div>`;}).join('')}<div class="ccard" style="display:flex;align-items:center;justify-content:center;border:1px dashed var(--border2);color:var(--text3);font-size:13px;min-height:180px" onclick="Clientes.nuevo()">+ Agregar cliente</div></div>`:'<div class="empty"><div class="eic">👤</div><div class="etitle">Sin clientes aún</div></div>'}</div>`;
},detalle(id){const c=Data.getCliente(id);if(!c)return;const tareas=Data.getTareas().filter(t=>t.clienteId===id),notas=Data.getNotas().filter(n=>n.clienteId===id),abiertas=tareas.filter(t=>!t.done),hoy=U.hoy();App.modal(c.nombre,`<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px"><div style="width:48px;height:48px;border-radius:12px;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:22px">${c.emoji}</div><div><div style="font-size:16px;font-weight:500">${c.nombre}</div><div style="font-size:13px;color:var(--text2)">${c.sector||''}</div><span class="sbadge ${c.estatus==='activo'?'sact':'sinact'}" style="margin-top:4px">${c.estatus==='activo'?'Activo':'Inactivo'}</span></div></div>${c.contacto?`<div style="font-size:13px;color:var(--text2);margin-bottom:14px">📧 ${c.contacto}</div>`:''}${c.notas?`<div style="font-size:13px;color:var(--text2);background:var(--surface2);padding:10px 12px;border-radius:var(--rs);margin-bottom:16px">${c.notas}</div>`:''}<div class="slabel">Tareas abiertas (${abiertas.length})</div>${abiertas.length?abiertas.slice(0,4).map(t=>`<div class="ti" style="padding:8px 0"><div class="ck" onclick="Tareas.toggle(${t.id})"></div><div class="tbody"><div class="tn">${t.titulo}</div>${t.fecha?`<div class="dd${t.fecha<hoy?' ov':''}" style="margin-top:2px">${t.fecha<hoy?'Vencida · ':''}${U.fecha(t.fecha)}</div>`:''}</div></div>`).join(''):'<div class="esub" style="padding:8px 0">Sin tareas abiertas</div>'}<div class="divider"></div><div class="slabel">Notas (${notas.length})</div>${notas.length?notas.slice(0,3).map(n=>`<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:13px;font-weight:500">${n.titulo}</div><div style="font-size:12px;color:var(--text3);margin-top:2px">${n.cuerpo.slice(0,80)}${n.cuerpo.length>80?'...':''}</div></div>`).join(''):'<div class="esub">Sin notas aún</div>'}`,null,true);},
nuevo(){App.modal('Agregar cliente',`<div class="fg"><label class="fl">Nombre de la empresa</label><input class="fi" id="cn" placeholder="Acme Corp" /></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="fg"><label class="fl">Sector</label><input class="fi" id="cs" placeholder="Tecnología" /></div><div class="fg"><label class="fl">Estatus</label><select class="fi" id="ce"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div></div><div class="fg"><label class="fl">Email de contacto</label><input class="fi" id="cc" placeholder="contacto@empresa.com" /></div><div class="fg"><label class="fl">Notas</label><textarea class="fi" id="cno" placeholder="Notas sobre este cliente..."></textarea></div><div class="fg"><label class="fl">Ícono</label><div style="display:flex;gap:6px;flex-wrap:wrap">${this.EMOJIS.map(e=>`<button type="button" style="font-size:20px;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer" onclick="document.getElementById('ci').value='${e}';this.parentElement.querySelectorAll('button').forEach(b=>b.style.borderColor='var(--border)');this.style.borderColor='var(--accent)'">${e}</button>`).join('')}</div><input type="hidden" id="ci" value="🏢" /></div>`,async()=>{const n=document.getElementById('cn').value.trim();if(!n){App.toast('Escribe un nombre');return false;}const idx=Data.getClientes().length%this.COLORES.length;await Data.agregarCliente({nombre:n,sector:document.getElementById('cs').value.trim(),estatus:document.getElementById('ce').value,contacto:document.getElementById('cc').value.trim(),notas:document.getElementById('cno').value.trim(),color:this.COLORES[idx],emoji:document.getElementById('ci').value});Vistas.ir(Vistas.cur());App.toast('Cliente agregado');});},
editar(id){const c=Data.getCliente(id);if(!c)return;App.modal('Editar cliente',`<div class="fg"><label class="fl">Nombre</label><input class="fi" id="cn" value="${U.esc(c.nombre)}" /></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="fg"><label class="fl">Sector</label><input class="fi" id="cs" value="${U.esc(c.sector||'')}" /></div><div class="fg"><label class="fl">Estatus</label><select class="fi" id="ce"><option value="activo" ${c.estatus==='activo'?'selected':''}>Activo</option><option value="inactivo" ${c.estatus==='inactivo'?'selected':''}>Inactivo</option></select></div></div><div class="fg"><label class="fl">Email de contacto</label><input class="fi" id="cc" value="${U.esc(c.contacto||'')}" /></div><div class="fg"><label class="fl">Notas</label><textarea class="fi" id="cno">${U.esc(c.notas||'')}</textarea></div><button class="btn btnd btns" onclick="Clientes.eliminar(${id})" style="margin-top:8px">Eliminar cliente</button>`,async()=>{await Data.actualizarCliente(id,{nombre:document.getElementById('cn').value.trim(),sector:document.getElementById('cs').value.trim(),estatus:document.getElementById('ce').value,contacto:document.getElementById('cc').value.trim(),notas:document.getElementById('cno').value.trim()});Vistas.ir(Vistas.cur());App.toast('Cliente actualizado');});},
async eliminar(id){App.closeModal();if(!confirm('¿Eliminar este cliente?'))return;await Data.eliminarCliente(id);Vistas.ir(Vistas.cur());App.toast('Cliente eliminado');}};

// ---------- VISTA: ACTIVIDAD ----------
const Actividad={render(el){const a=Data.getActividad();el.innerHTML=`<div class="view active"><div class="ph"><div><div class="pt">Actividad</div><div class="psub">Todo lo que ha pasado en tu workspace</div></div></div><div class="card">${a.length?a.map(x=>`<div class="ai"><div class="adot" style="background:${x.color}">${x.icono}</div><div><div class="at">${x.texto}</div><div class="atm">${U.hace(x.tiempo)} · ${U.fechaHora(x.tiempo)}</div></div></div>`).join(''):'<div class="empty"><div class="eic">🕐</div><div class="etitle">Sin actividad aún</div><div class="esub">Las acciones que tú y Elizabeth realicen aparecerán aquí</div></div>'}</div></div>`;}};

// ---------- VISTA: NOTAS ----------
const Notas={_activa:null,_timer:null,render(el){const notas=Data.getNotas();el.innerHTML=`<div class="view active"><div class="ph"><div class="pt">Notas</div><button class="btn btnp" onclick="Notas.nueva()">+ Nueva nota</button></div><div class="nlay"><div class="nsb" id="nsb"></div><div class="ned" id="ned"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3)">Selecciona una nota o crea una nueva</div></div></div></div>`;this._lista(notas);if(!this._activa&&notas.length)this._activa=notas[0].id;if(this._activa){const n=Data.getNota(this._activa);if(n)this._editor(n);}},
_lista(notas){const el=document.getElementById('nsb');if(!el)return;if(!notas.length){el.innerHTML='<div class="empty" style="padding:20px"><div class="esub">Sin notas aún</div></div>';return;}el.innerHTML=`<div style="padding:10px 14px;border-bottom:1px solid var(--border)"><input class="si" style="width:100%;font-size:12px;padding:6px 10px" placeholder="Buscar notas..." oninput="Notas.buscar(this.value)" /></div>`+notas.map(n=>`<div class="nit${n.id===this._activa?' active':''}" onclick="Notas.abrir(${n.id})"><div class="nitt">${n.titulo||'Sin título'}</div><div class="nip">${n.cuerpo||'Nota vacía'}</div><div class="nid">${U.hace(n.actualizadoEn)}</div></div>`).join('');},
abrir(id){this._activa=id;const n=Data.getNota(id);if(n)this._editor(n);this._lista(Data.getNotas());},
_editor(n){const el=document.getElementById('ned');if(!el)return;const cs=Data.getClientes();el.innerHTML=`<div class="neh"><input class="nti" id="nt" value="${U.esc(n.titulo||'')}" placeholder="Título de la nota..." oninput="Notas.guardar()" /><select id="nc" onchange="Notas.guardar()" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:var(--rs);background:var(--surface);color:var(--text2)"><option value="">Sin cliente</option>${cs.map(c=>`<option value="${c.id}" ${n.clienteId===c.id?'selected':''}>${c.emoji} ${c.nombre}</option>`).join('')}</select><button class="ibtn" style="color:var(--red)" onclick="Notas.eliminar(${n.id})">🗑</button></div><textarea class="nbi" id="nb" placeholder="Escribe aquí..." oninput="Notas.guardar()">${U.esc(n.cuerpo||'')}</textarea><div style="padding:8px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">Última actualización ${U.fechaHora(n.actualizadoEn)} · Guardado automáticamente</div>`;},
guardar(){clearTimeout(this._timer);this._timer=setTimeout(async()=>{if(!this._activa)return;await Data.guardarNota({id:this._activa,titulo:document.getElementById('nt')?.value||'',cuerpo:document.getElementById('nb')?.value||'',clienteId:parseInt(document.getElementById('nc')?.value)||null});this._lista(Data.getNotas());},800);},
async nueva(){await Data.guardarNota({titulo:'',cuerpo:'',clienteId:null});this._activa=Data.getNotas()[0]?.id;this.render(document.getElementById('main'));},
async eliminar(id){if(!confirm('¿Eliminar esta nota?'))return;this._activa=null;await Data.eliminarNota(id);this.render(document.getElementById('main'));App.toast('Nota eliminada');},
buscar(q){const notas=q?Data.getNotas().filter(n=>n.titulo.toLowerCase().includes(q.toLowerCase())||n.cuerpo.toLowerCase().includes(q.toLowerCase())):Data.getNotas();this._lista(notas);}};

// ---------- APP BOOTSTRAP ----------
const App=(()=>{
  let _root=null;
  async function init(){
    await Auth.init();
    document.getElementById('signin').addEventListener('click',()=>{
  if(_tokenClient){_tokenClient.requestAccessToken({prompt:'consent'});}
  else{Auth.signIn();}
});
    document.getElementById('signout').addEventListener('click',()=>Auth.signOut());
    document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});
    if(localStorage.getItem('ws_user')&&localStorage.getItem('ws_token'))Auth.signIn();
  }
  async function onSignedIn(user,token){
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    const u=user||Auth.getUser(); document.getElementById('userpill').textContent=u?.email||'';
    try{_root=await Drive.ensureFolder(CONFIG.DRIVE_ROOT_FOLDER);await Data.init(_root);}
    catch(e){console.warn('Drive init failed',e);await Data.init(null);}
    async function onSignedIn(user,token){
    _user=user||Auth.getUser();
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userpill').textContent=_user?.email||'';
    try{_root=await Drive.ensureFolder(CONFIG.DRIVE_ROOT_FOLDER);await Data.init(_root);}
    catch(e){console.warn('Drive init failed',e);await Data.init(null);}
    Vistas.ir('inicio');
  }
  }
  function rootFolderId(){return _root;}
  function modal(title,body,onConfirm,viewOnly){
    const box=document.getElementById('modalbox');
    box.innerHTML=`<div class="mt">${title}</div><div>${body}</div><div class="ma"><button class="btn" onclick="App.closeModal()">${viewOnly?'Cerrar':'Cancelar'}</button>${!viewOnly?'<button class="btn btnp" id="mconfirm">Guardar</button>':''}</div>`;
    if(onConfirm)document.getElementById('mconfirm').addEventListener('click',async()=>{const r=await onConfirm();if(r!==false)closeModal();});
    document.getElementById('modal').classList.remove('hidden');
    setTimeout(()=>box.querySelector('input,textarea')?.focus(),50);
  }
  function closeModal(){document.getElementById('modal').classList.add('hidden');document.getElementById('modalbox').innerHTML='';}
  function toast(msg,d=2500){const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),d);}
  return{init,onSignedIn,rootFolderId,modal,closeModal,toast};
})();

window.addEventListener('DOMContentLoaded',()=>App.init());
