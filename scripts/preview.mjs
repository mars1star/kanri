import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.sql':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1');
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(5174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5174/'));
