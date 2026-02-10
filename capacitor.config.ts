import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qingbrother.warring_states',
  appName: '战国与伍同行',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
