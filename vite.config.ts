/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Make the production build envelope explicit rather than relying on
  // Vite's evolving defaults across major versions:
  //  - `target: 'es2022'` matches the project's tsconfig and avoids
  //    paying for legacy syntax transforms (e.g. async/await
  //    down-level) when our minimum supported browsers all speak
  //    ES2022 natively.
  //  - `cssTarget: 'chrome111'` is the current evergreen baseline and
  //    is required for the `@layer` cascading + `oklch()` colour
  //    primitives used by the Tailwind 4 token system in
  //    `src/styles/theme.css`.
  //  - `sourcemap: false` is deliberate: the production bundle ships
  //    to a public origin and we do not want to expose the original
  //    source tree (variable names, comments) for casual inspection.
  //    Local dev sourcemaps remain enabled by Vite's default behavior.
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    sourcemap: false,
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'server/dist/**'],
    css: true,
  },
})
