import { defineConfig } from 'vite';

// `node:sqlite` is only available to Electron's main-process Node runtime.
// Keep it external so Vite does not substitute its browser compatibility shim
// when building on GitHub's Node runtime.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['node:sqlite'],
    },
  },
});
