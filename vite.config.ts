import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  build: {
    // Ensure compatibility with macOS 10.15 Catalina WKWebView (Safari 13-15) and Win7 WebView2 109
    target: ['safari13', 'chrome90'],
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        obs: path.resolve(__dirname, 'obs.html'),
      },
      output: {
        // Keep Three.js in its own chunk so 2D-only users never download it.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
