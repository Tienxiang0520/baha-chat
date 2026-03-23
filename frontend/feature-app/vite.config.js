import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/react-features/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/meta': {
        target: 'http://localhost:3000'
      }
    }
  }
}));
