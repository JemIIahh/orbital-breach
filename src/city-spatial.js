// A static XZ broad phase. Long rays use the same grid as body sweeps; results
// are deduplicated and retain insertion order for deterministic edge contacts.
export function makeBoxIndex(boxes, cellSize=16){
  const cells=new Map();
  const key=(x,z)=>`${x}:${z}`;
  boxes.forEach((b,i)=>{
    for(let x=Math.floor(b.min.x/cellSize);x<=Math.floor(b.max.x/cellSize);x++)
      for(let z=Math.floor(b.min.z/cellSize);z<=Math.floor(b.max.z/cellSize);z++){
        const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);
      }
  });
  return {query(a,b=a,pad=0){
    const ids=new Set();
    const x0=Math.floor((Math.min(a.x,b.x)-pad)/cellSize),x1=Math.floor((Math.max(a.x,b.x)+pad)/cellSize);
    const z0=Math.floor((Math.min(a.z,b.z)-pad)/cellSize),z1=Math.floor((Math.max(a.z,b.z)+pad)/cellSize);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const i of cells.get(key(x,z))||[])ids.add(i);
    return [...ids].sort((a,b)=>a-b).map(i=>boxes[i]);
  }};
}
