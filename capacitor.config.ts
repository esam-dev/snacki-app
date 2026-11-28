import type { CapacitorConfig } from '@capacitor/cli';

// Configuración para usar la API en la red local (http://IP-de-la-PC:3000).
// El WebView se sirve por http para que Android no bloquee las llamadas http:// como contenido mixto
// (el origen resultante, http://localhost, ya está permitido en CORS) y se permite tráfico sin cifrar.
const config: CapacitorConfig = {
  appId: 'com.snacki.app',
  appName: 'Snacki',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
