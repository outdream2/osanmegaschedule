import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) files.push(...walk(p));
    else if (f.endsWith(".ts") && !f.endsWith(".test.ts")) files.push(p);
  }
  return files;
}

const files = walk("server/routes");
const routeSchemas = [];
for (const f of files) {
  const content = fs.readFileSync(f, "utf8");
  const clean = content.replace(/\n/g, " ").replace(/\s+/g, " ");
  const re = /router\.(get|post|patch|delete|put)\("([^"]+)"[^;]*?validateBody\(([A-Za-z_][A-Za-z_0-9]*)/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    routeSchemas.push({
      method: m[1].toUpperCase(),
      route: m[2],
      schema: m[3],
      file: f.replace(/\\/g, "/").replace("server/routes/", ""),
    });
  }
}
console.log("총", routeSchemas.length, "개 endpoint");
const bySchema = {};
for (const r of routeSchemas) {
  bySchema[r.schema] = bySchema[r.schema] || [];
  bySchema[r.schema].push(`${r.method} ${r.route}`);
}
Object.entries(bySchema).sort().forEach(([s, rs]) => {
  console.log(`${s}:`);
  rs.forEach(r => console.log("  ", r));
});
