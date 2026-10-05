import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  // sharp loads a native binary at runtime, so the server bundle must import it from
  // node_modules instead of inlining it.
  ssr: { external: ['sharp'] },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
    // Copy the external sharp (with its `@img/*` platform package) into `.output`.
    nitro({ traceDeps: ['sharp'] }),
  ],
});
