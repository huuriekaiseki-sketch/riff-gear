import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    testTimeout: 15000,
  },
  resolve: {
    // tsconfig.json の "@/*": ["./*"] と同じエイリアスを vitest でも解決できるようにする
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
