// Overgrown wreckage of the old world: the portal landing pad, a crashed escape pod, collapsed arches, a field of
// broken solar panels, a toppled comms mast, a rusted walkway and a footbridge. Everything merges into four meshes.
import * as T from 'three';
import { V, clamp, lerp, ss, rng, vnoise, C, Builder, P, M, tube, card, prim, foliageMaterial, Instances } from './eden-core.js';
import { terrainHeight, pathX, streamZ, WATER_Y, bedHeight, waterLevelAt } from './eden-terrain.js';
import { makeObstacle } from './eden-layout.js';
import { clusterIndexed } from './eden-cull.js';

const roughBox=n=>prim('rbox'+n,()=>{
  let g=new T.BoxGeometry(1,1,1,2,2,2);g.deleteAttribute('uv');g.deleteAttribute('normal');const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=.07;p.setXYZ(i,x+(vnoise(y*5+n,z*5)-.5)*k,y+(vnoise(x*5+n,z*5+3)-.5)*k,z+(vnoise(x*5,y*5+n)-.5)*k)}
  g=g.toNonIndexed();g.computeVertexNormals();return g;
});
const MOSS=C('#4d8f3c'),MOSSD=C('#2f5e2c'),UPN=V(0,1,0),tc=f=>p=>f(p,UPN);
const concrete=(seed,base='#93958d')=>(p,n)=>{
  const c=C(base).lerp(C('#6d706a'),ss(.35,.8,vnoise(p.x*1.1+seed,p.z*1.1+p.y*.9))*.9),g=terrainHeight(p.x,p.z),low=ss(1.4,0,p.y-g),top=ss(.4,.8,n.y);
  c.lerp(C('#3e4a32'),low*.65);c.lerp(MOSS,top*.8*ss(.2,.55,vnoise(p.x*1.8+seed,p.z*1.8)));c.lerp(MOSSD,ss(.7,.9,vnoise(p.x*3+seed*2,p.y*3+p.z))*.35*(1-top));
  return c.multiplyScalar(.88+.2*vnoise(p.x*9,p.z*9+p.y*9));
};
const rust=(seed)=>(p,n)=>{const c=C('#8a4f2e').lerp(C('#5b3a28'),ss(.3,.8,vnoise(p.x*2.4+seed,p.y*2.4+p.z)));c.lerp(C('#c07a3c'),ss(.75,.92,vnoise(p.x*6,p.y*5+seed))*.5);c.lerp(MOSS,ss(.6,.9,n.y)*.45*ss(.3,.7,vnoise(p.x*2+seed,p.z*2)));return c};
const wood=(seed)=>(p,n)=>C('#8b6a45').lerp(C('#4e3b29'),ss(.35,.8,vnoise(p.x*4+seed,p.z*4+p.y*2))*.8).lerp(MOSS,ss(.6,.9,n.y)*.35*ss(.4,.7,vnoise(p.x*2,p.z*2+seed)));

export function buildRuins({scene,U,atlas,obstacles}){
  const matte=new Builder(),sheen=new Builder(),glow=new Builder(),leaf=new Builder(),r=rng(4242),out={meshes:[],sites:{}};
  const solid=(kind,x,y,z,rad,h)=>obstacles.push(makeObstacle(kind,x,y,z,rad,h));
  const gy=(x,z)=>terrainHeight(x,z);
  const blk=(b,x,y,z,sx,sy,sz,{ry=0,rx=0,rz=0,col,seed=0}={})=>b.add(roughBox(seed%4),M(V(x,y,z),V(sx,sy,sz),{x:rx,y:ry,z:rz}),col||concrete(seed),0);
  const rod=(b,a,c,rad,col)=>b.add(P.cyl(5),span(a,c,rad),col,0);
  function span(a,b,r){const d=b.clone().sub(a),len=d.length(),q=new T.Quaternion().setFromUnitVectors(V(0,1,0),d.clone().normalize());return new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,V(r,len,r))}
  const vine=(x,y,z,len,n=V(0,0,1),seed=0)=>{const R=rng(seed*7+1),cnt=Math.max(2,Math.round(len/.55));for(let j=0;j<cnt;j++){const t=j/cnt,c=V(x+(R()-.5)*.25,y-t*len,z+(R()-.5)*.25),cc=C('#3f7d34').lerp(C('#7fb243'),R()*.6);card(leaf,c,n.clone().add(V((R()-.5)*.8,0,(R()-.5)*.8)).normalize(),.55,.7,(R()-.5)*.6,cc,V(0,1,0).lerp(n,.5).normalize(),1)}};
  const ivy=(c,n,w,h,count,seed)=>{const R=rng(seed*13+5),u=V(0,1,0).cross(n).normalize(),v=V(0,1,0);for(let i=0;i<count;i++){const p=c.clone().addScaledVector(u,(R()-.5)*w).addScaledVector(v,(R()-.3)*h).addScaledVector(n,.06+R()*.1);card(leaf,p,n,.7+R()*.4,.7+R()*.4,R()*6.28,C('#356f2e').lerp(C('#79ad40'),R()*.7),n.clone().lerp(V(0,1,0),.3).normalize(),1)}};
  const Y=(x,z)=>gy(x,z);

  // --- arch: two pillars and a broken ring of voussoirs, with fallen blocks
  function arch(x,z,yaw,{span:S=5.6,h=5.6,seed=1,hollow=[4,5]}={}){
    const R=rng(seed*31),ca=Math.cos(yaw),sa=Math.sin(yaw),L=(u,w=0)=>[x+ca*u+sa*w,z-sa*u+ca*w];
    const base=Math.min(Y(...L(-S/2)),Y(...L(S/2)));
    for(const s of [-1,1]){const [px,pz]=L(s*S/2),ph=h-(s>0?R()*1.4:0);blk(matte,px,base+ph/2-.5,pz,1.5,ph+1,1.5,{ry:yaw,seed:seed+s});
      blk(matte,px,base+ph+.1,pz,1.75,.4,1.75,{ry:yaw,seed:seed+3,rz:(R()-.5)*.1});
      for(let k=0;k<3;k++)rod(matte,V(px+(R()-.5)*.8,base+ph,pz+(R()-.5)*.8),V(px+(R()-.5)*1,base+ph+.7+R()*.8,pz+(R()-.5)*1),.045,rust(seed));
      solid('ruin',px,Y(px,pz),pz,.95,ph);vine(px+ca*.8,base+ph,pz-sa*.8,ph*.7,V(sa,0,ca),seed+s);ivy(V(px,base+ph*.45,pz),V(sa,0,ca),1.4,ph*.9,6,seed+s)}
    const cy=base+h-.2,Rr=S/2-.4,N=11;
    for(let i=0;i<=N;i++){
      if(hollow.includes(i)){const [fx,fz]=L(-S/2+S*i/N+(R()-.5)*1.6,(R()-.5)*3);blk(matte,fx,Y(fx,fz)+.35,fz,1.2,.8,1.4,{ry:R()*6,rx:(R()-.5)*.6,seed:seed+i});continue}
      const th=i/N*Math.PI,[vx,vz]=L(-Math.cos(th)*Rr);
      blk(matte,vx,cy+Math.sin(th)*Rr,vz,.9,1.25,1.5,{ry:yaw,rz:Math.PI/2-th,seed:seed+i});
    }
    for(let i=0;i<5;i++){const [fx,fz]=L((R()-.5)*(S+3),(R()-.5)*3.5);blk(matte,fx,Y(fx,fz)+.3,fz,.8+R()*.9,.55+R()*.5,.8+R()*.8,{ry:R()*6,rx:(R()-.5)*.5,rz:(R()-.5)*.4,seed:seed+i});if(i<2)solid('rubble',fx,Y(fx,fz),fz,.8,.7)}
  }
  // --- a broken wall: columns of blocks with a ragged top
  function wall(x,z,yaw,len,seed,hMax=3.2,thick=.8){
    const R=rng(seed*17),ca=Math.cos(yaw),sa=Math.sin(yaw),n=Math.round(len/1.1);
    for(let i=0;i<n;i++){const u=(i/(n-1)-.5)*len,px=x+ca*u,pz=z-sa*u,h=Math.max(.5,hMax*(.35+.65*vnoise(i*.7+seed,seed))*(R()>.82?.4:1)),by=Y(px,pz);
      blk(matte,px,by+h/2-.2,pz,1.15,h+.4,thick,{ry:yaw+(R()-.5)*.08,seed:seed+i});if(R()>.6)blk(matte,px,by+h+.1,pz,.7,.3,thick*.8,{ry:yaw+R(),seed:seed+i+9});
      if(i%3===0)solid('wall',px,by,pz,.85,Math.max(1.4,h))}
    ivy(V(x,Y(x,z)+hMax*.4,z),V(sa,0,ca),len*.8,hMax,Math.round(len*1.5),seed);
  }
  // --- crashed escape pod
  function pod(x,z,yaw){
    const by=Y(x,z),ca=Math.cos(yaw),sa=Math.sin(yaw),tiltX=-.34,tiltZ=.2;
    const prof=[[0,-2.9],[.7,-2.75],[1.35,-2.2],[1.75,-1.2],[1.8,0],[1.7,1.3],[1.35,2.3],[.8,2.85],[0,3.05]].map(([rad,yy])=>new T.Vector2(rad,yy)),lathe=new T.LatheGeometry(prof,18);
    const m=new T.Matrix4().compose(V(x,by+.9,z),new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2+tiltX,yaw,tiltZ,'YXZ')),V(1,1,1));
    sheen.add(lathe,m,(p,n)=>{const l=p.clone().applyMatrix4(m.clone().invert()),stripe=ss(.9,.2,Math.abs(l.y-.4)),scorch=ss(1.2,2.9,-l.y*1.0+1.2)*1.0+ss(.4,.9,vnoise(p.x*3,p.y*3+p.z*3))*.2;
      const c=C('#d5d9d2').lerp(C('#e07b2c'),stripe*.95).lerp(C('#2f2b28'),clamp(scorch,0,1)*.8);c.lerp(MOSS,ss(.7,.95,n.y)*.5*ss(.35,.7,vnoise(p.x*2,p.z*2)));return c},0);
    // hatch: dark opening with an open door
    const hatchPos=V(x+ca*.2,by+1.85,z-sa*.2).add(V(sa*1.2,0,ca*1.2)).add(V(0,.15,0));
    sheen.add(P.box(),M(hatchPos,V(.9,.12,1.2),{y:yaw+.2,x:tiltX*.5}),C('#1c2326'),0);
    sheen.add(P.box(),M(hatchPos.clone().add(V(-sa*.9,.5,-ca*.9)),V(.08,1.3,1.0),{y:yaw,z:.9}),C('#cbd0c9'),0);
    for(const s of [-1,1])rod(matte,V(x+ca*s*1.6,by+.2,z-sa*s*1.6),V(x+ca*s*2.7,by+1.6,z-sa*s*2.7+1),.09,rust(3));
    glow.add(P.sphere(6,4),M(V(x-sa*1.6,by+2.2,z-ca*1.6),.1),C('#ff5a3a').multiplyScalar(3),0);
    // furrow of torn earth behind the pod and parachute remains
    for(let i=0;i<9;i++){const u=-4-i*1.3,px=x-sa*u*-1+(r()-.5)*2,pz=z-ca*u*-1+(r()-.5)*2;blk(matte,px,Y(px,pz)+.15,pz,.8+r()*.8,.4,.8+r()*.6,{ry:r()*6,col:()=>C('#5a4630').lerp(C('#3f5a2e'),r()*.6),seed:i})}
    const pc=V(x+ca*5.2,by,z-sa*5.2);
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,a2=(i+1)/10*Math.PI*2,rad=3+r()*1.4,p0=pc.clone().add(V(Math.cos(a)*rad,.08+r()*.5,Math.sin(a)*rad*.7)),p1=pc.clone().add(V(Math.cos(a2)*(rad+.5),.08+r()*.5,Math.sin(a2)*rad*.7)),pk=pc.clone().add(V((r()-.5)*.8,.35+r()*.5,(r()-.5)*.8)),cc=i%2?C('#e9e6dc'):C('#e07b2c').multiplyScalar(.9),nn=V(0,1,0);
      for(const q of [p0,p1,pk])q.y=Math.max(q.y,Y(q.x,q.z)+.1+r()*.05);
      const ia=matte.vert(p0,nn,cc,0),ib=matte.vert(p1,nn,cc,0),ic=matte.vert(pk,nn,cc,0);matte.tri(ia,ib,ic);matte.tri(ia,ic,ib)}
    solid('pod',x,by,z,2.1,3);
    ivy(V(x,by+1,z),V(sa,0,ca),3,2.5,8,9);
  }
  // --- solar panels, in rows, many knocked askew
  function solarField(x,z,yaw,cols=5,rows=3){
    // 24x16 segments with the vertex columns/rows snapped next to the cell lines the colour function draws (it used to be a uniform 36x24 box,
    // 3.6k triangles per panel): the grid lines and the border stay as sharp as before, the soft noise is sampled a little more coarsely.
    const panelGeo=prim('solar-panel',()=>{
      const g=new T.BoxGeometry(1,1,1,24,1,16),p=g.attributes.position,MAP=[0,.1,.5,.9,1],snap=(v,cells)=>{const ti=Math.round((v+.5)*cells*4),c=Math.min(cells-1,Math.floor(ti/4));return (c+MAP[ti-c*4])/cells-.5};
      for(let i=0;i<p.count;i++)p.setXYZ(i,snap(p.getX(i),6),p.getY(i),snap(p.getZ(i),4));
      g.computeVertexNormals();return g;
    });
    const R=rng(91),ca=Math.cos(yaw),sa=Math.sin(yaw);
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      if(R()<.12)continue;
      const u=(i-cols/2)*4.1,w=(j-rows/2)*5.2,px=x+ca*u+sa*w,pz=z-sa*u+ca*w,by=Y(px,pz),broken=R()<.3,tilt=.52+(broken?(R()-.3)*.7:0),fall=R()<.12,ry=yaw+(R()-.5)*(broken?.7:.08);
      const base=V(px,by+(fall?.25:1.1),pz),m=new T.Matrix4().compose(base,new T.Quaternion().setFromEuler(new T.Euler(fall?-.12:-tilt,ry,fall?.15:(broken?(R()-.5)*.4:0),'YXZ')),V(3.5,.07,2.1));
      sheen.add(panelGeo,m,(p,n)=>{const l=p.clone().applyMatrix4(m.clone().invert()),cellX=Math.abs(((l.x+.5)*6)%1-.5),cellZ=Math.abs(((l.z+.5)*4)%1-.5),line=ss(.4,.5,Math.max(cellX,cellZ))*(n.y>.5?1:0),edge=ss(.44,.5,Math.max(Math.abs(l.x),Math.abs(l.z))*1);
        const c=C('#182c4a').lerp(C('#2f4f7d'),vnoise(p.x*3,p.z*3)*.5);c.lerp(C('#9aa3a6'),Math.max(line,edge)*.9);if(n.y>.5)c.lerp(MOSS,ss(.3,.8,vnoise(p.x*2,p.z*2))*.5*(broken?1:.35));return c},0);
      if(!fall){rod(matte,V(px,by-.2,pz),V(px,by+1.3,pz),.07,rust(i+j));rod(matte,V(px,by+1.1,pz),V(px+Math.sin(ry)*-1,by+.1,pz+Math.cos(ry)*-1),.045,rust(2))}
      if(broken)for(let k=0;k<3;k++)blk(sheen,px+(R()-.5)*2.5,Y(px,pz)+.12,pz+(R()-.5)*2.5,.5+R()*.4,.05,.4+R()*.4,{ry:R()*6,col:C('#223a5e'),seed:k});
      if((i+j)%3===0)solid('solar',px,by,pz,.5,1.2);
    }
  }
  // --- toppled lattice mast lying across the meadow
  function mast(ax,az,bx,bz){
    const A=V(ax,Y(ax,az)+1.4,az),B=V(bx,Y(bx,bz)+.6,bz),len=A.distanceTo(B),segs=Math.round(len/2.2),dir=B.clone().sub(A).normalize(),side=V(-dir.z,0,dir.x).normalize(),upv=V(0,1,0),R=rng(33);
    const rad=.7,legs=[0,1,2].map(k=>{const a=k/3*Math.PI*2;return side.clone().multiplyScalar(Math.cos(a)*rad).addScaledVector(upv,Math.sin(a)*rad)});
    const pt=(t,k)=>{const base=A.clone().lerp(B,t);base.y+=Math.sin(t*Math.PI)*1.1-(t>.6?(t-.6)*1.4:0);return base.clone().add(legs[k])};
    for(let k=0;k<3;k++){const pts=[];for(let i=0;i<=segs;i++)pts.push(pt(i/segs,k));tube(matte,pts,.11,{sides:5,color:tc(rust(k+7))})}
    for(let i=0;i<=segs;i++){const t=i/segs;for(let k=0;k<3;k++){rod(matte,pt(t,k),pt(t,(k+1)%3),.045,rust(i));if(i<segs){rod(matte,pt(t,k),pt(t+1/segs,(k+1)%3),.04,rust(i+k))}}}
    // dish antenna lying beside it, and cable ends
    const dc=B.clone().add(side.clone().multiplyScalar(2.6));dc.y=Y(dc.x,dc.z)+.8;
    sheen.add(new T.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI*.38),new T.Matrix4().compose(dc,new T.Quaternion().setFromEuler(new T.Euler(1.2,.4,0)),V(1.7,1.7,1.7)),(p,n)=>C('#bfc3bd').lerp(C('#6a5a45'),ss(.4,.8,vnoise(p.x*3,p.z*3))*.6).lerp(MOSS,ss(.55,.9,n.y)*.4),0);
    for(const t of [.05,.5,.95]){const p=A.clone().lerp(B,t);solid('mast',p.x,Y(p.x,p.z),p.z,.9,2.2)}
    vine(A.x+dir.x*8,A.y+1.4,A.z+dir.z*8,2.4,side,3);vine(A.x+dir.x*18,A.y+1.2,A.z+dir.z*18,2,side,4);
  }
  // --- elevated rusted walkway on legs, sagging in the middle
  function walkway(x,z,yaw,len=16,w=2.4){
    const R=rng(57),ca=Math.cos(yaw),sa=Math.sin(yaw),n=Math.round(len/1.6),H=2.6,L=(u,v=0)=>[x+ca*u-sa*v,z-sa*u-ca*v];
    for(let i=0;i<n;i++){
      const u=(i/(n-1)-.5)*len,[px,pz]=L(u),by=Y(px,pz),sag=i>n*.4&&i<n*.62?-1.5-R()*.8:0,gone=i===Math.floor(n*.5)&&R()>.2;
      if(!gone)blk(matte,px,by+H+sag,pz,1.55,.12,w,{ry:yaw,rz:sag?(R()-.5)*.25:0,col:rust(i),seed:i});
      if(i%3===0){for(const s of [-1,1]){const [lx,lz]=L(u,s*(w/2-.1));rod(matte,V(lx,by-.3,lz),V(lx,by+H+sag-.05,lz),.07,rust(i))}
        if(!sag){const q0=L(u,-w/2),q1=L(u,w/2);rod(matte,V(q0[0],by+H*.55,q0[1]),V(q1[0],by+H*.55,q1[1]),.04,rust(2))}}
      if(i%2===0&&!sag&&R()>.2)for(const s of [-1,1]){const [lx,lz]=L(u,s*(w/2-.05));rod(matte,V(lx,by+H+.05,lz),V(lx,by+H+1.0,lz),.035,rust(i))}
      if(!sag)for(const s of [-1,1]){const [lx,lz]=L(u,s*(w/2-.05)),[lx2,lz2]=L(u+1.6,s*(w/2-.05));if(R()>.15)rod(matte,V(lx,by+H+1.0,lz),V(lx2,by+H+1.0,lz2),.035,rust(i))}
    }
    for(const s of [-1,1]){const [px,pz]=L(s*len/2);blk(matte,px,Y(px,pz)+.5,pz,2.6,1.4,2.8,{ry:yaw,seed:5+s});solid('plinth',px,Y(px,pz),pz,1.6,1.4)}
    for(let i=0;i<5;i++){const u=(R()-.5)*len*.4,[px,pz]=L(u,(R()-.5)*3),b=Y(px,pz);blk(matte,px,b+.3,pz,1+R(),.5,.6,{ry:R()*6,rz:(R()-.5)*.5,col:rust(i),seed:i})}
    {const [vx,vz]=L(-len*.2,w/2);vine(vx,Y(vx,vz)+H+1,vz,3,V(0,0,1),3)}
  }
  // --- portal landing pad, pylons and guide lights
  function portalPad(x,z){
    const by=Y(x,z);
    matte.add(new T.CylinderGeometry(7.2,7.5,.5,28),M(V(x,by-.05,z)),(p,n)=>{const c=C('#6f7570').lerp(C('#505751'),vnoise(p.x*1.5,p.z*1.5)*.8);if(n.y>.5){c.lerp(MOSS,ss(.35,.8,vnoise(p.x*.9+2,p.z*.9))*.8*ss(2.5,7,Math.hypot(p.x-x,p.z-z)));const rr=Math.hypot(p.x-x,p.z-z);c.lerp(C('#25312f'),ss(.12,0,Math.abs(rr-4.4))*.6)}return c},0);
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;glow.add(P.box(),M(V(x+Math.cos(a)*5.6,by+.24,z+Math.sin(a)*5.6),V(.5,.05,.16),{y:-a}),C('#6ff7d0').multiplyScalar(i%3===0?.15:2.2),0)}
    for(const [s,dx,dz,hh] of [[-1,-9.4,-1.2,5.4],[1,6.6,-2.2,3.8]]){const px=x+dx,pz=z+dz,h=hh;blk(matte,px,Y(px,pz)+h/2-.3,pz,1.25,h+.6,1.25,{seed:s+4});for(let k=0;k<3;k++)rod(matte,V(px+(R()-.5)*.6,Y(px,pz)+h,pz),V(px+(R()-.5)*.8,Y(px,pz)+h+.9,pz+(R()-.5)*.6),.05,rust(2));solid('pylon',px,Y(px,pz),pz,.9,h);vine(px,Y(px,pz)+h,pz+.7,h*.7,V(0,0,1),s+10);ivy(V(px,Y(px,pz)+h*.4,pz),V(0,0,1),1.2,h*.9,5,s+3)}
    function R(){return r()}
  }
  // --- footbridge across the stream
  function bridge(x){
    const zc=streamZ(x),a=Y(x,zc-6.5),b=Y(x,zc+6.5),deck=Math.max(a,b)+.55,len=13.5,planks=22,R=rng(88);
    for(let i=0;i<planks;i++){if(R()<.07)continue;const z=zc-len/2+i*(len/planks)+.3;blk(matte,x,deck,z,2.1,.12,len/planks*.9,{ry:(R()-.5)*.03,col:wood(i),seed:i})}
    for(const s of [-1,1]){tube(matte,[V(x+s*1.0,deck-.14,zc-len/2),V(x+s*1.0,deck-.14,zc+len/2)],.1,{sides:5,color:tc(wood(5))});
      for(let i=0;i<=6;i++){const z=zc-len/2+i*len/6;if(R()<.15)continue;rod(matte,V(x+s*1.0,deck,z),V(x+s*1.0,deck+1.05,z),.06,wood(i))}
      tube(matte,[V(x+s*1.0,deck+1.0,zc-len/2),V(x+s*1.0,deck+1.05,zc),V(x+s*1.0,deck+.95,zc+len/2-2)],.05,{sides:4,color:tc(wood(2))})}
    for(const z of [zc-len/2-.2,zc+len/2+.2]){blk(matte,x,Y(x,z)+.1,z,2.6,.5,1,{col:concrete(2),seed:1})}
    vine(x+1.0,deck+1,zc+1,1.6,V(1,0,0),9);
    // the deck is solid: a row of short pillars from the bed up to the planks, so a mech walks across and stands on the bridge
    for(let z=zc-len/2+.35;z<=zc+len/2-.3;z+=1){const base=Y(x,z)-.3;solid('bridge',x,base,z,1.2,deck+.06-base)}
    return {x,deck,zc};
  }
  // --- scattered old-world debris
  function debris(){
    const R=rng(555);
    const barrels=[[-9,-30],[26,3],[-34,70],[16,-20],[-9,24]];
    for(const [bx,bz] of barrels){const by=Y(bx,bz),tip=R()>.5;matte.add(new T.CylinderGeometry(.5,.5,1.1,9),M(V(bx,by+(tip?.5:.55),bz),1,tip?{z:Math.PI/2.3,y:R()*6}:{y:R()*6}),rust(bx),0);if(!tip)solid('barrel',bx,by,bz,.55,1.1)}
    for(let i=0;i<22;i++){const x=-60+R()*110,z=-50+R()*120;if(Math.abs(x-pathX(z))<3||Y(x,z)<WATER_Y+.8||Math.hypot(x,z+44)<8)continue;const kind=i%3;
      if(kind===0)blk(matte,x,Y(x,z)+.25,z,1+R()*1.6,.4+R()*.5,.8+R()*1.2,{ry:R()*6,rz:(R()-.5)*.4,seed:i});
      else if(kind===1){const a=V(x,Y(x,z)+.4,z),b=a.clone().add(V((R()-.5)*3,.2,(R()-.5)*3));rod(matte,a,b,.13,rust(i))}
      else blk(matte,x,Y(x,z)+.2,z,1.5,.08,1,{ry:R()*6,rx:(R()-.5)*.4,col:rust(i),seed:i})}
  }

  // layout (hand placed; verified against spawn/archive/path keep-clear zones in tests)
  portalPad(0,-53);
  pod(-19,-24,.6);
  walkway(17,-6,.28);
  const br=bridge(-24);
  mast(-54,16,-33,42);
  solarField(-42,60,.18);
  arch(-20,47,1.45,{seed:1});
  arch(-19.5,66,1.75,{seed:2,hollow:[3,4,5]});
  wall(22,52,.2,10,3);
  wall(-9,43,.3,6,6,2.4);
  arch(55,-26,.7,{seed:4,span:6.4,h:6.4});
  wall(60,60,-.4,14,7,3.6);
  wall(-80,-30,.9,12,8,3.4);
  debris();

  const matteMat=foliageMaterial(U,{mode:'none',roughness:.96,tinted:false,flat:true});
  const sheenMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.4,metalness:.35});
  const glowMat=new T.MeshBasicMaterial({vertexColors:true});
  const leafMat=foliageMaterial(U,{mode:'tree',amp:.04,alpha:atlas,side:T.DoubleSide});
  for(const [b,mat,name,cast] of [[matte,matteMat,'ruins-matte',true],[sheen,sheenMat,'ruins-sheen',true],[glow,glowMat,'ruins-glow',false],[leaf,leafMat,'ruins-vines',false]]){
    if(!b.count)continue;const g=b.build(),m=new T.Mesh(g,mat);m.name=name;m.castShadow=cast;m.receiveShadow=true;m.frustumCulled=false;m.userData.cull={clusters:clusterIndexed(g,20)};scene.add(m);out.meshes.push(m);
  }
  out.glowMat=glowMat;out.bridge=br;
  out.sites=[{x:0,z:-53,r:10},{x:-19,z:-24,r:8},{x:17,z:-6,r:11},{x:-24,z:streamZ(-24),r:9},{x:-43,z:29,r:19},{x:-42,z:60,r:14},{x:-20,z:47,r:6},{x:-19.5,z:66,r:6},{x:22,z:52,r:7},{x:-9,z:43,r:5},{x:55,z:-26,r:7},{x:60,z:60,r:9},{x:-80,z:-30,r:8}];
  return out;
}
