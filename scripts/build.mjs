import { build } from 'esbuild';
await build({entryPoints:['src/main.tsx'],outfile:'assets/app.js',bundle:true,minify:true,format:'iife',platform:'browser',target:['es2022'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
console.log('Built index.html + assets/app.js + assets/style.css. Upload the repository root to GitHub Pages.');
