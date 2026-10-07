import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/server.js',
  minify: false,
  legalComments: 'inline',
  banner: { js: '/* molfar_audit by Molfar Labs — MIT — https://github.com/molfarlabs/molfar_audit */' },
});
console.log('built dist/server.js');
