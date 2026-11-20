import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'geojson',
      transform(code, id) {
        if (id.split('?')[0].endsWith('.geojson')) {
          return { code: `export default ${code}`, map: null }
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  worker: {
    format: 'es',
  },
})
