const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function selectMarkerLabels(candidates,reserved=[],limit=3){
  const accepted=[],occupied=reserved.filter(r=>r.right>r.left&&r.bottom>r.top);
  for(const item of [...candidates].sort((a,b)=>(b.priority||0)-(a.priority||0)||a.distance-b.distance||a.index-b.index)){
    const rect={left:item.x-83,right:item.x+83,top:item.y-5,bottom:item.y+49};
    if(occupied.some(r=>overlaps(rect,r)))continue;
    occupied.push(rect);accepted.push(item);if(accepted.length>=limit)break;
  }
  return accepted;
}
