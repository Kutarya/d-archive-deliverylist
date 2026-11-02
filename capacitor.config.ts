import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.faturaatolyesi.app', appName: 'Invoice Atelier', webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { Camera: { presentationStyle: 'fullscreen' } }
};
export default config;
