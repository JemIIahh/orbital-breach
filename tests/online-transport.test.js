// Real RFC6455 masking/framing over paired streams, so this also runs in sandboxes
// that prohibit TCP listeners. The production transport uses the same vendored ws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import { WebSocket } from 'ws';
import { Rooms } from '../server/rooms.js';
const flush=()=>new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));
function wire(rooms){
  let a,b;a=new Duplex({read(){},write(data,_,done){b.push(Buffer.from(data));done()},final(done){b.push(null);done()}});b=new Duplex({read(){},write(data,_,done){a.push(Buffer.from(data));done()},final(done){a.push(null);done()}});
  const options={autoPong:true,closeTimeout:20},server=new WebSocket(null,null,options),client=new WebSocket(null,null,options);client._isServer=false;
  const transport={allowSynchronousEvents:true,maxPayload:8192,skipUTF8Validation:false};server.setSocket(a,Buffer.alloc(0),transport);client.setSocket(b,Buffer.alloc(0),transport);
  const messages=[];client.on('message',data=>messages.push(JSON.parse(String(data))));const peer=rooms.connect(message=>server.send(JSON.stringify(message)));
  server.on('message',data=>rooms.receive(peer,JSON.parse(String(data))));server.on('close',()=>rooms.disconnect(peer));
  return{client,server,messages,peer,send:m=>client.send(JSON.stringify(m))};
}
test('three independent WebSocket clients create, join, ready, launch, replicate and rematch',async t=>{
  let time=10;const rooms=new Rooms({now:()=>time}),clients=Array.from({length:3},()=>wire(rooms));t.after(()=>clients.forEach(c=>{c.client.terminate();c.server.terminate()}));
  clients[0].send({type:'create',map:'city',name:'HOST'});await flush();const room=clients[0].messages.find(m=>m.type==='room');assert.ok(room.code);
  clients[1].send({type:'join',code:room.code,name:'RIVAL A'});clients[2].send({type:'join',code:room.code,name:'RIVAL B'});await flush();
  for(const c of clients)c.send({type:'ready',ready:true});await flush();clients[0].send({type:'start'});await flush();
  for(const c of clients){assert.equal(c.messages.filter(m=>m.type==='room').at(-1).state,'playing');const snap=c.messages.filter(m=>m.type==='snapshot').at(-1);assert.equal(snap.players.length,3);assert.equal(snap.remaining,300)}
  const game=clients[0].peer.room,q=game.players.get(clients[0].peer.id);const position=q.position.clone().add(new (q.position.constructor)(0,0,.2));
  clients[0].send({type:'pose',epoch:q.epoch,seq:1,position:position.toArray(),velocity:[0,0,4],forward:[0,0,1],up:[0,1,0],pitch:0,grounded:true,magnetic:true});await flush();time+=.06;rooms.step(.06);await flush();
  const snaps=clients.map(c=>c.messages.filter(m=>m.type==='snapshot').at(-1));assert.deepEqual(snaps[0].players,snaps[1].players);assert.deepEqual(snaps[1].players,snaps[2].players);assert.equal(snaps[2].players.find(p=>p.id===q.id).seq,1);
  time=game.ends;rooms.step(.1);await flush();assert.ok(clients.every(c=>c.messages.filter(m=>m.type==='room').at(-1).state==='finished'));
  clients[0].send({type:'rematch'});await flush();assert.ok(clients.every(c=>c.messages.filter(m=>m.type==='room').at(-1).state==='lobby'));
  clients[0].client.close();await flush();assert.equal(game.host,clients[1].peer.id);
});
