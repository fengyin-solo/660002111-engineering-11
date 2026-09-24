import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5181,
    open: true,
    proxy: { '/api': 'http://localhost:8002' },
    fs: { allow: ['..'] },
  },
})
