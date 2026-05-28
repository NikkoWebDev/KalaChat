import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: false })],
  output: 'static',
  server: { host: true, port: 5173 },
  build: { assets: 'assets' },
})
