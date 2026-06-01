const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
  });

  if (watch) {
    await ctx.watch();
    console.log('[chromabar] watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[chromabar] build succeeded');
  }
}

main().catch(e => {
  console.error('[chromabar] build failed:', e);
  process.exit(1);
});
