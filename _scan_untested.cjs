const fs = require('fs');
const path = require('path');
function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    if (['node_modules','dist','build','.git','ios','android','.next','coverage'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const roots = ['src','server','shared'].filter(d => fs.existsSync(d));
const all = roots.flatMap(walk);
const testFiles = all.filter(f => /\.test\.(ts|tsx)$/.test(f));
const src = all.filter(f => !/\.test\.(ts|tsx)$/.test(f));
const testedBases = new Set(testFiles.map(t => t.replace(/\.test\.(ts|tsx)$/, '')));
const untested = src.filter(f => !testedBases.has(f.replace(/\.(ts|tsx)$/, '')));
console.log('Total src files:', src.length);
console.log('Test files:', testFiles.length);
console.log('Untested files:', untested.length);
const groups = {};
for (const f of untested) {
  const dir = path.dirname(f).replace(/\\/g,'/');
  groups[dir] = (groups[dir]||0)+1;
}
console.log('\nTop 30 dirs by untested:');
Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([d,n])=>console.log(n, d));
