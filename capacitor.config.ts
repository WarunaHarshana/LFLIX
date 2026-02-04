import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lflix.app',
  appName: 'LFLIX',
  webDir: 'mobile',
  server: {
    allowNavigation: ['*']
  }
};

export default config;
