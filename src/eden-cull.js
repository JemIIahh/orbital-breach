// Per-render culling and level of detail for Eden's instanced vegetation and its big terrain/ruin meshes.
// Everything stays one InstancedMesh (or Mesh) per species, so the mesh count does not grow with the world: a hook on
// scene.onBeforeRender (which three.js calls with the live camera right before it builds the render list) copies only
// the instances that can be seen into the front of each instance buffer and sets mesh.count. Casters are also kept when
// they fall inside the sun's shadow box, so shadows never lose a tree that is off screen. Meshes that carry a `lod`
// get a shared far InstancedMesh with a cheaper geometry for everything beyond lod.dist, so no instance is ever dropped.
// The repack only runs when the camera has moved or turned further than the padding allows, so a still camera costs nothing.
import * as T from 'three';

const PAD=.2;            // radians the cull frustum is widened by on every side
const TURN=Math.cos(.11);// repack when the view direction has turned further than this (must stay below PAD)
const MOVE=2.5;          // repack when the camera (or the sun's follow target) has moved further than this (metres)
const SLACK=MOVE+.6;     // instance radius padding that covers MOVE plus wind sway
const _f=new T.Frustum(),_pm=new T.Matrix4(),_vp=new T.Matrix4();

const planesOf=(f,out)=>{for(let i=0;i<6;i++){const p=f.planes[i];out[i*4]=p.normal.x;out[i*4+1]=p.normal.y;out[i*4+2]=p.normal.z;out[i*4+3]=p.constant}return out};
const outside=(P,x,y,z,r)=>{for(let k=0;k<24;k+=4)if(P[k]*x+P[k+1]*y+P[k+2]*z+P[k+3]<-r)return true;return false};

// Reads an InstancedMesh that was built with every instance and keeps a pristine copy plus a bounding sphere per instance.
function prepare(mesh,cfg){
  const n=mesh.count,g=mesh.geometry;if(!g.boundingSphere)g.computeBoundingSphere();mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);if(mesh.instanceColor)mesh.instanceColor.setUsage(T.DynamicDrawUsage);
  const c=g.boundingSphere.center,r=g.boundingSphere.radius,m=mesh.instanceMatrix.array,src=m.slice(0,n*16),cx=new Float32Array(n),cy=new Float32Array(n),cz=new Float32Array(n),rad=new Float32Array(n);
  for(let i=0,o=0;i<n;i++,o+=16){
    cx[i]=m[o]*c.x+m[o+4]*c.y+m[o+8]*c.z+m[o+12];cy[i]=m[o+1]*c.x+m[o+5]*c.y+m[o+9]*c.z+m[o+13];cz[i]=m[o+2]*c.x+m[o+6]*c.y+m[o+10]*c.z+m[o+14];
    rad[i]=r*Math.sqrt(Math.max(m[o]*m[o]+m[o+1]*m[o+1]+m[o+2]*m[o+2],m[o+4]*m[o+4]+m[o+5]*m[o+5]+m[o+6]*m[o+6],m[o+8]*m[o+8]+m[o+9]*m[o+9]+m[o+10]*m[o+10]));
  }
  return {mesh,cfg,n,src,srcC:mesh.instanceColor?mesh.instanceColor.array.slice(0,n*3):null,cx,cy,cz,rad,cast:mesh.castShadow,near:{mesh,k:0},far:null};
}
function emit(w,it,i){
  const a=w.mesh.instanceMatrix.array,o=w.k*16,s=i*16,m=it.src;
  for(let j=0;j<16;j++)a[o+j]=m[s+j];
  const ic=w.mesh.instanceColor;if(ic){const q=w.k*3;if(it.srcC){ic.array[q]=it.srcC[i*3];ic.array[q+1]=it.srcC[i*3+1];ic.array[q+2]=it.srcC[i*3+2]}else{ic.array[q]=ic.array[q+1]=ic.array[q+2]=1}}
  w.k++;
}
function flush(w){
  const m=w.mesh,im=m.instanceMatrix;m.count=w.k;m.visible=w.k>0;
  if(w.k){im.clearUpdateRanges();im.addUpdateRange(0,w.k*16);im.needsUpdate=true;if(m.instanceColor){m.instanceColor.clearUpdateRanges();m.instanceColor.addUpdateRange(0,w.k*3);m.instanceColor.needsUpdate=true}}
  w.k=0;
}

// Culls the Index-ranged meshes (terrain, merged ruins): the triangles are pre-sorted into clusters, each with a bounding sphere.
function prepareClusters(mesh,clusters){
  const g=mesh.geometry,src=g.index.array.slice(),dst=g.index.array;g.index.setUsage(T.DynamicDrawUsage);
  return {mesh,src,dst,clusters,cast:mesh.castShadow,total:src.length};
}
function packClusters(it,P,S){
  const {src,dst,clusters}=it;let k=0;
  for(const c of clusters){
    if(outside(P,c.x,c.y,c.z,c.r+SLACK)&&!(S&&it.cast&&!outside(S,c.x,c.y,c.z,c.r+SLACK)))continue;
    dst.set(src.subarray(c.start,c.start+c.count),k);k+=c.count;
  }
  const g=it.mesh.geometry;g.setDrawRange(0,k);it.mesh.visible=k>0;
  if(k){const ix=g.index;ix.clearUpdateRanges();ix.addUpdateRange(0,k);ix.needsUpdate=true}
  return k/3;
}

// Sorts an indexed geometry's triangles into square cells (by centroid) so whole cells can be skipped; returns the clusters
// ({start,count} in index units, plus a bounding sphere). The index array is rewritten in place and kept as the pristine copy.
export function clusterIndexed(geo,cell=16){
  const pos=geo.attributes.position.array,ix=geo.index.array,nt=ix.length/3,map=new Map();
  for(let t=0;t<nt;t++){
    const a=ix[t*3]*3,b=ix[t*3+1]*3,c=ix[t*3+2]*3,cx=(pos[a]+pos[b]+pos[c])/3,cz=(pos[a+2]+pos[b+2]+pos[c+2])/3,key=(Math.floor(cx/cell)+512)*1024+Math.floor(cz/cell)+512;
    let l=map.get(key);if(!l)map.set(key,l=[]);l.push(t);
  }
  const out=new ix.constructor(ix.length),clusters=[];let k=0;
  for(const list of map.values()){
    const start=k;let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for(const t of list)for(let j=0;j<3;j++){const v=ix[t*3+j];out[k++]=v;const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z}
    const x=(x0+x1)/2,y=(y0+y1)/2,z=(z0+z1)/2;let r=0;
    for(let q=start;q<k;q++){const v=out[q]*3,dx=pos[v]-x,dy=pos[v+1]-y,dz=pos[v+2]-z,d=dx*dx+dy*dy+dz*dz;if(d>r)r=d}
    clusters.push({start,count:k-start,x,y,z,r:Math.sqrt(r)});
  }
  ix.set(out);return clusters;
}

export function installCulling(scene,sun=null){
  const items=[],clustered=[],groups=new Map();
  scene.traverse(o=>{
    const c=o.userData&&o.userData.cull;if(!c)return;
    if(o.isInstancedMesh)items.push(prepare(o,c));
    else if(o.isMesh&&c.clusters)clustered.push(prepareClusters(o,c.clusters));
  });
  // shared far meshes
  for(const it of items){
    const l=it.cfg.lod;if(!l)continue;
    let g=groups.get(l.group);
    if(!g){g={geo:l.geo,mat:it.mesh.material,name:l.group+'-far',members:[],cap:0,cast:it.mesh.castShadow,rec:it.mesh.receiveShadow,color:false};groups.set(l.group,g)}
    g.members.push(it);g.cap+=it.n;g.color=g.color||!!it.mesh.instanceColor;
  }
  for(const g of groups.values()){
    const m=new T.InstancedMesh(g.geo,g.mat,Math.max(1,g.cap));m.count=0;m.visible=false;m.name=g.name;m.frustumCulled=false;m.castShadow=g.cast;m.receiveShadow=g.rec;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);if(g.color){m.setColorAt(0,new T.Color(1,1,1));m.instanceColor.setUsage(T.DynamicDrawUsage)}
    m.boundingSphere=g.members[0].mesh.boundingSphere?g.members[0].mesh.boundingSphere.clone():new T.Sphere();
    scene.add(m);g.mesh=m;g.w={mesh:m,k:0};for(const it of g.members)it.far=g.w;
  }
  if(sun&&sun.shadow)sun.shadow.camera.updateProjectionMatrix();
  const P=new Float32Array(24),S=new Float32Array(24),last={ok:false,p:[0,0,0],f:[0,0,-1],u:[0,1,0],s:[0,0,0],sx:1,sy:1,shadow:false};
  const stats={passes:0,instances:0,drawn:0,tris:0,by:{}};
  const farWriters=[...groups.values()].map(g=>g.w);

  function update(renderer,camera){
    const e=camera.matrixWorld.elements,px=e[12],py=e[13],pz=e[14],fx=-e[8],fy=-e[9],fz=-e[10],ux=e[4],uy=e[5],uz=e[6],pr=camera.projectionMatrix.elements;
    const shadow=!!(sun&&sun.castShadow&&renderer&&renderer.shadowMap&&renderer.shadowMap.enabled);
    const se=shadow?sun.matrixWorld.elements:null,sx=shadow?se[12]:0,sy=shadow?se[13]:0,sz=shadow?se[14]:0;
    if(last.ok&&last.shadow===shadow){
      const dx=px-last.p[0],dy=py-last.p[1],dz=pz-last.p[2],ds=sx-last.s[0],dt=sy-last.s[1],du=sz-last.s[2];
      if(dx*dx+dy*dy+dz*dz<MOVE*MOVE&&ds*ds+dt*dt+du*du<MOVE*MOVE&&fx*last.f[0]+fy*last.f[1]+fz*last.f[2]>TURN&&ux*last.u[0]+uy*last.u[1]+uz*last.u[2]>TURN&&Math.abs(pr[0]/last.sx-1)<.04&&Math.abs(pr[5]/last.sy-1)<.04)return;
    }
    last.ok=true;last.shadow=shadow;last.p=[px,py,pz];last.f=[fx,fy,fz];last.u=[ux,uy,uz];last.s=[sx,sy,sz];last.sx=pr[0];last.sy=pr[5];
    // main-camera planes, widened so the camera may turn a little before the next repack
    _pm.copy(camera.projectionMatrix);const el=_pm.elements;
    el[0]=1/Math.tan(Math.min(Math.atan(1/pr[0])+PAD,1.5));el[5]=1/Math.tan(Math.min(Math.atan(1/pr[5])+PAD,1.5));
    _vp.multiplyMatrices(_pm,camera.matrixWorldInverse);_f.setFromProjectionMatrix(_vp,T.WebGLCoordinateSystem);planesOf(_f,P);
    let SP=null;
    if(shadow){sun.shadow.updateMatrices(sun);planesOf(sun.shadow.getFrustum(),S);SP=S}
    stats.passes++;stats.instances=0;stats.drawn=0;stats.tris=0;
    for(const it of items){
      const {cx,cy,cz,rad,n,cfg,cast,near,far}=it,lod=cfg.lod,l2=lod?lod.dist*lod.dist:Infinity,useS=SP&&cast;
      for(let i=0;i<n;i++){
        const r=rad[i]+SLACK,x=cx[i],y=cy[i],z=cz[i];
        if(outside(P,x,y,z,r)&&!(useS&&!outside(SP,x,y,z,r)))continue;
        let w=near;
        if(lod){const dx=x-px,dy=y-py,dz=z-pz,d=Math.max(0,Math.sqrt(dx*dx+dy*dy+dz*dz)-rad[i]*.4);if(d*d>l2)w=far}
        emit(w,it,i);
      }
      stats.instances+=n;
    }
    for(const it of items)flush(it.near);
    for(const w of farWriters)flush(w);
    for(const it of items){stats.drawn+=it.mesh.count}for(const g of groups.values())stats.drawn+=g.mesh.count;
    for(const it of clustered){const t=packClusters(it,P,SP);stats.tris+=t;stats.by[it.mesh.name||'mesh']=Math.round(t)}
  }
  scene.onBeforeRender=(renderer,_scene,camera)=>update(renderer,camera);
  return {items,groups,clustered,update,stats,force(){last.ok=false}};
}
