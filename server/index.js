import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Rooms } from './rooms.js';
const ROOT=resolve(fileURLToPath(new URL('../dist',import.meta.url))),PORT=Number(process.env.PORT||3001),HOST=process.env.HOST||'0.0.0.0';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
export function createGameServer(){
  const rooms=new Rooms(),server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.url==='/api/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,protocol:1,rooms:rooms.rooms.size}));return}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
    try{
      const path=decodeURIComponent(new URL(req.url,'http://local').pathname),file=resolve(ROOT,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(ROOT+sep)){res.writeHead(403);res.end();return}
      const info=await stat(file);if(!info.isFile())throw Error('not a file');const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end('Not found. Run npm run build before npm start.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin,allowed=new Set((process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean));let same=false;try{same=new URL(origin).host===req.headers.host}catch{}
    if(req.url!=='/socket'||origin&&!same&&!allowed.has(origin)||wss.clients.size>=192){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    let peer;try{peer=rooms.connect(m=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>256*1024){ws.close(1013,'Connection too slow');return}ws.send(JSON.stringify(m))}})}catch{ws.close(1013,'Server full');return}
    ws.alive=true;ws.on('pong',()=>ws.alive=true);
    ws.on('message',(data,binary)=>{if(binary){ws.close(1003,'JSON only');return}try{rooms.receive(peer,JSON.parse(data.toString()))}catch{ws.close(1007,'Invalid JSON')}});
    ws.on('close',()=>rooms.disconnect(peer));ws.on('error',()=>ws.terminate());
  });
  // Fixed steps keep projectile speed and cooldowns independent of socket traffic.
  let previous=performance.now(),accumulator=0;
  const tick=setInterval(()=>{const now=performance.now();accumulator+=Math.min(.15,(now-previous)/1000);previous=now;while(accumulator>=1/60){rooms.step(1/60);accumulator-=1/60}},1000/60);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},15000);
  server.on('close',()=>{clearInterval(tick);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close()});
  return{server,rooms,wss};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {server}=createGameServer();server.on('error',e=>{console.error(`Multiplayer server: ${e.message}`);process.exitCode=1;server.close()});server.listen(PORT,HOST,()=>console.log(`Orbital Breach multiplayer: http://${HOST}:${PORT}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
}
