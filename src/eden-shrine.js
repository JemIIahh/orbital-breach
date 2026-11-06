// The Seed Archive's grove: an ancient Heart Tree, a stepped dais with glowing inlays, standing stones, a ring of
// lanterns and bioluminescent plants. The archive object itself stays where game.js expects it (heart + (0,2.3,-4)).
import * as T from 'three';
import { V, clamp, lerp, ss, rng, vnoise, C, Builder, P, M, tube, prim, card, Instances, foliageMaterial } from './eden-core.js';
import { terrainHeight, pathX } from './eden-terrain.js';
import { makeObstacle, keepDistance, BOT_SPAWNS, PATH_HALF } from './eden-layout.js';
import { barkColor, canopy, limb } from './eden-flora.js';

const CENTER={x:0,z:75.2};
const MOSS=C('#4d8f3c');
export const SHRINE={...CENTER,radius:7.4,tree:{x:0,z:80.4}};

function annulus(b,x,y,z,r0,r1,seg,col,skip=()=>false){
  for(let i=0;i<seg;i++){if(skip(i))continue;const a0=i/seg*Math.PI*2,a1=(i+.82)/seg*Math.PI*2,n=V(0,1,0),
    v=[[r0,a0],[r1,a0],[r1,a1],[r0,a1]].map(([r,a])=>b.vert(V(x+Math.cos(a)*r,y,z+Math.sin(a)*r),n,col,0));b.quad(v[0],v[3],v[2],v[1])}
}
// The Heart Tree: a gnarled four-strand trunk, buttress roots, nine great limbs and a crown of lumpy canopy.
export function heartTreeGeometry(){
  const r=rng(1234),b=new Builder(),bark=barkColor(3,C('#755f47'),C('#3a2d22'),.55),dark=C('#2a5a2a'),light=C('#93c44c');
  for(let s=0;s<4;s++){const a0=s/4*6.28,pts=[];for(let i=0;i<=12;i++){const t=i/12,tw=a0+t*1.6,rad=2*(1-t*.65);pts.push(V(Math.cos(tw)*rad,t*16,Math.sin(tw)*rad))}tube(b,pts,t=>lerp(1.9,1.05,t),{sides:12,color:bark})}
  tube(b,[V(0,-1,0),V(0,8,0),V(.3,16.5,0)],t=>lerp(2.3,1.5,t),{sides:12,color:bark});
  for(let i=0;i<11;i++){const a=i/11*6.28+r()*.3,reach=7+r()*6.5,c=Math.cos(a),sn=Math.sin(a);
    tube(b,new T.CatmullRomCurve3([V(c*1.4,4,sn*1.4),V(c*reach*.45,1.5,sn*reach*.45),V(c*reach,-.5,sn*reach)]).getPoints(8),t=>lerp(1.15,.16,t),{sides:7,color:bark})}
  const ends=[];
  for(let i=0;i<9;i++){const a=i/9*6.28+r()*.5,len=11+r()*7,from=V(Math.cos(a)*.8,13+r()*4,Math.sin(a)*.8),to=V(Math.cos(a)*len,20+r()*8,Math.sin(a)*len);limb(b,from,to,1,.3,r,bark,8);ends.push(to)}
  const blobs=[[V(0,31,0),10.5,7.4]];
  for(const e of ends){blobs.push([e.clone().add(V(0,2.2,0)),6.6+r()*2.6,4.6+r()*1.2]);blobs.push([e.clone().multiplyScalar(.55).add(V(0,4.6,0)),5.2+r()*1.4,3.8])}
  blobs.push([V(0,22,0),8,5]);
  blobs.forEach(([c,rx,ry],i)=>canopy(b,c,rx,ry,rx*(.9+r()*.15),dark,light.clone().lerp(C('#d2dc6a'),(i%3)*.12),r,{cards:46,cardSize:1.7,seed:i+40,bias:.2}));
  // veils of hanging fronds
  for(let i=0;i<46;i++){const e=ends[i%ends.length],a=r()*6.28,rad=r()*5,x=e.x*(.5+r()*.6)+Math.cos(a)*rad,z=e.z*(.5+r()*.6)+Math.sin(a)*rad,y0=e.y+(r()-.3)*3,len=4+r()*5,n=V(Math.cos(a),0,Math.sin(a));
    for(let j=0;j<5;j++){const t=j/5;card(b,V(x,y0-t*len,z),n,1.0,len/5*1.15,(r()-.5)*.2,dark.clone().lerp(light,.2+.4*(1-t)),V(0,1,0).lerp(n,.5).normalize(),1,1)}}
  return b.build();
}
export function buildShrine({scene,U,atlas,obstacles,heartY,archivePos}){
  const matte=new Builder(),glow=new Builder(),R=rng(909),out={meshes:[]};
  const by=terrainHeight(CENTER.x,CENTER.z),top=by+.62;
  const solid=(kind,x,y,z,rad,h)=>obstacles.push(makeObstacle(kind,x,y,z,rad,h));
  // dais: three stone steps, mossy at the rim, with seams between slabs
  const stone=(r0,r1,y0)=>(p,n)=>{
    const dx=p.x-CENTER.x,dz=p.z-CENTER.z,rr=Math.hypot(dx,dz),a=Math.atan2(dz,dx),seam=ss(.05,0,Math.abs(((a/(Math.PI*2)*18)%1+1)%1-.5)-.45)*0+0;
    const c=C('#9a9c92').lerp(C('#7a7d74'),ss(.3,.8,vnoise(p.x*1.2,p.z*1.2))*.9);
    if(n.y>.5){c.lerp(MOSS,ss(r0-1.8,r0,rr)*.8*ss(.25,.6,vnoise(p.x*1.5+3,p.z*1.5)));c.multiplyScalar(1-.22*ss(.47,.5,Math.abs(((a/(Math.PI*2)*(r0>6?24:16))%1+1)%1-.5)))}
    else c.lerp(C('#3e4a32'),ss(y0+.5,y0-.2,p.y)*.6);
    return c.multiplyScalar(.9+.2*vnoise(p.x*7,p.z*7));
  };
  matte.add(new T.CylinderGeometry(7.4,7.8,.7,40),M(V(CENTER.x,by-.1,CENTER.z)),stone(7.4,7.8,by),0);
  matte.add(new T.CylinderGeometry(6.2,6.4,.28,40),M(V(CENTER.x,by+.38,CENTER.z)),stone(6.2,6.4,by),0);
  matte.add(new T.CylinderGeometry(5.0,5.2,.22,40),M(V(CENTER.x,by+.5,CENTER.z)),stone(5.0,5.2,by),0);
  const teal=C('#58f2c4').multiplyScalar(2.2),gold=C('#ffd98a').multiplyScalar(2.4);
  annulus(glow,CENTER.x,top-.04,CENTER.z,2.2,2.42,72,teal);annulus(glow,CENTER.x,top-.04,CENTER.z,3.8,3.95,72,teal,i=>i%9===4);annulus(glow,CENTER.x,top-.04,CENTER.z,4.7,4.82,96,gold,i=>i%2===0);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;glow.add(P.box(),M(V(CENTER.x+Math.cos(a)*3.0,top-.03,CENTER.z+Math.sin(a)*3.0),V(1.45,.02,.12),{y:-a}),teal,0)}
  // standing stones with glowing glyph strokes
  const stones=[];
  for(let i=0;i<11;i++){
    const a=i/11*Math.PI*2+.15,rad=9.2+R()*.7,x=CENTER.x+Math.cos(a)*rad,z=CENTER.z+Math.sin(a)*rad;
    if(Math.abs(x-pathX(z))<PATH_HALF+2.4&&z<CENTER.z+1)continue;   // keep the approach from the path open
    if(BOT_SPAWNS.some(s=>Math.hypot(s.x-x,s.z-z)<6.8))continue;
    const g=terrainHeight(x,z),h=3.6+R()*3,broken=R()<.2,hh=broken?h*.55:h,tilt=(R()-.5)*.14,ry=-a+Math.PI/2;
    matte.add(prim('menhir',()=>{const q=new T.CylinderGeometry(.5,.9,1,5,3);q.deleteAttribute('uv');q.deleteAttribute('normal');const p=q.attributes.position;for(let k=0;k<p.count;k++){const px=p.getX(k),py=p.getY(k),pz=p.getZ(k),j=.12;p.setXYZ(k,px+(vnoise(py*5,pz*5)-.5)*j,py+(py>.4?(px*.25):0),pz+(vnoise(px*5,py*5)-.5)*j)}const o=q.toNonIndexed();o.computeVertexNormals();return o}),
      M(V(x,g+hh/2-.5,z),V(1.5,hh+1,1.3),{y:ry,z:tilt,x:tilt*.6}),(p,n)=>{const c=C('#8d9086').lerp(C('#5f6259'),ss(.3,.8,vnoise(p.x*2+i,p.y*1.3))*.9);c.lerp(C('#b0ad9f'),ss(.7,1,vnoise(p.x*3,p.y*.7+i))*.3);c.lerp(MOSS,ss(.5,.9,n.y)*.8+ss(2.4,0,p.y-g)*.5*ss(.3,.7,vnoise(p.x*3,p.z*3)));return c},0);
    if(!broken){const fx=Math.cos(a+Math.PI),fz=Math.sin(a+Math.PI);for(let k=0;k<3;k++){const gh=g+1.2+k*1.25+R()*.2;glow.add(P.box(),M(V(x+fx*.62,gh,z+fz*.62),V(.1,.5+R()*.4,.04),{y:ry}),teal.clone().multiplyScalar(.75+k*.15),0)}}
    solid('standing-stone',x,g,z,.95,hh);stones.push({x,z});
  }
  // lantern posts
  const lanternGlow=C('#ffc97a').multiplyScalar(3.2);
  for(let i=0;i<14;i++){
    const a=i/14*Math.PI*2+.2,x=CENTER.x+Math.cos(a)*6.9,z=CENTER.z+Math.sin(a)*6.9;
    if(BOT_SPAWNS.some(s=>Math.hypot(s.x-x,s.z-z)<2.2))continue;
    const g=terrainHeight(x,z),hgt=1.9+R()*.4;
    tube(matte,[V(x,g-.2,z),V(x,g+hgt*.5,z),V(x+.04,g+hgt,z)],.07,{sides:5,color:C('#6b543a')});
    matte.add(P.box(),M(V(x+.28,g+hgt+.02,z),V(.62,.05,.05)),C('#3a2d22'),0);
    matte.add(P.cyl(6),M(V(x+.55,g+hgt-.28,z),V(.015,.55,.015),{z:0}),C('#3a2d22'),0);
    glow.add(P.cyl(6),M(V(x+.55,g+hgt-.58,z),V(.17,.28,.17)),lanternGlow,0);
    matte.add(P.cone(6),M(V(x+.55,g+hgt-.36,z),V(.22,.14,.22)),C('#3a2d22'),0);
  }
  // bioluminescent bloom: glowing bulbs on stalks
  // The petals are 8-triangle octahedra (they were 20-triangle icosahedra, 5 cm across); beyond ~30 m a cluster is just three bulbs on thin stalks.
  const bloomGeo=lod=>{
    const bloom=new Builder();
    for(let k=0;k<3;k++){const h=.5+k*.18;tube(bloom,[V(0,0,0),V(.05*k,h*.6,0),V(.1*k,h,.03)],[.02,.012],{sides:lod?3:4,color:C('#3d8c6a')});bloom.add(P.ico(lod?0:1),M(V(.1*k,h+.04,.03),V(.11,.16,.11)),C('#ffffff').multiplyScalar(1.5),0);
      if(!lod)for(let j=0;j<4;j++){const a=j/4*6.28+k;bloom.add(P.bip(4),M(V(.1*k+Math.cos(a)*.12,h-.06,.03+Math.sin(a)*.12),V(.05,.09,.05),{y:a}),C('#ffffff').multiplyScalar(1.3),0)}}
    return bloom.build();
  };
  const blooms=new Instances(),hues=['#12ffc8','#5dff8a','#ff5fc0','#6f98ff','#c4ff3c'];
  for(let i=0;i<110;i++){const a=R()*Math.PI*2,d=3+Math.sqrt(R())*11,x=CENTER.x+Math.cos(a)*d,z=CENTER.z+Math.sin(a)*d;
    if(Math.abs(x)<2.5&&d>7.5)continue;if(BOT_SPAWNS.some(s=>Math.hypot(s.x-x,s.z-z)<1.2))continue;
    const g=terrainHeight(x,z)+(d<7?(d<5?.55:.4):0),s=.55+R()*.6;blooms.add(x,g-.02,z,s,s*(.8+R()*.6),s,0,R()*6.28,0,C(hues[Math.floor(R()*hues.length)]))}
  // Heart Tree (the focal tree is hand-placed, with an open approach and a canopy broad enough to read from the gateway)
  const heroGeo=heartTreeGeometry(),ty=terrainHeight(SHRINE.tree.x,SHRINE.tree.z),heroScale=1;
  const heroInst=new Instances();heroInst.add(SHRINE.tree.x,ty-.3,SHRINE.tree.z,heroScale,heroScale,heroScale,0,.6,0,C('#ffffff'));
  const treeMat=foliageMaterial(U,{mode:'tree',amp:.02,alpha:atlas,side:T.DoubleSide});
  const heroMesh=heroInst.mesh(heroGeo,treeMat,{cast:true});heroMesh.name='heart-tree';heroMesh.frustumCulled=false;heroMesh.userData.cull={};
  solid('heart-tree',SHRINE.tree.x,ty,SHRINE.tree.z,3.4,38);
  // blossoms in the canopy
  const blossoms=new Instances(),bcols=['#ffd6ea','#ffffff','#bff7e6','#ffe9a8'];
  for(let i=0;i<90;i++){const a=R()*Math.PI*2,u=R()*2-1,s=Math.sqrt(1-u*u),rx=14+R()*10,x=SHRINE.tree.x+Math.cos(a)*s*rx,y=ty+27+u*10+R()*2,z=SHRINE.tree.z+Math.sin(a)*s*rx,k=.18+R()*.18;blossoms.add(x,y,z,k,k,k,0,0,0,C(bcols[i%4]).multiplyScalar(2.3))}
  // hanging glow strands under the canopy
  const strand=new Builder();for(let j=0;j<9;j++){strand.add(P.ico(0),M(V(0,-j*.55,0),.06+.03*(j%2)),C('#bff7e6').multiplyScalar(2.2),0)}
  tube(strand,[V(0,0,0),V(0,-4.8,0)],.012,{sides:3,color:C('#7fb28a')});
  const strands=new Instances();for(let i=0;i<26;i++){const a=R()*Math.PI*2,d=3+R()*9;strands.add(SHRINE.tree.x+Math.cos(a)*d,ty+17+R()*8,SHRINE.tree.z+Math.sin(a)*d,1,1+R()*.8,1,0,0,0)}

  const matteMat=foliageMaterial(U,{mode:'none',roughness:.9,tinted:false,flat:true});
  const glowMat=new T.MeshBasicMaterial({vertexColors:true}),bloomMat=new T.MeshBasicMaterial({vertexColors:true});
  const mk=(geo,mat,name,cast=false)=>{const m=new T.Mesh(geo,mat);m.name=name;m.castShadow=cast;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);out.meshes.push(m);return m};
  mk(matte.build(),matteMat,'shrine-stone',true);mk(glow.build(),glowMat,'shrine-glow');
  scene.add(heroMesh);out.meshes.push(heroMesh);
  const bm=blooms.mesh(bloomGeo(0),bloomMat);bm.name='shrine-blooms';bm.frustumCulled=false;bm.userData.cull={lod:{dist:30,geo:bloomGeo(1),group:'shrine-blooms'}};scene.add(bm);out.meshes.push(bm);
  const bl=blossoms.mesh(prim('blossom',()=>new T.IcosahedronGeometry(1,0)),new T.MeshBasicMaterial(),{receive:false});bl.name='heart-blossoms';bl.frustumCulled=false;bl.userData.cull={};scene.add(bl);out.meshes.push(bl);
  const sm=strands.mesh(strand.build(),new T.MeshBasicMaterial({vertexColors:true}),{receive:false});sm.name='heart-strands';sm.frustumCulled=false;sm.userData.cull={};scene.add(sm);out.meshes.push(sm);
  const light=new T.PointLight('#a8ffd0',2.6,26,1.5);light.position.copy(archivePos).add(V(0,.4,0));scene.add(light);
  out.light=light;out.stones=stones;out.heroScale=heroScale;
  out.update=(t,restored)=>{const k=restored?1.9:1;glowMat.color.setScalar(k*(.92+.08*Math.sin(t*1.3)));bloomMat.color.setScalar(k*(.9+.1*Math.sin(t*2.1)));light.intensity=(restored?5:2.6)*(.94+.06*Math.sin(t*3.1));light.color.set(restored?'#d8ffd0':'#a8ffd0')};
  return out;
}
