#!/usr/bin/env node
// Dependency-free, deterministic ZIP builder. Includes only distributable files.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]||path.join(root,'dist/domain-search.zip'));
const files=[];
function include(relative){
 const absolute=path.join(root,relative);const stat=fs.lstatSync(absolute);
 if(stat.isSymbolicLink())throw new Error(`Refusing to package symlink: ${relative}`);
 if(stat.isDirectory())for(const child of fs.readdirSync(absolute).sort())include(`${relative}/${child}`);
 else files.push({name:`domain-search/${relative}`,data:fs.readFileSync(absolute),mode:relative === 'domain-search.sh' || relative === 'cli/bin/domain-search.js' ? 0o100755 : 0o100644});
}
for(const name of ['SKILL.md','README.md','domain-search.sh','agents','references','cli/bin','cli/lib','cli/data','cli/index.js','cli/package.json','cli/README.md','cli/LICENSE','THIRD_PARTY_NOTICES.md','scripts/refresh-data.js','scripts/package-skill.js'])include(name);
if(files.some(f=>path.resolve(root,f.name.replace(/^domain-search\//,''))===output))throw new Error('Archive output cannot replace a packaged source file.');
const manifest=Object.fromEntries(files.map(f=>[f.name.replace(/^domain-search\//,''),createHash('sha256').update(f.data).digest('hex')]));
files.push({name:'domain-search/PACKAGE_MANIFEST.json',data:Buffer.from(JSON.stringify({version:require('../cli/package.json').version,sha256:manifest},null,2)+'\n'),mode:0o100644});
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
const body=[],directory=[];let offset=0;
for(const file of files){
 const name=Buffer.from(file.name);const packed=zlib.deflateRawSync(file.data,{level:9});const crc=crc32(file.data);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(file.data.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x0314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(file.data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE((file.mode<<16)>>>0,38);central.writeUInt32LE(offset,42);
 body.push(local,name,packed);directory.push(central,name);offset+=local.length+name.length+packed.length;
}
const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([...body,dir,end]));
console.log(JSON.stringify({path:output,files:files.length,bytes:fs.statSync(output).size,sha256:createHash('sha256').update(fs.readFileSync(output)).digest('hex')},null,2));
