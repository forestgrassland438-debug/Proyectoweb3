'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
(async () => {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'metamask-entry.mjs')],
    outfile: path.join(root, 'vendor/gf-metamask-connect.js'), bundle: true, minify: true,
    platform: 'browser', format: 'iife', globalName: 'GFMetaMask', target: ['es2020'],
    footer: { js: 'globalThis.GFMetaMask=GFMetaMask;' }, legalComments: 'linked',
    define: { 'process.env.NODE_ENV': '"production"' } });
  const sdkRoot = path.resolve(root, '../../gf-wallet-sdk');
  fs.copyFileSync(path.join(root, 'vendor/gf-metamask-connect.js'), path.join(sdkRoot, 'gf-metamask-connect.js'));
  fs.copyFileSync(path.join(root, 'vendor/gf-metamask-connect.js.LEGAL.txt'), path.join(sdkRoot, 'gf-metamask-connect.js.LEGAL.txt'));
  console.log('MetaMask Connect compilado para el juego y el login.');
})().catch(e => { console.error(e); process.exitCode = 1; });
