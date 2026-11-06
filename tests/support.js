import * as T from 'three';
import { OrbitalBreach } from '../src/game.js';
import { Onboarding } from '../src/onboarding.js';
import { RADIUS } from '../src/physics.js';

export function simulation(){
  const game=Object.create(OrbitalBreach.prototype);
  Object.assign(game,{
    player:{position:new T.Vector3(0,-RADIUS+2.65,0),velocity:new T.Vector3(),health:100,shield:100,magnetic:true,lastHit:0},
    keys:new Set(),up:new T.Vector3(0,1,0),forward:new T.Vector3(1,0,0),right:new T.Vector3(0,0,1),
    realm:'station',dangerZones:[],theta:0,yaw:0,pitch:0,roll:0,time:0,invulnerable:0,nearAirlock:false,deadTimer:0,
    world:{covers:[],playerLight:new T.Object3D()},scene:new T.Scene(),camera:new T.PerspectiveCamera(),
    heat:[0,0],cooldowns:[0,0],overheated:[false,false],recoil:[0,0],buttons:[false,false],score:0,
    bots:[],ray:new T.Raycaster(),missileCooldown:0,projectiles:[],bullets:[],tutorial:new Onboarding(),spawnGrace:0,dashCooldown:0,dashTime:0,dashVector:new T.Vector3(),shake:0,combo:0,comboTime:0,accumulator:0,remaining:180,enemyScore:0,running:true,
    ui:{messages:[],event(text){this.messages.push(text)},hit(){},damage(){},kill(){}},
    effects:{traces:[],trace(a,b){this.traces.push({a,b})},burst(){},explosion(){},shieldHit(){}},audio:{play(){}}
  });
  game.camera.position.copy(game.player.position);game.camera.lookAt(game.player.position.clone().add(new T.Vector3(1,0,0)));
  game.tutorial.active=false;game.tutorial.justCompleted=false;return game;
}
