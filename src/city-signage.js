import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWER_ROWS } from './city-layout.js';

// One texture atlas and one mesh for all readable city graphics. No web fonts,
// remote assets or per-sign materials; also works with the test canvas stub.
export function makeCitySigns(U){
  const c=document.createElement('canvas');c.width=1024;c.height=2560;const x=c.getContext('2d');
  const brands=[['MERIDIAN','TRANSIT AUTHORITY','03 / CENTRAL LINE','#a4d8c8'],['KESTREL','ORBITAL CONNECTION','EARTH / LOW ORBIT','#e3c599'],['EDEN','THE FUTURE IS ALIVE','SEED ARCHIVE / 2086','#a9cbb0'],['NORTHSTAR','ROBOTICS DIVISION','BUILT TO ENDURE','#bbcbd7'],['NOODLE / 24','CENTRAL AVENUE','HOT FOOD / COLD CITY','#e9b98e'],['RELAY 09','FIELD SERVICE','PARTS / REPAIR / REFIT','#b0d6d5'],['CENTRAL','MERIDIAN DISTRICT','AVENUE / NORTHBOUND','#e0cfaa'],['M / 03','MERIDIAN TRANSIT','03  CENTRAL > EDEN','#aacfc4']];
  const rects=[];
  brands.forEach(([name,sub,small,accent],i)=>{
    const y=i<4?i*512:2048+(i-4)*128,h=i<4?512:128;rects.push({y,h});x.fillStyle='#13262e';x.fillRect(0,y,1024,h);
    x.fillStyle=accent;x.fillRect(0,y,9,h);x.fillRect(35,y+23,50,5);
    x.textAlign='left';x.font='bold 42px sans-serif';x.fillText(name,110,y+62);
    x.font='16px monospace';x.fillText(sub,112,y+94);
    x.textAlign='right';x.font='14px monospace';x.fillText(small,988,y+37);
    for(let k=0;k<16;k++){x.fillStyle=k%4===0?accent:'#34515a';x.fillRect(670+k*19,y+76,10,k%4===0?25:12)}
    x.fillStyle=accent;x.fillRect(35,y+112,953,1);
    if(i<4){
      x.textAlign='left';x.font='bold 64px sans-serif';x.fillText(i===0?'KEEP THE CITY':i===1?'BEYOND THE':i===2?'A WORLD':'PRECISION',38,y+204);
      x.fillText(i===0?'CONNECTED.':i===1?'HORIZON.':i===2?'WORTH SAVING.':'IN MOTION.',38,y+278);
      for(let k=0;k<15;k++){
        const bh=35+(k*47%101),px=38+k*65;x.fillStyle='#28434c';x.fillRect(px,y+460-bh,55,bh);
        x.fillStyle=accent;for(let j=0;j<3;j++)x.fillRect(px+9+j*14,y+471-bh,5,4);
      }
      x.fillStyle=accent;x.fillRect(38,y+465,948,2);x.font='18px monospace';x.fillText(small,38,y+494);
    }
  });
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  const geos=[];
  const sign=(row,px,py,pz,w,h,ry)=>{
    const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,1-(rects[row].y+rects[row].h)/2560+uv.getY(i)*rects[row].h/2560);
    g.rotateY(ry);g.translate(px,py,pz);geos.push(g);
  };
  TOWER_ROWS.forEach((z,row)=>[-1,1].forEach(side=>{
    // Large adverts sit on the avenue face; smaller shop strips establish scale.
    sign((row+(side>0?1:0))%4,side*28.94,15,z,9.45,5.45,-side*Math.PI/2);
    sign(5,side*58.72,3.6,z+2,3.4,.5,-side*Math.PI/2);
    for(let bay=0;bay<5;bay++)sign(4+(row+bay)%3,side*28.87,3.95,z-9.2+bay*4.6,3.5,.56,-side*Math.PI/2);
  }));
  for(const [px,pz] of [[-13.2,14],[13.6,62]]){
    sign(7,px,2.65,pz-5.59,1.8,.23,Math.PI);
    for(const side of [-1,1])sign(7,px+side*1.272,1.45,pz,7,.4,side*Math.PI/2);
  }
  const geometry=mergeGeometries(geos);geos.forEach(g=>g.dispose());
  const material=new T.MeshBasicMaterial({map,side:T.DoubleSide,toneMapped:true});
  material.customProgramCacheKey=()=> 'city-signage-power';
  material.onBeforeCompile=shader=>{
    shader.uniforms.uPower=U.uPower;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vDistrictZ;').replace('#include <begin_vertex>','#include <begin_vertex>\nvDistrictZ=position.z;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uPower;varying float vDistrictZ;').replace('#include <color_fragment>','#include <color_fragment>\nfloat power=vDistrictZ<10.?uPower.x:(vDistrictZ<50.?uPower.y:uPower.z);diffuseColor.rgb*=mix(.28,1.,power);');
  };
  const mesh=new T.Mesh(geometry,material);mesh.name='city:signage';return mesh;
}
