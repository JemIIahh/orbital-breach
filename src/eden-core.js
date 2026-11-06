// Shared building blocks for the Eden world: deterministic noise, a geometry merger with vertex colours,
// a tube sweeper, the foliage atlas and the shader patches that give instanced foliage wind and per-instance tint.
import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
const H3=(x,y,z)=>{let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296};
export const vnoise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=H3(ix,iy,0),b=H3(ix+1,iy,0),c=H3(ix,iy+1,0),d=H3(ix+1,iy+1,0);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v};
export const vnoise3=(x,y,z)=>{const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
  const l=(a,b,t)=>a+(b-a)*t;
  return l(l(l(H3(ix,iy,iz),H3(ix+1,iy,iz),u),l(H3(ix,iy+1,iz),H3(ix+1,iy+1,iz),u),v),l(l(H3(ix,iy,iz+1),H3(ix+1,iy,iz+1),u),l(H3(ix,iy+1,iz+1),H3(ix+1,iy+1,iz+1),u),v),w)};
export const fbm=(x,y,o=4)=>{let s=0,a=.5,f=1,n=0;for(let i=0;i<o;i++){s+=vnoise(x*f+i*17.3,y*f-i*9.1)*a;n+=a;f*=2.03;a*=.5}return s/n};
export const C=hex=>new T.Color(hex);
export const mix=(a,b,t)=>a.clone().lerp(b,t);
export const jitterColor=(c,r,amount=.12)=>{const k=1+(r()-.5)*2*amount;return c.clone().multiplyScalar(k)};

// ---------------------------------------------------------------- geometry merger
const _v=new T.Vector3(),_n=new T.Vector3(),_m3=new T.Matrix3();
export class Builder{
  constructor(){this.pos=[];this.nor=[];this.col=[];this.uv=[];this.tint=[];this.idx=[];this.blobs=[]} // blobs: the leafy lumps added by canopy(), reused for tree collision
  get count(){return this.pos.length/3}
  vert(p,n,c,t=0,u=.8333,v=.5){this.pos.push(p.x,p.y,p.z);this.nor.push(n.x,n.y,n.z);this.col.push(c.r,c.g,c.b);this.uv.push(u,v);this.tint.push(t);return this.pos.length/3-1}
  tri(a,b,c){this.idx.push(a,b,c)}
  quad(a,b,c,d){this.idx.push(a,b,c,a,c,d)}
  // Bake a primitive geometry through matrix `m`; `col` is a Color or fn(worldPos,normal,i)->Color. `uvs` 'card' maps into the leaf half of the atlas.
  add(geo,m,col,tint=0,uvs='solid'){
    const p=geo.attributes.position,nr=geo.attributes.normal,uv=geo.attributes.uv,base=this.count;_m3.getNormalMatrix(m);
    for(let i=0;i<p.count;i++){
      _v.fromBufferAttribute(p,i).applyMatrix4(m);_n.fromBufferAttribute(nr,i).applyMatrix3(_m3).normalize();
      const c=typeof col==='function'?col(_v,_n,i):col;
      if(uvs==='card'&&uv)this.vert(_v,_n,c,tint,uv.getX(i)/3,uv.getY(i));else this.vert(_v,_n,c,tint);
    }
    if(geo.index){const ix=geo.index.array;for(let i=0;i<ix.length;i+=3)this.tri(base+ix[i],base+ix[i+1],base+ix[i+2])}else for(let i=0;i<p.count;i+=3)this.tri(base+i,base+i+1,base+i+2);
  }
  build(){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.nor,3));
    g.setAttribute('color',new T.Float32BufferAttribute(this.col,3));g.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));g.setAttribute('tint',new T.Float32BufferAttribute(this.tint,1));
    g.setIndex(this.idx);g.computeBoundingSphere();g.computeBoundingBox();return g;
  }
}
const cache=new Map();
export const prim=(key,make)=>{let g=cache.get(key);if(!g){g=make();cache.set(key,g)}return g};
export const P={
  box:()=>prim('box',()=>new T.BoxGeometry(1,1,1)),
  cyl:(s=6)=>prim('cyl'+s,()=>new T.CylinderGeometry(1,1,1,s,1)),
  cone:(s=8)=>prim('cone'+s,()=>new T.ConeGeometry(1,1,s,1)),
  ico:(d=1)=>prim('ico'+d,()=>new T.IcosahedronGeometry(1,d)),
  plane:()=>prim('plane',()=>new T.PlaneGeometry(1,1)),
  sphere:(a=10,b=7)=>prim('sph'+a+b,()=>new T.SphereGeometry(1,a,b)),
  torus:(a=8,b=16,r=.12)=>prim('tor'+a+b+r,()=>new T.TorusGeometry(1,r,a,b)),
};
// Flat-shaded n-sided bipyramid (2n triangles) and n-sided pyramid with an open base (n triangles), unit radius, apex at y=+1.
// They replace 20-triangle icosahedra wherever the object is only a few centimetres across (seed heads, petals, glow bulbs).
function flatGeo(tris){
  const pos=new Float32Array(tris.length*9),nor=new Float32Array(tris.length*9);
  tris.forEach(([a,b,c],i)=>{
    const u=V(b[0]-a[0],b[1]-a[1],b[2]-a[2]),w=V(c[0]-a[0],c[1]-a[1],c[2]-a[2]),n=u.cross(w).normalize();let o=[a,b,c];
    if(n.x*(a[0]+b[0]+c[0])+n.y*(a[1]+b[1]+c[1])+n.z*(a[2]+b[2]+c[2])<0){o=[a,c,b];n.negate()}
    o.forEach((q,j)=>{pos.set(q,i*9+j*3);nor.set([n.x,n.y,n.z],i*9+j*3)});
  });
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.computeBoundingSphere();return g;
}
const ring=(n,y=0)=>Array.from({length:n},(_,i)=>[Math.cos(i/n*Math.PI*2),y,Math.sin(i/n*Math.PI*2)]);
P.bip=(n=5)=>prim('bip'+n,()=>{const r=ring(n),t=[];for(let i=0;i<n;i++){const a=r[i],b=r[(i+1)%n];t.push([[0,1,0],a,b],[[0,-1,0],b,a])}return flatGeo(t)});
P.pyr=(n=4)=>prim('pyr'+n,()=>{const r=ring(n,-1),t=[];for(let i=0;i<n;i++)t.push([[0,1,0],r[i],r[(i+1)%n]]);return flatGeo(t)});
const _o=new T.Object3D();
export const M=(p,s=1,r=null)=>{_o.position.set(p.x,p.y,p.z);if(r)_o.rotation.set(r.x||0,r.y||0,r.z||0);else _o.rotation.set(0,0,0);if(typeof s==='number')_o.scale.set(s,s,s);else _o.scale.set(s.x,s.y,s.z);_o.updateMatrix();return _o.matrix.clone()};
// matrix for a unit-height cylinder spanning a to b with radius `r`
export const span=(a,b,r,r2=r)=>{const d=b.clone().sub(a),len=d.length(),q=new T.Quaternion().setFromUnitVectors(V(0,1,0),d.clone().normalize());return new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,V(Math.max(r,r2),len,Math.max(r,r2)))};
// Smooth lumpy sphere (vertex-merged, noise-displaced); cached per (detail, amp, seed).
export function blobGeo(detail=2,amp=.18,seed=0,freq=1.7){
  return prim(`blob${detail}_${amp}_${seed}_${freq}`,()=>{
    let g=new T.IcosahedronGeometry(1,detail);g.deleteAttribute('uv');g.deleteAttribute('normal');g=mergeVertices(g,1e-4);
    const p=g.attributes.position;for(let i=0;i<p.count;i++){_v.fromBufferAttribute(p,i);const n=(vnoise3(_v.x*freq+seed*7.1,_v.y*freq+seed*3.3,_v.z*freq+seed*5.9)-.5)+.55*(vnoise3(_v.x*freq*2.9+seed*2.1,_v.y*freq*2.9,_v.z*freq*2.9+seed*1.3)-.5),k=1+n*2*amp;p.setXYZ(i,_v.x*k,_v.y*k,_v.z*k)}
    g.computeVertexNormals();return g;
  });
}
// Faceted rock: displaced icosphere with flat shading and a gently squashed profile.
export function rockGeo(detail=1,amp=.3,seed=0,sx=1,sy=.8,sz=1){
  return prim(`rock${detail}_${amp}_${seed}_${sx}${sy}${sz}`,()=>{
    let g=new T.IcosahedronGeometry(1,detail);g.deleteAttribute('uv');g.deleteAttribute('normal');g=mergeVertices(g,1e-4);
    const p=g.attributes.position;for(let i=0;i<p.count;i++){_v.fromBufferAttribute(p,i);const n=vnoise3(_v.x*1.3+seed*5.3+9,_v.y*1.3+seed*2.9,_v.z*1.3+seed*7.7)-.5,k=1+n*2*amp;p.setXYZ(i,_v.x*k*sx,_v.y*k*sy,_v.z*k*sz)}
    g=g.toNonIndexed();g.computeVertexNormals();return g;
  });
}
// Sweep a polygon along a path with per-point radius (trunks, limbs, roots, vines).
export function tube(b,pts,radius,{sides=6,color,tint=0,cap=false}={}){
  const n=pts.length,rad=typeof radius==='function'?radius:t=>Array.isArray(radius)?lerp(radius[0],radius[1],t):radius;
  const tan=[],nrm=[];
  for(let i=0;i<n;i++){const a=pts[Math.max(0,i-1)],c=pts[Math.min(n-1,i+1)];tan.push(c.clone().sub(a).normalize())}
  let N=Math.abs(tan[0].y)<.9?V(0,1,0):V(1,0,0);N=N.sub(tan[0].clone().multiplyScalar(N.dot(tan[0]))).normalize();
  for(let i=0;i<n;i++){N=N.clone().sub(tan[i].clone().multiplyScalar(N.dot(tan[i])));if(N.lengthSq()<1e-6)N=V(1,0,0).cross(tan[i]);N.normalize();nrm.push(N)}
  const base=b.count,col=color||C('#6b5a40');
  for(let i=0;i<n;i++){
    const t=i/(n-1),r=rad(t),B=tan[i].clone().cross(nrm[i]);
    for(let j=0;j<sides;j++){
      const a=j/sides*Math.PI*2,o=nrm[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(B,Math.sin(a)),p=pts[i].clone().addScaledVector(o,r);
      b.vert(p,o,typeof col==='function'?col(p,t,a):col,tint);
    }
  }
  for(let i=0;i<n-1;i++)for(let j=0;j<sides;j++){const a=base+i*sides+j,c=base+i*sides+(j+1)%sides,d=base+(i+1)*sides+j,e=base+(i+1)*sides+(j+1)%sides;b.tri(a,d,c);b.tri(c,d,e)}
  if(cap){const tip=b.vert(pts[n-1].clone().addScaledVector(tan[n-1],rad(1)*.5),tan[n-1],typeof col==='function'?col(pts[n-1],1,0):col,tint);for(let j=0;j<sides;j++)b.tri(base+(n-1)*sides+j,tip,base+(n-1)*sides+(j+1)%sides)}
}
// A leaf card (quad into the leaf half of the atlas) facing `n`, shaded with light normal `ln`.
export function card(b,c,n,w,h,roll,col,ln,tint=1,region=0){
  const up=Math.abs(n.y)>.95?V(1,0,0):V(0,1,0),u=up.clone().cross(n).normalize(),v=n.clone().cross(u),cr=Math.cos(roll),sr=Math.sin(roll),
    ux=u.clone().multiplyScalar(cr).addScaledVector(v,sr),vx=v.clone().multiplyScalar(cr).addScaledVector(u,-sr),
    ids=[];
  for(const [i,j] of [[0,0],[1,0],[1,1],[0,1]]){const p=c.clone().addScaledVector(ux,(i-.5)*w).addScaledVector(vx,(j-.5)*h);ids.push(b.vert(p,ln,col,tint,(region+i)/3,j))}
  b.quad(ids[0],ids[1],ids[2],ids[3]);
}

// ---------------------------------------------------------------- textures
// 192x64 atlas (alpha in the green channel): region 0 = leaf cluster on a twig, region 1 = fine drooping fronds, region 2 = solid.
export function leafAtlas(){
  const W=192,Hh=64,data=new Uint8Array(W*Hh*4),r=rng(77),leaves=[],fine=[];
  const leafAt=(list,x,y,ang,len,wid)=>list.push({x,y,c:Math.cos(ang),s:Math.sin(ang),len,wid});
  const cx=32,cy=32;
  // region 0: ~26 small leaves scattered through a disc, pointing outward, with a few twig strokes
  for(let k=0;k<26;k++){const ang=r()*Math.PI*2,rad=Math.sqrt(r())*19,x=cx+Math.cos(ang)*rad,y=cy+Math.sin(ang)*rad,dir=ang+(r()-.5)*1.3;leafAt(leaves,x-Math.cos(dir)*3,y-Math.sin(dir)*3,dir,10+r()*5,3.2+r()*1.5)}
  const fx=96;
  // region 1: fronds hanging from a stem, sparse narrow leaflets
  for(let k=0;k<13;k++){const t=k/12,y=3+t*54,len=11-t*3,wid=2.1-t*.4;leafAt(fine,fx,y,Math.PI/2-.8+(r()-.5)*.25,len,wid);leafAt(fine,fx,y+3,Math.PI/2+.8+(r()-.5)*.25,len,wid)}
  const inLeaf=(list,x,y)=>{for(const l of list){const dx=x-l.x,dy=y-l.y,u=dx*l.c+dy*l.s,v=-dx*l.s+dy*l.c;if(u>0&&u<l.len){const w=l.wid*Math.sin(u/l.len*Math.PI)**.8;if(Math.abs(v)<w)return true}}return false};
  for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){
    let a=0;
    if(x>=128)a=255;
    else if(x<64){if(inLeaf(leaves,x,y))a=255}
    else{if(Math.abs(x-fx)<.9&&y>1&&y<62)a=255;else if(inLeaf(fine,x,y))a=255}
    const i=(y*W+x)*4;data[i]=data[i+1]=data[i+2]=a;data[i+3]=255;
  }
  const tex=new T.DataTexture(data,W,Hh,T.RGBAFormat);tex.colorSpace=T.NoColorSpace;tex.generateMipmaps=true;tex.minFilter=T.LinearMipmapLinearFilter;tex.magFilter=T.LinearFilter;tex.wrapS=tex.wrapT=T.ClampToEdgeWrapping;tex.needsUpdate=true;return tex;
}

// ---------------------------------------------------------------- materials
// Wind sway + per-vertex instance tint patch. mode: 'tree' (sway grows with local height), 'grass', 'none'.
export function foliageMaterial(uniforms,{mode='tree',amp=.06,alpha=null,roughness=.9,side=T.FrontSide,tinted=true,emissive=null,metalness=0,flat=false}={}){
  const m=new T.MeshStandardMaterial({vertexColors:true,roughness,metalness,side,alphaMap:alpha||null,alphaTest:alpha?.42:0,flatShading:flat});
  if(emissive){m.emissive=new T.Color(emissive.color);m.emissiveIntensity=emissive.intensity}
  const sway={tree:`float h=max(position.y,0.);vec3 ip=vec3(instanceMatrix[3]);float ph=ip.x*.13+ip.z*.17;
    float w=sin(uTime*1.25+ph)+.5*sin(uTime*2.7+ph*1.7+position.x*.6+position.z*.4);float g=.6+.4*sin(uTime*.37+ip.x*.021);
    transformed.x+=w*${amp.toFixed(4)}*h*g;transformed.z+=cos(uTime*1.05+ph*1.3)*${(amp*.7).toFixed(4)}*h*g;transformed.y-=abs(w)*${(amp*.15).toFixed(4)}*h*.3;`,
    grass:`float h=max(position.y,0.);vec3 ip=vec3(instanceMatrix[3]);float ph=ip.x*.35+ip.z*.29;float k=h*h;
    transformed.x+=(sin(uTime*1.9+ph)*.7+sin(uTime*4.1+ph*2.3)*.3)*${amp.toFixed(4)}*k+(sin(uTime*.5+ip.z*.05)*.5)*${(amp*.6).toFixed(4)}*k;
    transformed.z+=cos(uTime*1.6+ph*1.1)*${(amp*.8).toFixed(4)}*k;`,
    none:''}[mode];
  m.onBeforeCompile=s=>{
    s.uniforms.uTime=uniforms.uTime;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;\nattribute float tint;')
      .replace('#include <color_vertex>',T.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;',tinted?'vColor.rgb *= mix(vec3(1.0),instanceColor.rgb,tint);':'vColor.rgb *= instanceColor.rgb;'))
      .replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\n'+sway+'\n#endif');
  };
  m.customProgramCacheKey=()=>`eden-${mode}-${amp}-${tinted?1:0}`;
  return m;
}
// Collect transforms/colours, then turn them into one InstancedMesh.
export class Instances{
  constructor(){this.m=[];this.c=[];this.o=new T.Object3D()}
  get length(){return this.m.length}
  add(x,y,z,sx,sy,sz,rx,ry,rz,color){const o=this.o;o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.scale.set(sx,sy,sz);o.updateMatrix();this.m.push(o.matrix.clone());this.c.push(color||null)}
  mesh(geometry,material,{cast=false,receive=true}={}){
    const mesh=new T.InstancedMesh(geometry,material,Math.max(1,this.m.length));mesh.count=this.m.length;
    this.m.forEach((m,i)=>mesh.setMatrixAt(i,m));
    if(this.c.some(Boolean)){this.c.forEach((c,i)=>mesh.setColorAt(i,c||new T.Color(1,1,1)))}
    mesh.castShadow=cast;mesh.receiveShadow=receive;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();return mesh;
  }
}
