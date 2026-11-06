// Eden's living layer: four tree species, shrubs, ferns, grass, wildflowers, mushrooms, reeds, logs and boulders.
// Every species is one merged geometry drawn as one InstancedMesh with per-instance scale/rotation/tint.
import * as T from 'three';
import { V, clamp, lerp, ss, rng, vnoise, fbm, C, Builder, P, M, tube, card, blobGeo, rockGeo, Instances, foliageMaterial, span } from './eden-core.js';
import { terrainHeight, terrainNormal, pathX, inStream, inPond, nearWater, forestAmount, WATER_Y, streamZ, STREAM, POND, PATH } from './eden-terrain.js';
import { solidOk, inFight, Occupancy, makeObstacle, PATH_HALF, keepDistance } from './eden-layout.js';
import { prismParts, domeParts, compoundObstacle } from './eden-solids.js';
import { skirtProfile, treeParts, attachParts, walkReach } from './tree-collision.js';

const up=V(0,1,0);
const col={
  barkA:C('#6a5238'),barkB:C('#3f3023'),pineBark:C('#74503a'),birch:C('#ece7da'),birchMark:C('#2a2521'),willowBark:C('#6e5e48'),moss:C('#4b8a3a'),
  oakD:C('#2d5a26'),oakL:C('#86b941'),pineD:C('#1d4a30'),pineL:C('#4b8b4a'),birchD:C('#5f9a36'),birchL:C('#b8d160'),willD:C('#6c9a3e'),willL:C('#b8cf6a'),
  stone:C('#8d887c'),stoneD:C('#5f5b53'),stoneL:C('#aaa392'),lichen:C('#a9b58a'),
};
const rnd=(r,a,b)=>a+(b-a)*r();
const unit=r=>{const a=r()*Math.PI*2,y=r()*2-1,s=Math.sqrt(1-y*y);return V(Math.cos(a)*s,y,Math.sin(a)*s)};

export function barkColor(seed,base,dark,moss=0){
  return (p,t,a)=>{const n=vnoise(a*5+seed,p.y*.8),c=base.clone().lerp(dark,ss(.35,.8,n)*.8);if(moss&&t<.35)c.lerp(col.moss,(1-t/.35)*moss*ss(.3,.7,vnoise(a*3+seed*2,p.y*2)));return c};
}
function leafShade(center,radius,dark,light,seed,k=1){
  return p=>{const t=clamp((p.y-center.y)/radius,-1,1),n=vnoise(p.x*.9+seed,p.z*.9+p.y*.7);const c=dark.clone().lerp(light,ss(-.9,.95,t)*.85+n*.3-.1);return c.multiplyScalar(k)};
}
// A canopy lump: lumpy ellipsoid plus a fringe of leafy cards that stick out of it.
export function canopy(b,center,rx,ry,rz,dark,light,r,{cards=16,cardSize=1.6,detail=2,amp=.2,seed=1,bias=.25,region=0,lod=0}={}){
  // lod 1: one icosphere subdivision fewer and every other leaf card (a bit bigger), drawing the same random numbers so the shape lines up with lod 0
  const g=blobGeo(lod?Math.max(0,detail-1):detail,amp,seed%4),shade=leafShade(center,ry,dark,light,seed);
  b.blobs?.push({c:center.clone(),rx,ry,rz});
  b.add(g,M(center,V(rx,ry,rz),{y:r()*6}),shade,1);
  for(let i=0;i<cards;i++){
    const n=unit(r);n.y=n.y*.8+bias;n.normalize();
    const tn=n.clone().add(V((r()-.5)*.9,(r()-.5)*.5,(r()-.5)*.9)).normalize(),s=cardSize*(.75+r()*.5),
      c=V(center.x+n.x*rx*.98+tn.x*s*.22,center.y+n.y*ry*.98+tn.y*s*.22,center.z+n.z*rz*.98+tn.z*s*.22),ln=n.clone().lerp(up,.4).normalize(),
      cc=shade(c).multiplyScalar(.88+r()*.3).lerp(light,.12),h=s*(.9+r()*.3),roll=r()*6.28;
    if(!lod||i%2===0)card(b,c,tn,s*(lod?1.3:1),h*(lod?1.3:1),roll,cc,ln,1,region);
  }
}
function flatTri(b,p0,p1,p2,c0,c1,c2,tint=1){
  const n=p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize(),a=b.vert(p0,n,c0,tint),d=b.vert(p1,n,c1,tint),e=b.vert(p2,n,c2,tint);b.tri(a,d,e);
}
export function limb(b,from,to,r0,r1,r,color,sides=5,bow=.18,seg=6){
  const mid=from.clone().lerp(to,.5);mid.y+=from.distanceTo(to)*bow;mid.x+=(r()-.5)*.8;mid.z+=(r()-.5)*.8;
  const curve=new T.QuadraticBezierCurve3(from,mid,to),pts=curve.getPoints(seg);tube(b,pts,[r0,r1],{sides,color});return pts;
}
export function roots(b,r,h,count,reach,color,seed,skip=false){
  for(let i=0;i<count;i++){const a=i/count*6.28+r()*.6;if(skip)continue;const pts=[V(Math.cos(a)*.25,h,Math.sin(a)*.25),V(Math.cos(a)*reach*.55,h*.35,Math.sin(a)*reach*.55),V(Math.cos(a)*reach,-.25,Math.sin(a)*reach)];tube(b,new T.CatmullRomCurve3(pts).getPoints(6),t=>lerp(.34,.07,t)*(h>1?1.3:1),{sides:5,color})}
}

// ---------------------------------------------------------------- species geometry
// lod 1 (beyond ~50 m): 6-sided trunk, no roots, 4-sided limbs, one icosphere level fewer per canopy lump and half the leaf cards.
// Same random draws as lod 0, so the silhouette matches (about 2000 -> 900 triangles).
export function oakGeometry(seed,{hero=false,lod=0}={}){
  const r=rng(seed*131+7),b=new Builder(),H=(hero?6.2:4.2)+r()*1.2,k=hero?1.5:1;
  const trunk=[];for(let i=0;i<=9;i++){const t=i/9;trunk.push(V(Math.sin(t*2.2+seed)*.35*t*k,t*H,Math.cos(t*1.7+seed)*.35*t*k))}
  tube(b,trunk,t=>lerp(.95,.55,t)*k*(1+.5*Math.pow(1-t,7)),{sides:lod?6:10,color:barkColor(seed,col.barkA,col.barkB,.7)});
  roots(b,r,H*.12,hero?8:5,hero?4.4:2.8,barkColor(seed,col.barkA,col.barkB,.9),seed,!!lod);
  const top=trunk[8],ends=[],nL=hero?7:4+(r()>.5?1:0);
  for(let i=0;i<nL;i++){
    const a=i/nL*6.28+r()*.7,len=(hero?6:3.4)+r()*(hero?3:2.4),to=V(top.x+Math.cos(a)*len,H+(hero?3.4:2.2)+r()*(hero?4:3),top.z+Math.sin(a)*len);
    limb(b,V(top.x,H*.78+r()*H*.1,top.z),to,.46*k,.12*k,r,barkColor(seed+i,col.barkA,col.barkB),lod?4:5,.18,lod?3:6);ends.push(to)
  }
  const lights=[col.oakL,col.oakL.clone().lerp(C('#c6d65a'),.4)],blobs=[];
  const tc=V(top.x,H+(hero?7:4.4),top.z);blobs.push([tc,hero?5.4:3.7,hero?4.2:2.9]);
  for(const e of ends)blobs.push([e.clone().add(V(0,.6,0)),(hero?4.2:2.9)+r()*1,(hero?3.2:2.3)+r()*.6]);
  if(hero)for(let i=0;i<6;i++){const a=i/6*6.28+.5;blobs.push([V(top.x+Math.cos(a)*7.5,H+3.4+r()*2.5,top.z+Math.sin(a)*7.5),3.6,2.8])}
  blobs.push([V(top.x,H+(hero?3:1.8),top.z),hero?4.6:3.1,hero?3:2.2]);
  blobs.forEach(([c,rx,ry],i)=>canopy(b,c,rx,ry,rx*(.85+r()*.2),col.oakD,lights[i%2],r,{cards:hero?26:15,cardSize:hero?2.2:1.7,seed:seed+i,lod}));
  // a couple of hanging vines under the lowest blobs
  for(let i=0;i<(hero?9:2);i++){const e=ends[i%ends.length]||tc,a=r()*6.28,s=V(e.x+Math.cos(a)*1.5,e.y-.4,e.z+Math.sin(a)*1.5);
    if(!lod)for(let j=0;j<4;j++)card(b,s.clone().add(V(0,-j*.8-.4,0)),V(Math.cos(a),0,Math.sin(a)),.7,1.1,0,col.oakD.clone().lerp(col.oakL,.25),V(0,1,0).lerp(V(Math.cos(a),0,Math.sin(a)),.4).normalize(),1)}
  return {geo:b.build(),height:H+(hero?10:7),spread:hero?12:7,shape:{h:H,trunk:t=>lerp(.95,.55,t)*k*(1+.5*Math.pow(1-t,7)),blobs:b.blobs}};
}
export function pineGeometry(seed,{slim=false}={}){
  const r=rng(seed*57+11),b=new Builder(),H=slim?20:15+r()*3;
  const trunk=[];for(let i=0;i<=7;i++){const t=i/7;trunk.push(V(Math.sin(t*1.7+seed)*.18*t,t*H,Math.cos(t*2.1+seed)*.18*t))}
  tube(b,trunk,t=>lerp(.62,.07,Math.pow(t,.85)),{sides:6,color:barkColor(seed,col.pineBark,col.barkB)});
  const tiers=slim?11:9,tipC=col.pineL.clone().lerp(C('#8ec06a'),.15),skirts=[];
  for(let i=0;i<tiers;i++){
    const t=i/(tiers-1),y0=lerp(2.6,H*.95,Math.pow(t,.92)),R=lerp(slim?2.4:3.6,.55,Math.pow(t,.85))*(.9+r()*.2),hh=lerp(slim?4.2:4.6,2.1,t),M_=9,
      apex=V(0,y0+hh,0),inner=[],outer=[];
    for(let k=0;k<M_;k++){const a=k/M_*6.28+i*.7+r()*.3,ro=R*(.72+r()*.4),ri=R*.42;
      outer.push(V(Math.cos(a)*ro,y0-.55*(.4+r()*.8)*(1-t*.5),Math.sin(a)*ro));inner.push(V(Math.cos(a+.35)*ri,y0+hh*.32,Math.sin(a+.35)*ri))}
    skirts.push({y0:y0-.45,y1:y0+hh,mid:y0+hh*.32,R}); // widest just under the tier's lower edge, narrowing through the inner ring to the tip
    const dk=col.pineD.clone().multiplyScalar(.75+r()*.15),md=col.pineD.clone().lerp(col.pineL,.4+t*.2),lt=tipC;
    for(let k=0;k<M_;k++){const k2=(k+1)%M_;
      flatTri(b,apex,inner[k],inner[k2],lt,md,md);
      flatTri(b,inner[k],outer[k],outer[k2],md,dk,dk);flatTri(b,inner[k],outer[k2],inner[k2],md,dk,md);
      flatTri(b,V(0,y0-.2,0),outer[k2],outer[k],dk.clone().multiplyScalar(.6),dk.clone().multiplyScalar(.7),dk.clone().multiplyScalar(.7));
    }
  }
  const skirt=skirtProfile(skirts);
  return {geo:b.build(),height:H+2,spread:slim?5:7,shape:{h:H,trunk:t=>lerp(.62,.07,Math.pow(t,.85)),skirt:y=>skirt.radius(y),skirtTop:skirt.top}};
}
export function birchGeometry(seed){
  const r=rng(seed*79+3),b=new Builder(),H=8.5+r()*3,lean=(r()-.5)*.8;
  const trunk=[];for(let i=0;i<=8;i++){const t=i/8;trunk.push(V(Math.sin(t*2.3+seed)*.3*t+lean*t*t,t*H,Math.cos(t*1.9+seed)*.25*t))}
  tube(b,trunk,t=>lerp(.27,.07,t),{sides:7,color:(p,t,a)=>{const n=vnoise(a*4+seed,p.y*3.4),band=vnoise(p.y*5.2+seed,a*.4);return col.birch.clone().lerp(col.birchMark,ss(.7,.85,n)*.9+ss(.82,.9,band)*.7)}});
  const ends=[];
  for(let i=0;i<5;i++){const a=r()*6.28,y=H*(.5+r()*.45),from=trunk[Math.round(y/H*8)].clone(),to=from.clone().add(V(Math.cos(a)*(1.4+r()*1.4),1.4+r()*1.6,Math.sin(a)*(1.4+r()*1.4)));limb(b,from,to,.09,.04,r,col.birch,4,.1);ends.push(to)}
  const top=trunk[8];ends.push(V(top.x,H+.6,top.z));
  ends.forEach((e,i)=>canopy(b,e.clone().add(V(0,.5,0)),1.5+r()*.6,1.2+r()*.4,1.5+r()*.6,col.birchD,col.birchL,r,{cards:20,cardSize:1.35,detail:1,amp:.28,seed:seed+i,bias:.1,region:1}));
  return {geo:b.build(),height:H+3,spread:5,shape:{h:H,trunk:t=>lerp(.27,.07,t),blobs:b.blobs}};
}
export function willowGeometry(seed){
  const r=rng(seed*43+9),b=new Builder(),H=3.6+r()*.8;
  const trunk=[];for(let i=0;i<=6;i++){const t=i/6;trunk.push(V(Math.sin(t*2+seed)*.5*t+.4*t*t,t*H,Math.cos(t*1.5)*.3*t))}
  tube(b,trunk,t=>lerp(.8,.5,t)*(1+.5*Math.pow(1-t,6)),{sides:8,color:barkColor(seed,col.willowBark,col.barkB,.5)});
  roots(b,r,.5,4,2.3,barkColor(seed,col.willowBark,col.barkB,.8),seed);
  const top=trunk[6],ends=[];
  for(let i=0;i<4;i++){const a=i/4*6.28+r(),len=2.4+r()*1.6,to=V(top.x+Math.cos(a)*len,H+1.6+r()*1.6,top.z+Math.sin(a)*len);limb(b,V(top.x,H*.8,top.z),to,.4,.12,r,barkColor(seed+i,col.willowBark,col.barkB),5);ends.push(to)}
  canopy(b,V(top.x,H+2.6,top.z),4.6,2.3,4.4,col.willD,col.willL,r,{cards:24,cardSize:1.5,seed,region:1});
  for(const e of ends)canopy(b,e.clone().add(V(0,.5,0)),2.4,1.5,2.4,col.willD,col.willL,r,{cards:14,cardSize:1.4,detail:1,seed:seed+3,region:1});
  // drooping curtains of fine fronds
  const strands=70;
  for(let i=0;i<strands;i++){
    const a=i/strands*6.28+r()*.2,rad=2.4+r()*3,x=top.x+Math.cos(a)*rad,z=top.z+Math.sin(a)*rad,y0=H+2.1+r()*1.1-rad*.15,len=3.4+r()*2.6,n=V(Math.cos(a),0,Math.sin(a)),cnt=4;
    for(let j=0;j<cnt;j++){const t=j/cnt,y=y0-t*len,sw=Math.sin(t*3+i)*.1,c=V(x+n.x*(t*.3)+sw,y-len/cnt*.5,z+n.z*(t*.3)),cc=col.willD.clone().multiplyScalar(.95).lerp(col.willL,.15+.4*(1-t)+r()*.2);
      card(b,c,n.clone().add(V((r()-.5)*.7,0,(r()-.5)*.7)).normalize(),.95,len/cnt*1.1,(r()-.5)*.2,cc,V(0,1,0).lerp(n,.5).normalize(),1,1)}
  }
  // the drooping frond curtains stay soft on purpose: a mech pushes through them, but the trunk and the leafy crown are solid
  return {geo:b.build(),height:H+6,spread:11,shape:{h:H,trunk:t=>lerp(.8,.5,t)*(1+.5*Math.pow(1-t,6)),blobs:b.blobs}};
}
export function deadTreeGeometry(seed){
  const r=rng(seed*13+1),b=new Builder(),H=6+r()*3,trunk=[];
  for(let i=0;i<=7;i++){const t=i/7;trunk.push(V(Math.sin(t*2+seed)*.3*t,t*H,Math.cos(t*1.5+seed)*.2*t))}
  tube(b,trunk,t=>lerp(.55,.12,t),{sides:7,color:barkColor(seed,C('#8c7d68'),C('#4c4034'),.2),cap:true});
  roots(b,r,.6,5,2.2,barkColor(seed,C('#8c7d68'),C('#4c4034')),seed);
  for(let i=0;i<4;i++){const a=r()*6.28,y=H*(.45+r()*.45),from=trunk[Math.round(y/H*7)].clone(),to=from.clone().add(V(Math.cos(a)*(1.5+r()*2),.6+r()*1.6,Math.sin(a)*(1.5+r()*2)));limb(b,from,to,.14,.04,r,barkColor(seed,C('#8c7d68'),C('#4c4034')),4,.05)}
  return {geo:b.build(),height:H,spread:3,shape:{h:H,trunk:t=>lerp(.55,.12,t)}};
}

export function shrubGeometry(seed,{flowers=null}={}){
  const r=rng(seed*29+5),b=new Builder(),n=4+Math.floor(r()*3);
  for(let i=0;i<n;i++){const a=i/n*6.28+r(),d=i?.55+r()*.5:0,c=V(Math.cos(a)*d,.55+r()*.35,Math.sin(a)*d),s=.55+r()*.4;canopy(b,c,s,s*.8,s,col.oakD.clone().multiplyScalar(.9),col.oakL.clone().lerp(C('#6ca03a'),.4),r,{cards:7,cardSize:.9,detail:1,amp:.25,seed:seed+i,bias:.1})}
  if(flowers)for(let i=0;i<14;i++){const p=unit(r);p.y=Math.abs(p.y)*.7+.15;const c=V(p.x*.95,.9+p.y*.7,p.z*.95);b.add(P.ico(0),M(c,.11+r()*.05),flowers.clone().lerp(C('#ffffff'),r()*.25),0)}
  return {geo:b.build(),height:2};
}
export function fernGeometry(seed){
  const r=rng(seed*17+3),b=new Builder(),fronds=9;
  for(let i=0;i<fronds;i++){
    const a=i/fronds*6.28+r()*.4,len=1.0+r()*.5,seg=7,lift=.5+r()*.5,ca=Math.cos(a),sa=Math.sin(a),ids=[];
    const pt=t=>V(ca*len*t,Math.sin(t*Math.PI*.75)*lift*.9+(.12*(1-t))-t*t*.22+.05,sa*len*t);
    for(let j=0;j<=seg;j++){
      const t=j/seg,p=pt(t),w=Math.sin(Math.min(1,t*1.15)*Math.PI)**.7*.34*(1-t*.3)+.015,side=V(-sa,0,ca),zig=(j%2?.82:1),
        c=col.oakD.clone().lerp(C('#5fa23c'),.4+t*.5);
      const n=V(0,1,0).lerp(V(ca,0,sa),.25).normalize();
      ids.push([b.vert(p.clone().addScaledVector(side,w*zig).add(V(0,-.05*t,0)),n,c,1),b.vert(p.clone().addScaledVector(side,-w*zig).add(V(0,-.05*t,0)),n,c,1)]);
    }
    for(let j=0;j<seg;j++){b.tri(ids[j][0],ids[j+1][0],ids[j][1]);b.tri(ids[j][1],ids[j+1][0],ids[j+1][1])}
  }
  return {geo:b.build()};
}
// lod 0: curved 3-segment blades. lod 1 (clumps beyond ~35 m, where a blade is a couple of pixels wide): one tapered triangle for every
// other blade (drawn wider to keep the clump's mass), built from the same random draws so the clump keeps its layout.
export function grassGeometry(seed,{tall=false,lod=0}={}){
  const r=rng(seed*7+1),b=new Builder(),blades=tall?9:11,H=tall?1.15:.5;
  for(let i=0;i<blades;i++){
    const a=r()*6.28,d=r()*.3,x=Math.cos(a)*d,z=Math.sin(a)*d,h=H*(.65+r()*.6),lean=(.2+r()*.5)*(tall?.9:.7),la=r()*6.28,w=(tall?.055:.045)*(.8+r()*.5),side=V(Math.cos(la+1.57),0,Math.sin(la+1.57)),dir=V(Math.cos(la),0,Math.sin(la)),ids=[],seg=3;
    const n=V(0,1,0).lerp(dir,.3).normalize(),c0=col.oakD.clone().multiplyScalar(1.1),c1=tall?C('#a8b650'):C('#7fb446');
    if(lod){
      if(i%2===0){const base=V(x,0,z),tip=base.clone().addScaledVector(dir,lean*h).add(V(0,h,0)),k=w*1.85;
      b.tri(b.vert(base.clone().addScaledVector(side,k),n,c0,1),b.vert(tip,n,c1,1),b.vert(base.clone().addScaledVector(side,-k),n,c0,1))}
    }else{
      for(let j=0;j<=seg;j++){const t=j/seg,p=V(x,0,z).addScaledVector(dir,lean*t*t*h).add(V(0,t*h,0)),ww=w*(1-t*.9),c=c0.clone().lerp(c1,t*.9);
        ids.push([b.vert(p.clone().addScaledVector(side,ww),n,c,1),b.vert(p.clone().addScaledVector(side,-ww),n,c,1)])}
      for(let j=0;j<seg;j++){b.tri(ids[j][0],ids[j+1][0],ids[j][1]);b.tri(ids[j][1],ids[j+1][0],ids[j+1][1])}
    }
    if(tall&&r()>.55&&(!lod||i%2===0)){const p=V(x,0,z).addScaledVector(dir,lean*h).add(V(0,h,0));b.add(lod?P.pyr(3):P.ico(0),M(p,V(.04*(lod?1.3:1),.11,.04*(lod?1.3:1))),C('#c8b878'),0)}
  }
  return {geo:b.build()};
}
// Wildflower patch: stems, leaves and heads in ONE geometry (stems carry tint 0 so only the heads take the instance colour).
// Heads are 12-triangle hexagonal bipyramids with a 5-triangle centre (the old icosahedra cost 440 triangles per patch of 11).
// lod 1 (beyond ~30 m): a thin triangle for the stem and a 4-triangle pyramid for the head, same random draws so the layout matches.
export function flowerPatchGeometry(seed,{lod=0}={}){
  const r=rng(seed*23+4),b=new Builder(),n=11,green=C('#4c8a2e');
  for(let i=0;i<n;i++){
    const a=r()*6.28,d=Math.sqrt(r())*.85,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.38+r()*.4,s=.07+r()*.05,lx=(r()-.5)*.15,lz=(r()-.5)*.15,top=V(x+lx,h,z+lz);
    const leaf=[];for(let k=0;k<2;k++)leaf.push([r(),r(),r()]);
    const rot={y:r()*6,x:(r()-.5)*.5,z:(r()-.5)*.5};
    if(lod){
      b.tri(b.vert(V(x-.02,0,z),V(0,1,0),green,0),b.vert(top,V(0,1,0),green,0),b.vert(V(x+.02,0,z),V(0,1,0),green,0));
      b.add(P.pyr(4),M(top.clone().add(V(0,s*.1,0)),V(s*1.15,s*.8,s*1.15),rot),C('#ffffff'),1);
      continue;
    }
    tube(b,[V(x,0,z),V(x+lx*.5,h*.5,z+lz*.5),top],[.012,.007],{sides:3,color:green});
    for(let k=0;k<2;k++)card(b,V(x,.1+k*.1,z),V(Math.cos(leaf[k][0]*6.28),.3,Math.sin(leaf[k][1]*6.28)).normalize(),.2,.2,leaf[k][2]*3,green,V(0,1,0),0);
    b.add(P.bip(6),M(top,V(s*1.05,s*.42,s*1.05),rot),C('#ffffff'),1);
    b.add(P.pyr(5),M(top.clone().add(V(0,s*.4,0)),V(s*.34,s*.12,s*.34)),C('#f3c43a'),0);
  }
  return {geo:b.build()};
}
export function mushroomGeometry(seed,glow=false){
  const r=rng(seed*3+2),b=new Builder(),n=3+Math.floor(r()*3);
  for(let i=0;i<n;i++){
    const a=r()*6.28,d=i?.18+r()*.28:0,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.12+r()*.2,cr=.09+r()*.12,lean=(r()-.5)*.3;
    const stem=glow?C('#8fdde8').multiplyScalar(1.3):C('#e9e1cb'),cap=glow?C('#37f2d8').multiplyScalar(2.6):[C('#c0392b'),C('#d9742a'),C('#b88a52'),C('#a6523c')][Math.floor(r()*4)];
    tube(b,[V(x,0,z),V(x+lean*h,h*.55,z),V(x+lean*h*1.6,h,z)],[cr*.28,cr*.2],{sides:5,color:stem});
    b.add(P.sphere(7,4),M(V(x+lean*h*1.6,h,z),V(cr,cr*.55,cr)),(p,nn)=>{const c=cap.clone();if(!glow&&nn.y>.6&&vnoise(p.x*60,p.z*60)>.7)c.lerp(C('#fff6e0'),.85);return c},0);
  }
  return {geo:b.build()};
}
export function reedGeometry(seed,{lod=0}={}){
  const r=rng(seed*5+8),b=new Builder(),n=12;
  for(let i=0;i<n;i++){
    const a=r()*6.28,d=r()*.7,x=Math.cos(a)*d,z=Math.sin(a)*d,h=1.4+r()*1.1,la=r()*6.28,lean=.15+r()*.4,w=.035,dir=V(Math.cos(la),0,Math.sin(la)),side=V(-dir.z,0,dir.x),ids=[];
    if(lod){ // one tapered triangle per blade
      const base=V(x,0,z),tip=base.clone().addScaledVector(dir,lean*h).add(V(0,h,0));
      b.tri(b.vert(base.clone().addScaledVector(side,w*1.6),V(0,1,0),C('#4d7a2e'),1),b.vert(tip,V(0,1,0),C('#a8b45e'),1),b.vert(base.clone().addScaledVector(side,-w*1.6),V(0,1,0),C('#4d7a2e'),1));
    }else{
      for(let j=0;j<=4;j++){const t=j/4,p=V(x,0,z).addScaledVector(dir,lean*t*t*h).add(V(0,t*h,0)),ww=w*(1-t*.85),c=C('#4d7a2e').lerp(C('#a8b45e'),t*.8);ids.push([b.vert(p.clone().addScaledVector(side,ww),V(0,1,0),c,1),b.vert(p.clone().addScaledVector(side,-ww),V(0,1,0),c,1)])}
      for(let j=0;j<4;j++){b.tri(ids[j][0],ids[j+1][0],ids[j][1]);b.tri(ids[j][1],ids[j+1][0],ids[j+1][1])}
    }
    if(i%4===0){const p=V(x,0,z).addScaledVector(dir,lean*.64*h).add(V(0,h*.78,0));b.add(lod?P.bip(3):P.cyl(6),M(p,V(.045,.32,.045)),C('#5a3b22'),0)}
  }
  return {geo:b.build()};
}
export function logGeometry(seed){
  const r=rng(seed*19+6),b=new Builder(),L=4.5+r()*3,rad=.5+r()*.25,pts=[];
  for(let i=0;i<=6;i++){const t=i/6;pts.push(V((t-.5)*L,rad+Math.sin(t*3+seed)*.06,Math.sin(t*2+seed)*.1))}
  const bark=(p,t,a)=>{const top=Math.max(0,Math.sin(a+Math.PI/2));let c=col.barkA.clone().lerp(col.barkB,ss(.3,.8,vnoise(a*4+seed,p.x*1.2))*.8);c.lerp(col.moss,top*ss(.25,.6,vnoise(p.x*.9+seed,a))*.8);return c};
  tube(b,pts,t=>rad*(1-t*.12),{sides:9,color:bark});
  for(const [i,sgn] of [[0,-1],[6,1]]){const p=pts[i];b.add(P.cyl(9),M(p.clone().add(V(sgn*.02,0,0)),V(rad*(i?.88:1),.03,rad*(i?.88:1)),{z:Math.PI/2}),C('#b89a6b'),0)}
  for(let i=0;i<3;i++){const t=.2+r()*.6,p=pts[Math.round(t*6)],a=r()*6.28;tube(b,[p.clone(),p.clone().add(V(Math.cos(a)*.5,.5+r()*.4,Math.sin(a)*.5))],[.09,.04],{sides:4,color:col.barkB})}
  return {geo:b.build(),length:L,radius:rad};
}
export function stumpGeometry(seed){
  const r=rng(seed*3+9),b=new Builder(),h=.7+r()*.6,rad=.55+r()*.3;
  tube(b,[V(0,-.2,0),V(.02,h*.5,0),V(0,h,.03)],t=>rad*(1+.3*Math.pow(1-t,3)),{sides:9,color:barkColor(seed,col.barkA,col.barkB,.7)});
  roots(b,r,h*.3,5,rad*2.2,barkColor(seed,col.barkA,col.barkB),seed);
  b.add(P.cyl(9),M(V(0,h+.01,0),V(rad*.97,.03,rad*.97)),C('#c0a574'),0);
  return {geo:b.build(),height:h,radius:rad};
}
export function boulderGeometry(seed,kind){
  const cfg={round:[1,.24,1,.82,1],slab:[1,.2,1.55,.5,1.1],tall:[1,.2,.8,1.5,.8],lump:[2,.28,1.1,.7,.9]}[kind],g=rockGeo(cfg[0],cfg[1],seed,cfg[2],cfg[3],cfg[4]),b=new Builder(),r=rng(seed*5+5);
  b.add(g,M(V(0,cfg[3]*.55,0)),(p,n)=>{
    const top=ss(.35,.8,n.y)*(.55+.45*ss(.3,.7,vnoise(p.x*1.4+seed,p.z*1.4))),band=vnoise(p.y*2.4+seed,p.x*.6+p.z*.6),c=col.stone.clone().lerp(col.stoneD,ss(.35,.8,band)*.8).lerp(col.stoneL,ss(.7,1,vnoise(p.x*3+1,p.y*3))*.4);
    c.lerp(col.lichen,ss(.78,.95,vnoise(p.x*5+9,p.z*5+p.y*5))*.35*(1-top));return c.lerp(col.moss,top*.85*ss(.22,.5,p.y/(cfg[3]*1.1)+.2*vnoise(p.x*3,p.z*3)));
  },1);
  return {geo:b.build(),radius:Math.max(cfg[2],cfg[4]),height:cfg[3]*1.2,dome:{cy:cfg[3]*.55,rh:(cfg[2]+cfg[4])/2*.92,rv:cfg[3]*.95}};
}
export function cragGeometry(seed){
  const r=rng(seed*11+3),b=new Builder(),n=8,prisms=[];
  for(let i=0;i<n;i++){
    const a=r()*6.28,d=i?Math.sqrt(r())*2.2:0,w=.8+r()*.9,h=(1.5+r()*3.2)*(1-d/5),yaw=r()*6.28,tilt=(r()-.5)*.35;
    const m=M(V(Math.cos(a)*d,h/2-.5,Math.sin(a)*d),V(w,h,w*(.8+r()*.4)),{x:tilt,y:yaw,z:(r()-.5)*.35});prisms.push(m);
    b.add(new T.CylinderGeometry(.62,1,1,6,1),m,(p,nn)=>{
      const band=Math.sin(p.y*5.2+i*1.7+vnoise(p.x*1.5,p.z*1.5)*2.4)*.5+.5,c=col.stone.clone().lerp(col.stoneD,band*.75).lerp(col.stoneL,ss(.6,1,vnoise(p.x*2.5+i,p.y*2))*.35);
      c.lerp(col.lichen,ss(.8,.95,vnoise(p.x*4+3,p.y*4+p.z*4))*.3);return c.lerp(col.moss,ss(.55,.9,nn.y)*.85*ss(.2,.5,vnoise(p.x*1.4+9,p.z*1.4)))},1);
  }
  return {geo:b.build(),radius:2.4,height:4,prisms,rTop:.62,rBottom:1};
}
export function basaltGeometry(seed){
  const r=rng(seed*7+2),b=new Builder(),prisms=[];
  for(let i=0;i<11;i++){const a=r()*6.28,d=i?Math.sqrt(r())*2.6:0,h=1.2+r()*3.6*(1-d/4),rad=.55+r()*.3;
    const m=M(V(Math.cos(a)*d,h/2-.3,Math.sin(a)*d),V(rad,h,rad),{y:r()*3});prisms.push(m);
    b.add(new T.CylinderGeometry(1,1.08,1,6,1),m,(p,n)=>col.stone.clone().lerp(col.stoneD,ss(.2,.9,vnoise(p.x*2+seed,p.z*2+p.y))*.7).lerp(col.moss,ss(.5,1,n.y)*.55),1)}
  return {geo:b.build(),prisms,rTop:1,rBottom:1.08};
}

// ---------------------------------------------------------------- scatter
export function buildFlora({U,atlas,scene,obstacles,occ}){
  const meshes=[],stats={};
  // frustumCulled stays off: eden-cull.js (installed by makeEden) culls per instance and picks the level of detail on every render.
  const add=(mesh,name,cull={})=>{mesh.name=name;mesh.frustumCulled=false;mesh.userData.cull=cull;scene.add(mesh);meshes.push(mesh);stats[name]=mesh.count;return mesh};
  const solid=(kind,x,y,z,rad,h)=>obstacles.push(makeObstacle(kind,x,y,z,rad,h));
  const tintPalette={
    oak:['#ffffff','#f1f6d2','#e6f0b8','#ffffff','#fff1c4','#dfeec0'],pine:['#ffffff','#e9f4ff','#d9ecf2','#f6ffe6'],birch:['#ffffff','#fff6c0','#f6ee9a','#e8f4b4'],willow:['#ffffff','#f4fadc','#e8f3b8'],
  };
  const tcol=(name,r)=>C(tintPalette[name][Math.floor(r()*tintPalette[name].length)]).multiplyScalar(.9+r()*.2);
  const treeMat=foliageMaterial(U,{mode:'tree',amp:.045,alpha:atlas,side:T.DoubleSide});
  const lowMat=foliageMaterial(U,{mode:'tree',amp:.07,alpha:atlas,side:T.DoubleSide});
  const grassMat=foliageMaterial(U,{mode:'grass',amp:.16,side:T.DoubleSide,roughness:1});
  const rockMat=foliageMaterial(U,{mode:'none',roughness:.95,flat:true});
  const woodMat=foliageMaterial(U,{mode:'none',roughness:.95});
  const r=rng(2025);
  const tris=g=>g.index?g.index.count/3:g.attributes.position.count/3;

  // --- trees
  const species={
    oak:{geos:[oakGeometry(1),oakGeometry(2)],far:[oakGeometry(1,{lod:1}),oakGeometry(2,{lod:1})],lodDist:50,mat:treeMat,spacing:6.2,trunkR:.75,count:56,fo:[.15,1],scale:[.85,1.25]},
    pine:{geos:[pineGeometry(1),pineGeometry(2,{slim:true}),pineGeometry(3)],mat:treeMat,spacing:4.2,trunkR:.5,count:100,fo:[.35,1],scale:[.8,1.35]},
    birch:{geos:[birchGeometry(1),birchGeometry(2)],mat:treeMat,spacing:3.6,trunkR:.28,count:60,fo:[.1,.8],scale:[.85,1.3]},
    willow:{geos:[willowGeometry(1)],mat:treeMat,spacing:8,trunkR:.8,count:11,water:true,scale:[.9,1.2]},
    dead:{geos:[deadTreeGeometry(1),deadTreeGeometry(2)],mat:woodMat,spacing:5,trunkR:.5,count:12,scale:[.9,1.3]},
  };
  const placed={};
  for(const [name,sp] of Object.entries(species)){
    const inst=sp.geos.map(()=>new Instances()),cnt=sp.geos.map(()=>0),R=rng(name.length*977+11);
    // How far this species' solid reaches where a walking mech can touch it; paths and clearings must stay clear of that, not just of the trunk.
    const walk=Math.max(sp.trunkR,...sp.geos.map(g=>walkReach(treeParts(g.shape,{x:0,y:0,z:0}),0,0,0)));
    let tries=0;
    while(placed[name]===undefined||placed[name]<sp.count){
      placed[name]=placed[name]||0;if(++tries>sp.count*160)break;
      let x,z;
      if(sp.water){const a=R()*6.28,k=R();if(k<.6){x=POND.x+Math.cos(a)*POND.rx*(1.2+R()*.5);z=POND.z+Math.sin(a)*POND.rz*(1.2+R()*.5)}else{x=-60+R()*80;z=streamZ(x)+(R()<.5?-1:1)*(6+R()*8)}}
      else{x=(R()-.5)*300;z=(R()-.5)*300+10}
      const y=terrainHeight(x,z);if(y<WATER_Y+.7)continue;
      const fo=forestAmount(x,z);if(!sp.water&&(R()>ss(sp.fo?.[0]??0,sp.fo?.[1]??1,fo)*(name==='dead'?.6:1)+.02))continue;
      const n=terrainNormal(x,z);if(n.y<.84)continue;
      if(inFight(x,z)&&R()>.1)continue;
      const sc=sp.scale[0]+R()*(sp.scale[1]-sp.scale[0]);
      if(!solidOk(x,z,walk*sc+.4)||!occ.ok(x,z,sp.spacing*sc*.5,.9))continue;
      const gi=Math.floor(R()*sp.geos.length);
      const col2=name==='dead'?null:tcol(name,R);
      const sx=sc*(.92+R()*.16),sz=sc*(.92+R()*.16),tx=(R()-.5)*.05,yaw=R()*6.28,tz=(R()-.5)*.05; // same draws, same order as before
      inst[gi].add(x,y-.12,z,sx,sc,sz,tx,yaw,tz,col2);cnt[gi]++;
      // trunk box (bullets, bot navigation) plus a compound solid that follows this instance's size, lean and yaw
      const tree=makeObstacle('tree',x,y,z,sp.trunkR*sc,(name==='pine'?12:name==='dead'?6:name==='willow'?4:7)*sc);
      obstacles.push(attachParts(tree,treeParts(sp.geos[gi].shape,{x,y:y-.12,z,sx,sy:sc,sz,rx:tx,ry:yaw,rz:tz})));occ.put(x,z,sp.spacing*sc*.5);placed[name]++;
    }
    sp.geos.forEach((g,i)=>{if(inst[i].length)add(inst[i].mesh(g.geo,sp.mat,{cast:true}),name+i,sp.far?{lod:{dist:sp.lodDist,geo:sp.far[i].geo,group:name+i}}:{})});
  }
  stats.trees=placed;

  // --- undergrowth, scattered by rejection sampling over the whole playable bowl
  const AREA={x0:-150,x1:150,z0:-90,z1:140};
  function scatter({name,geo,mat,count,filter,make,cast=false,seed,area=AREA,tries,lod=null}){
    const inst=new Instances(),R=rng(seed),limit=tries||count*60;let n=0,t=0;
    while(n<count&&t++<limit){
      const x=area.x0+R()*(area.x1-area.x0),z=area.z0+R()*(area.z1-area.z0),y=terrainHeight(x,z),o=filter(x,z,y,R);
      if(!o)continue;make(inst,x,y,z,R,o);n++;
    }
    if(inst.length)add(inst.mesh(geo,mat,{cast}),name,lod?{lod}:{});return n;
  }
  const dry=(x,z,y,min=WATER_Y+.6)=>y>min&&!inStream(x,z,1.5)&&!inPond(x,z,1.5);
  const nearPath=(x,z)=>z>-70&&z<105?Math.exp(-Math.pow((x-pathX(z))/34,2)):0;
  const flat=(x,z,m=.78)=>terrainNormal(x,z).y>m;
  const offPath=(x,z,w=2.1)=>!(z>PATH.z0&&z<PATH.z1&&Math.abs(x-pathX(z))<w);
  const tint=(r,a,b)=>{const c=C('#ffffff').multiplyScalar(a+(b-a)*r());return c};
  const hueOf=(hex,r,k=.12)=>C(hex).multiplyScalar(1+(r()-.5)*2*k);

  // grass: short meadow clumps, denser near the path and in open ground
  // Beyond LOD_GRASS metres every clump is drawn with its triangle-per-blade far geometry (shared by both short-grass variants).
  const LOD_GRASS=34,grassGeos=[grassGeometry(1),grassGeometry(2)],tallGeo=grassGeometry(5,{tall:true}),grassFar=grassGeometry(1,{lod:1}).geo,tallFar=grassGeometry(5,{tall:true,lod:1}).geo;
  const grassCol=['#ffffff','#f4ffd0','#e6f7b0','#d4ee98','#ffffff'];
  grassGeos.forEach((g,gi)=>scatter({name:'grass'+gi,geo:g.geo,mat:grassMat,count:3200,seed:101+gi,lod:{dist:LOD_GRASS,geo:grassFar,group:'grass'},
    filter:(x,z,y,R)=>dry(x,z,y)&&offPath(x,z)&&flat(x,z,.7)&&R()<.1+.9*nearPath(x,z)*(1-.55*forestAmount(x,z))?1:0,
    make:(i,x,y,z,R)=>{const s=1+R()*1.1;i.add(x,y-.02,z,s,s*(.8+R()*.5),s,0,R()*6.28,0,C(grassCol[Math.floor(R()*5)]).multiplyScalar(.85+R()*.3))}}));
  scatter({name:'tallgrass',geo:tallGeo.geo,mat:grassMat,count:1500,seed:111,lod:{dist:LOD_GRASS+6,geo:tallFar,group:'tallgrass'},
    filter:(x,z,y,R)=>dry(x,z,y)&&offPath(x,z,3)&&flat(x,z,.72)&&R()<.06+.5*nearPath(x,z)?1:0,
    make:(i,x,y,z,R)=>{const s=.8+R()*1.1;i.add(x,y-.02,z,s,s,s,0,R()*6.28,0,C('#ffffff').multiplyScalar(.85+R()*.35))}});

  // wildflower patches: one mesh (stems + tinted heads), full detail near, a 5-triangle-per-flower version beyond LOD_FLOWER
  const LOD_FLOWER=30,fp=flowerPatchGeometry(1),fpFar=flowerPatchGeometry(1,{lod:1}),flowerCols=['#ffffff','#fff3a0','#f7c64a','#ff7fa8','#d86ad8','#9f86f2','#6fa8ff','#ff9a4a','#ff5a4a'];
  {
    const heads=new Instances(),R=rng(131);let n=0,t=0;
    while(n<280&&t++<20000){
      const x=-110+R()*220,z=-70+R()*170,y=terrainHeight(x,z);
      if(!dry(x,z,y,1)||!offPath(x,z,2.4)||!flat(x,z,.8))continue;
      if(R()>.15+.85*nearPath(x,z)||forestAmount(x,z)>.55)continue;
      const cl=vnoise(x*.05+9,z*.05);if(cl<.45&&R()<.7)continue;
      const s=.9+R()*.9,c=C(flowerCols[Math.floor(R()*flowerCols.length)]).multiplyScalar(.9+R()*.2),ry=R()*6.28;
      heads.add(x,y-.02,z,s,s,s,0,ry,0,c);n++;
    }
    add(heads.mesh(fp.geo,grassMat),'flower-heads',{lod:{dist:LOD_FLOWER,geo:fpFar.geo,group:'flowers'}});
  }

  // shrubs (plain and flowering), ferns, mushrooms
  const shrubGeos=[shrubGeometry(1),shrubGeometry(2),shrubGeometry(3,{flowers:C('#f4a6c8')}),shrubGeometry(4,{flowers:C('#ffffff')})];
  shrubGeos.forEach((g,gi)=>scatter({name:'shrub'+gi,geo:g.geo,mat:lowMat,count:gi<2?60:22,seed:141+gi,
    filter:(x,z,y,R)=>dry(x,z,y,1)&&solidOk(x,z,.5)&&flat(x,z,.8)&&!inFight(x,z)&&occ.ok(x,z,1.2)&&R()<.15+forestAmount(x,z)*.7?1:0,
    make:(i,x,y,z,R)=>{const s=.8+R()*.9;i.add(x,y-.05,z,s,s*(.8+R()*.4),s,0,R()*6.28,0,tint(R,.85,1.15));occ.put(x,z,s*.9)}}));
  const fernGeo=fernGeometry(1),fernGeo2=fernGeometry(2);
  [fernGeo,fernGeo2].forEach((g,gi)=>scatter({name:'fern'+gi,geo:g.geo,mat:lowMat,count:130,seed:151+gi,
    filter:(x,z,y,R)=>dry(x,z,y,.9)&&flat(x,z,.78)&&offPath(x,z,2.5)&&R()<(.1+forestAmount(x,z)*.9)*(nearPath(x,z)<.4?1:.45)+(nearWater(x,z)?.9:0)?1:0,
    make:(i,x,y,z,R)=>{const s=.9+R()*1.1;i.add(x,y-.02,z,s,s*(.8+R()*.5),s,0,R()*6.28,0,tint(R,.8,1.15))}}));
  const mush=[mushroomGeometry(1),mushroomGeometry(2)],glowMush=[mushroomGeometry(3,true),mushroomGeometry(4,true)],glowMat=new T.MeshBasicMaterial({vertexColors:true,toneMapped:true});
  mush.forEach((g,gi)=>scatter({name:'mushroom'+gi,geo:g.geo,mat:woodMat,count:40,seed:161+gi,
    filter:(x,z,y,R)=>dry(x,z,y,1)&&flat(x,z,.8)&&offPath(x,z,3)&&R()<forestAmount(x,z)*.8?1:0,
    make:(i,x,y,z,R)=>{const s=.9+R()*1.3;i.add(x,y-.02,z,s,s,s,0,R()*6.28,0,tint(R,.9,1.1))}}));
  glowMush.forEach((g,gi)=>scatter({name:'glow-mushroom'+gi,geo:g.geo,mat:glowMat,count:50,seed:171+gi,
    filter:(x,z,y,R)=>dry(x,z,y,.9)&&flat(x,z,.75)&&offPath(x,z,3.5)&&(forestAmount(x,z)>.45&&R()<.7||nearWater(x,z)&&R()<.5)?1:0,
    make:(i,x,y,z,R)=>{const s=1+R()*1.6;i.add(x,y-.02,z,s,s,s,0,R()*6.28,0)}}));

  // reeds and cattails along the water
  const reeds=[reedGeometry(1),reedGeometry(2)],reedFar=reedGeometry(1,{lod:1}).geo;
  reeds.forEach((g,gi)=>scatter({name:'reeds'+gi,geo:g.geo,mat:grassMat,count:60,seed:181+gi,area:{x0:-125,x1:70,z0:-5,z1:52},lod:{dist:30,geo:reedFar,group:'reeds'},
    filter:(x,z,y,R)=>y>WATER_Y-.5&&y<WATER_Y+.55&&(inPond(x,z,3)||inStream(x,z,2.5))?1:0,
    make:(i,x,y,z,R)=>{const s=.9+R()*.8;i.add(x,y-.04,z,s,s*(.8+R()*.6),s,0,R()*6.28,0,tint(R,.85,1.15))}}));

  // fallen logs and stumps
  const logGeos=[logGeometry(1),logGeometry(2),logGeometry(3)],stumpGeos=[stumpGeometry(1),stumpGeometry(2)];
  const logObstacle=(x,y,z,yaw,g,sc)=>{const L=g.length*sc*.5,ca=Math.cos(yaw),sa=Math.sin(yaw);for(const k of [-.62,0,.62]){solid('log',x+ca*L*k,y,z-sa*L*k,g.radius*sc*.95,g.radius*sc*2)}};
  logGeos.forEach((g,gi)=>scatter({name:'log'+gi,geo:g.geo,mat:woodMat,count:5,seed:191+gi,cast:true,
    filter:(x,z,y,R)=>dry(x,z,y,1.2)&&flat(x,z,.85)&&solidOk(x,z,g.length*.5)&&occ.ok(x,z,g.length*.45)&&R()<.2+forestAmount(x,z)?1:0,
    make:(i,x,y,z,R)=>{const sc=.85+R()*.5,yaw=R()*6.28;i.add(x,y-.05,z,sc,sc,sc,0,yaw,0,tint(R,.85,1.1));logObstacle(x,y,z,yaw,g,sc);occ.put(x,z,g.length*sc*.4)}}));
  stumpGeos.forEach((g,gi)=>scatter({name:'stump'+gi,geo:g.geo,mat:woodMat,count:7,seed:201+gi,cast:true,
    filter:(x,z,y,R)=>dry(x,z,y,1.2)&&flat(x,z,.85)&&solidOk(x,z,1.2)&&occ.ok(x,z,2.5)&&R()<.2+forestAmount(x,z)?1:0,
    make:(i,x,y,z,R)=>{const sc=.9+R()*.7;i.add(x,y,z,sc,sc,sc,0,R()*6.28,0,tint(R,.85,1.1));solid('stump',x,y,z,g.radius*sc*.95,g.height*sc);occ.put(x,z,1.6)}}));

  // boulders: scattered singles, bigger blocks on the escarpment, cover clusters in the fighting ground
  const cragG=cragGeometry(1),cinst=new Instances();
  // collision for the crag instance just added: every hexagonal prism of the cluster, through the instance's own matrix
  // cliffs may stand beside the stream (unlike trees), but never on the path or in a keep-clear zone (spawn, portal, archive, fight)
  const clearOf=(x,z,r)=>keepDistance(x,z)>=r&&!(z>PATH.z0-6&&z<PATH.z1+10&&Math.abs(x-pathX(z))<PATH_HALF+r);
  const crag=(x,z,kind)=>{const parts=[],inst=cinst.m[cinst.m.length-1];for(const m of cragG.prisms)prismParts(m,inst,{rTop:cragG.rTop,rBottom:cragG.rBottom,out:parts});obstacles.push(compoundObstacle(kind,parts))};
  const boulderKinds=['round','slab','tall','lump'],boulders=boulderKinds.map((k,i)=>boulderGeometry(i+1,k)),binst=boulders.map(()=>new Instances());
  const rock=(x,z,sc,R,{kind=null,sink=.2,obstacle=true}={})=>{
    const gi=kind===null?Math.floor(R()*boulders.length):kind,g=boulders[gi],y=terrainHeight(x,z);
    const sx=sc*(.85+R()*.3),sy=sc*(.8+R()*.4),sz=sc*(.85+R()*.3),rx=(R()-.5)*.25,ry=R()*6.28,rz=(R()-.5)*.25,col=tint(R,.85,1.15);
    binst[gi].add(x,y-sc*sink,z,sx,sy,sz,rx,ry,rz,col);
    // the collision follows the drawn dome (its real height and width), so a mech lands on the top instead of sinking or hovering
    if(obstacle&&sc>=1.2)obstacles.push(compoundObstacle('rock',domeParts(x,y-sc*sink+g.dome.cy*sy,z,g.dome.rh*(sx+sz)/2,g.dome.rv*sy)));
  };
  {
    const R=rng(211);let n=0,t=0;
    while(n<64&&t++<6000){
      const x=-140+R()*280,z=-85+R()*220,y=terrainHeight(x,z);if(!dry(x,z,y,.9)||!offPath(x,z,3.5)||inFight(x,z))continue;
      const sl=1-terrainNormal(x,z).y,wantsRock=R()<.25+sl*3;if(!wantsRock)continue;
      const sc=.6+Math.pow(R(),2)*2.6;if(sc>=1.2&&!solidOk(x,z,sc*1.1)||!occ.ok(x,z,sc,.8))continue;
      rock(x,z,sc,R);if(sc>=1.2)occ.put(x,z,sc*.9);n++;
    }
    // escarpment blocks
    n=0;t=0;while(n<46&&t++<5000){const x=-98+R()*38,z=-70+R()*170,y=terrainHeight(x,z);if(1-terrainNormal(x,z).y<.1)continue;if(Math.abs(z-streamZ(x))<7.5)continue;const sc=1.6+R()*2.4,sy=sc*(.8+R()*.6),ry=R()*6.28,col=C(['#ffffff','#f0e4d0','#d8e0e8','#e8d8c4'][Math.floor(R()*4)]).multiplyScalar(.8+R()*.35);cinst.add(x,y-sc*.5,z,sc,sy,sc,0,ry,0,col);
      // these are the cliffs: a mech stands on them (blocks that would close the path or a clearing stay scenery)
      if(clearOf(x,z,3*sc))crag(x,z,'crag');n++}
    n=0;t=0;while(n<12&&t++<3000){const x=-140+R()*280,z=-85+R()*220,y=terrainHeight(x,z);if(!dry(x,z,y,.9)||!offPath(x,z,5)||inFight(x,z)||!solidOk(x,z,3)||!occ.ok(x,z,4))continue;const sc=1.1+R()*.9;cinst.add(x,y-sc*.4,z,sc,sc,sc,0,R()*6.28,0,tint(R,.85,1.1));crag(x,z,'crag');occ.put(x,z,3*sc);n++}
    // cover clusters
    const spots=[];t=0;
    while(spots.length<15&&t++<4000){
      const x=FIGHT_X0+R()*(FIGHT_X1-FIGHT_X0),z=FIGHT_Z0+R()*(FIGHT_Z1-FIGHT_Z0);
      if(!solidOk(x,z,3.2)||spots.some(p=>Math.hypot(p.x-x,p.z-z)<10)||!flat(x,z,.85))continue;spots.push({x,z});
    }
    spots.forEach((p,i)=>{
      rock(p.x,p.z,1.9+R()*1.1,R,{kind:i%2?0:3});
      for(let k=0;k<3;k++){const a=R()*6.28,d=2.4+R()*1.6,x=p.x+Math.cos(a)*d,z=p.z+Math.sin(a)*d;if(solidOk(x,z,1.2))rock(x,z,.7+R()*.9,R,{kind:Math.floor(R()*4)})}
      occ.put(p.x,p.z,3);
    });
    stats.coverClusters=spots.length;
    // scattered pebbles at the water line
    n=0;t=0;while(n<90&&t++<9000){const x=-120+R()*190,z=-5+R()*55,y=terrainHeight(x,z);if(!(y>WATER_Y-.3&&y<WATER_Y+.7&&(inPond(x,z,4)||inStream(x,z,3.5))))continue;rock(x,z,.14+R()*.4,R,{kind:Math.floor(R()*4),obstacle:false,sink:.1});n++}
  }
  binst.forEach((b,i)=>{if(b.length)add(b.mesh(boulders[i].geo,rockMat,{cast:true}),'boulder'+i)});
  if(cinst.length)add(cinst.mesh(cragG.geo,rockMat,{cast:true}),'crags');
  const basalt=basaltGeometry(1),bi=new Instances();
  for(const [x,z,s] of [[-66,streamZ(-66)+5,1.3],[-70,streamZ(-70)-6,1.1],[POND.x+POND.rx*1.05,POND.z-6,1],[POND.x-4,POND.z+POND.rz*1.08,1.15]]){
    bi.add(x,terrainHeight(x,z)-.3,z,s,s,s,0,x,0);
    const parts=[],inst=bi.m[bi.m.length-1];for(const m of basalt.prisms)prismParts(m,inst,{rTop:basalt.rTop,rBottom:basalt.rBottom,out:parts});obstacles.push(compoundObstacle('basalt',parts));
  }
  add(bi.mesh(basalt.geo,rockMat,{cast:true}),'basalt');
  return {meshes,stats,placed,helpers:{solid,add,grassMat,lowMat,rockMat,woodMat,glowMat,tris,rock}};
}
const FIGHT_X0=-24,FIGHT_X1=24,FIGHT_Z0=30,FIGHT_Z1=86;
