export const RADIUS=72;
export const HEIGHT=11;
export const HALF_WIDTH=8.5;
export const BAY_COUNT=96;
export const TAU=Math.PI*2;
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const polarAngle=p=>Math.atan2(p.x,-p.y);
export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
