import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// La carpeta android/ se genera con `npx cap add android` y no se versiona, así que el permiso de cámara
// se agrega aquí. Sin `<uses-permission CAMERA>` en el manifiesto Android nunca muestra el diálogo de permiso
// y el escáner QR falla. Es idempotente: se puede correr después de cada `npx cap sync android`.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

let xml;
try {
  xml = await readFile(manifestPath, 'utf8');
} catch {
  throw new Error('No existe android/. Corre primero: npx cap add android');
}

const cambios = [];
const eol = xml.includes('\r\n') ? '\r\n' : '\n';

// Permiso y característica de cámara (no obligatoria: la app se instala en equipos sin cámara).
if (!/android\.permission\.CAMERA/.test(xml)) {
  xml = xml.replace(/<application\b/, `<uses-permission android:name="android.permission.CAMERA" />${eol}    <application`);
  cambios.push('permiso CAMERA');
}
if (!/android\.hardware\.camera/.test(xml)) {
  xml = xml.replace(/<application\b/, `<uses-feature android:name="android.hardware.camera" android:required="false" />${eol}    <application`);
  cambios.push('uses-feature camera (opcional)');
}
// Descarga el módulo del escáner de Google al instalar la app (evita la primera lectura fallida).
if (!/com\.google\.mlkit\.vision\.DEPENDENCIES/.test(xml)) {
  xml = xml.replace(/(<application\b[^>]*>)/, `$1${eol}        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />`);
  cambios.push('meta-data del escáner ML Kit');
}

if (cambios.length) {
  await writeFile(manifestPath, xml, 'utf8');
  process.stdout.write(`AndroidManifest.xml actualizado: ${cambios.join(', ')}\n`);
} else {
  process.stdout.write('AndroidManifest.xml ya tenía los permisos de cámara.\n');
}
