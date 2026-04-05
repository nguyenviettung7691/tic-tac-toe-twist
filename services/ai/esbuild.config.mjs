/**
 * esbuild configuration for bundling the Firebase Cloud Function.
 *
 * Bundles `src/index.ts` (Cloud Function entry) into `dist/index.js`,
 * inlining all workspace dependencies (e.g. @ttt/engine) so that
 * `firebase deploy` does not need npm workspace resolution.
 *
 * Usage:  node esbuild.config.mjs
 */

import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  // Keep firebase-functions and firebase-admin as external —
  // they are installed at deploy time by Firebase and must not be bundled.
  external: [
    'firebase-functions',
    'firebase-functions/*',
    'firebase-admin',
    'firebase-admin/*',
  ],
  // Produce a clean ESM banner so Node.js can handle require() calls
  // from CJS dependencies inside an ESM bundle.
  banner: {
    js: [
      'import { createRequire as __bundleCreateRequire } from "module";',
      'const require = __bundleCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});

console.log('[esbuild] Built dist/index.js');
