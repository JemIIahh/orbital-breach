import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeCity} from '../src/city.js';
import {simulation} from './support.js';
import {Grapple} from '../src/grapple.js';
const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(){return{getContext(){return ctx}}}};
const world=makeCity(),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),UP=v(0,1,0),dt=1/60;
const bridges=[-1,1].flatMap(side=>[[-10,15],[30,17],[70,15]].map(([z,y])=>({x:side*40,z,y,roof:y+2.65+.175,deck:y+.55})));
const tick=(game,n)=>{for(let i=0;i<n;i++){game.time+=dt;game.updatePlayer(dt)}};
function pilot(slab){const game=simulation();game.realm='city';game.world=world;game.player.position.set(slab.x,slab.roof+9,slab.z);return game}

test('every skybridge roof catches the actual player and remains a grounded surface at rest',()=>{
  for(const slab of bridges){
    const game=pilot(slab);tick(game,240);
    assert.ok(Math.abs(game.player.position.y-slab.roof-2.65)<.02,`fell through skybridge ${slab.x},${slab.z}`);
    assert.equal(game.player.grounded,true);assert.ok(Math.abs(game.player.velocity.y)<.001);
    assert.ok(Math.abs(game.player.supportSurface.y-slab.roof)<.001);
    tick(game,180);assert.equal(game.player.grounded,true,'stationary standing must remain stable');
  }
});

test('a mech walks and jumps on the skybridge without sinking through the slab',()=>{
  const slab=bridges[0],game=pilot(slab);tick(game,180);
  game.keys.add('KeyW');tick(game,15);game.keys.clear();tick(game,30);
  assert.ok(game.player.position.z>slab.z+1,'walked along the slab');
  assert.ok(Math.abs(game.player.position.y-slab.roof-2.65)<.02);
  game.player.velocity.y=12;tick(game,16);assert.ok(game.player.position.y>slab.roof+4,'jumped clear of the surface');
  tick(game,160);assert.equal(game.player.grounded,true);assert.ok(Math.abs(game.player.position.y-slab.roof-2.65)<.02);
});

test('roof and lower deck catch fast falls, and the underside blocks upward motion',()=>{
  for(const slab of bridges){
    const velocity=v(0,-120,0),start=v(slab.x,slab.roof+12,slab.z),end=start.clone().add(v(0,-25,0));
    const caught=world.resolve(start,end,velocity,1.45,UP);
    assert.ok(Math.abs(caught.y-slab.roof-2.65)<.02);assert.equal(velocity.y,0);
    // The enclosed walkway is human-sized; a ray inside it must hit its real
    // floor rather than seeing through to the street below.
    const deckHit=world.raycast(v(slab.x,slab.deck+.5,slab.z),v(slab.x,slab.deck-.5,slab.z));
    assert.ok(deckHit&&Math.abs(deckHit.y-slab.deck)<.001,'deck is independently solid');
    const from=v(slab.x,slab.y-3,slab.z),upward=v(0,100,0),to=world.resolve(from,from.clone().add(v(0,8,0)),upward,1.45,UP);
    assert.ok(to.y-1.2+1.45<=slab.y-.55+.02,'cannot fly up through the slab');assert.equal(upward.y,0);
  }
});

test('support ends at the visible slab edge instead of extending into empty air',()=>{
  const slab=bridges[0],game=pilot(slab);tick(game,180);game.keys.add('KeyA');tick(game,70);
  assert.ok(game.player.position.x>slab.x+5,'left the side of the slab');
  assert.ok(game.player.position.y<slab.roof+1,'falls after leaving the physical edge');
});

test('back-building roof slabs also match their rendered top surface',()=>{
  for(const side of [-1,1])for(let row=0;row<4;row++){
    const h=38+row%2*20,x=side*73-side*9,z=-30+row*40+2-9;
    let p=v(x,h+12,z),velocity=v(0,-17,0);
    for(let i=0;i<180;i++)p=world.resolve(p,p.clone().addScaledVector(velocity,dt),velocity,1.45,UP);
    assert.ok(Math.abs(p.y-(h+.5+2.65))<.02,'landing matches the top of the visible roof cap');
  }
});


test('a tether landing on a skybridge stays supported after the cable retracts',()=>{
  const slab=bridges[2],game=pilot(slab);game.player.magnetic=false;game.grapple=new Grapple();
  assert.equal(game.grapple.fire(game.player.position,v(0,-1,0),(a,b)=>world.raycast(a,b)),true);
  tick(game,300);
  assert.equal(game.grapple.mode,'idle');assert.equal(game.player.grounded,true);
  assert.ok(Math.abs(game.player.position.y-slab.roof-2.65)<.02);
});
