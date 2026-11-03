import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // BASE_PATH : sous-chemin de publication (ex. "/khoule-education/" sur GitHub Pages), "/" par défaut
  const env = loadEnv(mode, '.', '');
  return {
    base: env.BASE_PATH || '/',
    plugins: [react()],
    server: { host: true, port: 5173 },
    // Bibliothèques dans des fichiers à part : elles restent en cache quand seule l'application change
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
