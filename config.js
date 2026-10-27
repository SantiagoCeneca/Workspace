// ============================================================
//  CĒNECA · PENDIENTES — CONFIGURACIÓN
//  Los datos se guardan en un solo archivo (pendientes.json) dentro
//  de la carpeta _data de la carpeta compartida de Drive.
// ============================================================
const CONFIG = {
  CLIENT_ID: '1030850512230-cgirgoosvop7kfha1qnnb888vb23usff.apps.googleusercontent.com',
  // Solo Drive (ya no se usan Calendar ni Gmail)
  SCOPES: 'https://www.googleapis.com/auth/drive profile email',
  SHARED_FOLDER_ID: '1-f3lEGm8SlaIsmt6MB7LSH5RMKUlaklb',
  DATA_FOLDER: '_data',
  DATA_FILE: 'pendientes.json',

  // Equipo. Pon aquí los correos REALES con los que cada quien entra.
  // Si alguien entra con un correo que no está aquí, la app le pregunta
  // quién es la primera vez y lo recuerda en ese navegador.
  MIEMBROS: [
    { id: 'santiago',  nombre: 'Santiago',  iniciales: 'SC',  correos: ['santiago@ceneca.com.mx'] },
    { id: 'elizabeth', nombre: 'Elizabeth', iniciales: 'ECR', correos: ['elizabeth@ceneca.com.mx'] }
  ],

  // Motivos rápidos al pasar una tarea (se puede escribir uno distinto)
  MOTIVOS: ['Vo.Bo.', 'Correcciones', 'Firma', 'Respuesta', 'Información', 'Pago', 'Revisión'],

  // Áreas iniciales (se pueden agregar más desde la app)
  AREAS: ['Marcas', 'Corporativo', 'Laboral', 'Otro'],

  // Plantilla de Word para el cómputo de horas (se puede editar en Word;
  // respeta los campos entre llaves, p. ej. {razon_social}, {#filas}…{/filas})
  PLANTILLA_HORAS: 'plantillas/horas.docx',

  // Cada cuántos segundos revisa si la otra persona hizo cambios
  SYNC_SEGUNDOS: 20,
  VERSION: '2.0.0'
};
