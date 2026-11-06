import { RADIUS, HEIGHT, HALF_WIDTH, BAY_COUNT, TAU, wrapAngle, polarAngle, clamp } from './station-constants.js';
import { insidePatch, boxLocal, boxNormalWorld, roofWindowAt } from './station-layout.js';
export { RADIUS, HEIGHT, HALF_WIDTH, BAY_COUNT, TAU, wrapAngle, polarAngle, clamp } from './station-constants.js';
export const windowKey = (angle,side) => `${((Math.round(angle/TAU*BAY_COUNT)%BAY_COUNT)+BAY_COUNT)%BAY_COUNT}:${side<0?-1:1}`;
export function openStationSide(angle,z,height,bodyRadius=0,state={}){
  if(isAirlock(angle))return true;
  return !!state.brokenWindows?.has(windowKey(angle,z))&&height>2.05+bodyRadius&&height<9.05-bodyRadius;
}
export function isAirlock(angle) {
  const bay = ((Math.round(angle / TAU * BAY_COUNT) % BAY_COUNT) + BAY_COUNT) % BAY_COUNT;
  return bay % 12 === 5 || bay % 12 === 6;
}
export function stationPosition(angle, height = 0, side = 0) {
  return { x: Math.sin(angle) * (RADIUS - height), y: -Math.cos(angle) * (RADIUS - height), z: side };
}
const basicSurfaces=[{radius:RADIUS,minZ:-HALF_WIDTH,maxZ:HALF_WIDTH,surface:'hull',label:'PROMENADE'},{radius:RADIUS-HEIGHT,minZ:-HALF_WIDTH,maxZ:HALF_WIDTH,surface:'roof',label:'HULL ROOF'}];
const radiiOf=surface=>surface.thickness?[surface.radius,surface.radius+surface.thickness]:[surface.radius];
function resolveSolid(point,velocity,radius,box){
  const dx=point.x-box.center.x,dy=point.y-box.center.y,dz=point.z-box.center.z;
  if(Math.abs(dz)>box.half.z+radius||dx*dx+dy*dy+dz*dz>(box.bound+radius)**2)return;
  const local=boxLocal(point,box),near={x:clamp(local.x,-box.half.x,box.half.x),y:clamp(local.y,-box.half.y,box.half.y),z:clamp(local.z,-box.half.z,box.half.z)};
  let normal={x:local.x-near.x,y:local.y-near.y,z:local.z-near.z},distance=Math.hypot(normal.x,normal.y,normal.z),push=radius-distance;
  if(distance>=radius)return;
  if(distance<1e-8){
    const axis=['x','y','z'].sort((a,b)=>(box.half[a]-Math.abs(local[a]))-(box.half[b]-Math.abs(local[b])))[0];
    normal={x:0,y:0,z:0};normal[axis]=local[axis]>=0?1:-1;push=radius+box.half[axis]-Math.abs(local[axis]);
  }else{normal.x/=distance;normal.y/=distance;normal.z/=distance}
  const n=boxNormalWorld(normal,box);point.x+=n.x*push;point.y+=n.y*push;point.z+=n.z*push;
  const toward=velocity.x*n.x+velocity.y*n.y+velocity.z*n.z;if(toward<0){velocity.x-=toward*n.x;velocity.y-=toward*n.y;velocity.z-=toward*n.z}
}
function intersectSolid(a,b,box){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
  const projection=length>0?clamp(((box.center.x-a.x)*dx+(box.center.y-a.y)*dy+(box.center.z-a.z)*dz)/length,0,1):0;
  if((a.x+dx*projection-box.center.x)**2+(a.y+dy*projection-box.center.y)**2+(a.z+dz*projection-box.center.z)**2>box.bound**2+.001)return null;
  const start=boxLocal(a,box),end=boxLocal(b,box),delta={x:end.x-start.x,y:end.y-start.y,z:end.z-start.z};
  let enter=-Infinity,exit=Infinity,entryNormal=null,exitNormal=null;
  for(const axis of ['x','y','z']){
    if(Math.abs(delta[axis])<1e-10){if(Math.abs(start[axis])>box.half[axis])return null;continue}
    let near=(-box.half[axis]-start[axis])/delta[axis],far=(box.half[axis]-start[axis])/delta[axis],sign=-1;if(near>far){[near,far]=[far,near];sign=1}
    if(near>enter){enter=near;entryNormal={x:0,y:0,z:0};entryNormal[axis]=sign}
    if(far<exit){exit=far;exitNormal={x:0,y:0,z:0};exitNormal[axis]=-sign}
    if(enter>exit)return null;
  }
  const t=enter>1e-7?enter:exit,normal=enter>1e-7?entryNormal:exitNormal;
  if(t<=1e-7||t>1||!normal)return null;return{t,normal:boxNormalWorld(normal,box),surface:'exterior-solid',label:box.label,id:box.id};
}

// Swept movement prevents high-speed boosts from tunnelling through a hull or window.
export function resolveStationMotion(start, end, velocity, bodyRadius = .7, state={}) {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / .35));
  const p = { ...start };
  for (let i = 0; i < steps; i++) {
    const oldZ = p.z;
    p.x += dx / steps; p.y += dy / steps; p.z += dz / steps;
    let radial = Math.hypot(p.x, p.y);
    const angle = polarAngle(p);
    // Floor and roof are closed from both sides, including exterior approaches.
    const oldRadial = Math.hypot(p.x - dx / steps, p.y - dy / steps);
    for (const patch of state.stationSurfaces||basicSurfaces) {
      if(!insidePatch(patch,angle,p.z,bodyRadius*.2))continue;
      // The whole roof thickness opens only after this specific pane shatters.
      const skylight=patch.surface==='roof'&&roofWindowAt(angle,p.z,state,bodyRadius);
      if(skylight&&state.brokenWindows?.has(skylight.key))continue;
      for(const surface of radiiOf(patch)){
      const d0 = oldRadial - surface, d1 = radial - surface;
      if (d0 * d1 <= 0 || (Math.abs(d1) < bodyRadius && Math.abs(d0) >= Math.abs(d1))) {
        const side = d0 >= 0 ? 1 : -1;
        const target = surface + side * bodyRadius;
        const nx = p.x / radial, ny = p.y / radial;
        p.x = nx * target; p.y = ny * target;
        const vn = velocity.x * nx + velocity.y * ny;
        velocity.x -= vn * nx; velocity.y -= vn * ny;
        radial = target;
      }
      }
    }
    for(const box of state.stationSolids||[])resolveSolid(p,velocity,bodyRadius,box);
    radial=Math.hypot(p.x,p.y);const wallAngle=polarAngle(p);
    if (radial > RADIUS - HEIGHT && radial < RADIUS) {
      for (const side of [-1, 1]) {
        if(openStationSide(wallAngle,side,RADIUS-radial,bodyRadius,state))continue;
        const wall = side * HALF_WIDTH;
        const d0 = oldZ - wall, d1 = p.z - wall;
        if (d0 * d1 <= 0 || (Math.abs(d1) < bodyRadius && Math.abs(d0) >= Math.abs(d1))) {
          p.z = wall + (d0 >= 0 ? bodyRadius : -bodyRadius);
          velocity.z = 0;
        }
      }
    }
  }
  return p;
}

// Analytic hull intersections avoid sampling gaps and keep rapid-fire weapons inexpensive.
export function firstStationIntersection(a, b, state={}) {
  const d={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  let first=Infinity,info=null;
  const valid=t=>t>1e-7&&t<=1;
  const qa=d.x*d.x+d.y*d.y;
  if(qa>1e-12){
    const qb=2*(a.x*d.x+a.y*d.y);
    for(const patch of state.stationSurfaces||basicSurfaces){
      for(const radius of radiiOf(patch)){
      const qc=a.x*a.x+a.y*a.y-radius*radius,disc=qb*qb-4*qa*qc;
      if(disc<0)continue;
      for(const t of [(-qb-Math.sqrt(disc))/(2*qa),(-qb+Math.sqrt(disc))/(2*qa)]){
        const hitX=a.x+d.x*t,hitY=a.y+d.y*t;
        if(valid(t)&&insidePatch(patch,Math.atan2(hitX,-hitY),a.z+d.z*t)&&t<first){
          const skylight=patch.surface==='roof'&&roofWindowAt(Math.atan2(hitX,-hitY),a.z+d.z*t,state);
          if(skylight&&state.brokenWindows?.has(skylight.key))continue;
          first=t;const x=a.x+d.x*t,y=a.y+d.y*t,sign=Math.hypot(a.x,a.y)>radius?1:-1;
          info={surface:skylight?'window':patch.surface,key:skylight?.key,roof:!!skylight,id:patch.id,label:skylight?'KESTREL / BREACH GLASS':patch.label,normal:{x:x/radius*sign,y:y/radius*sign,z:0},radialSign:sign};
        }
      }
      }
    }
  }
  for(const box of state.stationSolids||[]){const hit=intersectSolid(a,b,box);if(hit&&hit.t<first){first=hit.t;info=hit}}
  if(Math.abs(d.z)>1e-12){
    for(const side of [-HALF_WIDTH,HALF_WIDTH]){
      const t=(side-a.z)/d.z;if(!valid(t))continue;
      const p={x:a.x+d.x*t,y:a.y+d.y*t,z:side},r=Math.hypot(p.x,p.y);
      const angle=polarAngle(p),height=RADIUS-r;
      if(r>RADIUS-HEIGHT&&r<RADIUS&&!openStationSide(angle,side,height,0,state)&&t<first){
        first=t;info={surface:height>2.05&&height<9.05?'window':'frame',key:windowKey(angle,side),normal:{x:0,y:0,z:a.z>side?1:-1}};
      }
    }
  }
  return first===Infinity?null:{x:a.x+d.x*first,y:a.y+d.y*first,z:a.z+d.z*first,t:first,...info};
}
export function hasStationLineOfSight(a, b, state={}) {
  return firstStationIntersection(a,b,state)===null;
}

export function applyDamage(target, damage, multiplier = 1) {
  const shieldDamage = Math.min(target.shield, damage);
  target.shield -= shieldDamage;
  target.health = Math.max(0, target.health - (damage - shieldDamage) * multiplier);
  return target.health <= 0;
}
