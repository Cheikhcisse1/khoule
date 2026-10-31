import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // BASE_PATH : sous-chemin de publication (ex. "/khoule-education/" sur GitHub Pages), "/" par défaut
  const env = loadEnv(mode, '.', '');
  return {
    base: env.BASE_PATH || '/',
    plugins: [react()],
    server: { host: true, port: 5173 },
  };
});
