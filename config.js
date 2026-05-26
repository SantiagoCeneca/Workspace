// ============================================================
//  CENECA WORKSPACE — CONFIGURACIÓN
//  1. Ve a https://console.cloud.google.com
//  2. Crea un proyecto, activa Drive API + Calendar API + Gmail API
//  3. Crea credenciales OAuth 2.0 (aplicación web)
//  4. Agrega https://workspace.ceneca.com.mx como origen autorizado
//  5. Pega tu Client ID abajo
// ============================================================
const CONFIG = {
  CLIENT_ID: '1030850512230-cgirgoosvop7kfha1qnnb888vb23usff.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.modify',
    'profile', 'email'
  ].join(' '),
  DRIVE_ROOT_FOLDER: 'Ceneca Workspace',
  SHARED_FOLDER_ID: '1-f3lEGm8SlaIsmt6MB7LSH5RMKUlaklb',
  // Agrega miembros del equipo aquí conforme crezcan
  EQUIPO: ['Santiago', 'Elizabeth'],
  VERSION: '1.0.0'
};
