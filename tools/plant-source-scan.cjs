'use strict';const fs=require('node:fs'),acorn=require('acorn'),scope=require('eslint-scope'),globals=require('globals');
const source=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest',ranges:true,locations:true}),allowed=new Set([...Object.keys(globals.node),...Object.keys(globals.es2021)]),result=new Map();
const info=scope.analyze(ast,{ecmaVersion:2024,sourceType:'script',ignoreEval:true});
for(const statement of ast.body){if(statement.id?.name)allowed.add(statement.id.name);for(const d of statement.declarations || [])if(d.id?.name)allowed.add(d.id.name);}
for(const ref of info.globalScope.through){const id=ref.identifier;if(allowed.has(id.name))continue;if(!result.has(id.name))result.set(id.name,[]);result.get(id.name).push(id.loc.start.line);}
const rows=Object.fromEntries([...result].map(([name,lines])=>[name,[...new Set(lines)]]));fs.writeFileSync('C:/Users/pc/.codex/reports/grassland-plantas-20261029/unresolved-names.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
