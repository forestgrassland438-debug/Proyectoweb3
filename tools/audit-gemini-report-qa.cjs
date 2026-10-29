'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='C:/Users/pc/.codex/reports/grassland-auditoria-20261029';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/pc/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'INFORME-PRIVADO.html')).href);await page.waitForLoadState('load');
 const report=await page.evaluate(()=>({images:Array.from(document.images,i=>({loaded:i.complete&&i.naturalWidth>0,source:i.getAttribute('src')})),rows:document.querySelectorAll('tbody tr').length,scripts:document.scripts.length}));
 assert.equal(report.rows,160);assert.equal(report.images.length,3);assert.ok(report.images.every(i=>i.loaded));assert.equal(report.scripts,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:root+'/informe-preview.png'});fs.writeFileSync(root+'/report-qa.json',JSON.stringify({ok:true,...report,errors},null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
