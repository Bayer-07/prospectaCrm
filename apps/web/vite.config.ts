import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const envDir = '../..';
  const env = loadEnv(mode, envDir, '');
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    envDir,
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts,
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
        '/docs': { target: 'http://localhost:3000', changeOrigin: true },
        '/socket.io': { target: 'ws://localhost:3000', ws: true },
      },
    },
    build: { sourcemap: false },
  };
});
