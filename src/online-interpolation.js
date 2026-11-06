// Remote actors render 100 ms behind the server, interpolating two authoritative poses.
// No extrapolation through walls when packets stop arriving.
export class PoseBuffer {
  constructor(delay=.1){this.delay=delay;this.frames=[]}
  push(time,pose){if(this.frames.length&&time<=this.frames.at(-1).time)return;this.frames.push({time,pose});if(this.frames.length>12)this.frames.shift()}
  sample(time){const at=time-this.delay;while(this.frames.length>2&&this.frames[1].time<=at)this.frames.shift();const a=this.frames[0],b=this.frames[1];if(!a)return null;if(!b||a.pose.epoch!==b.pose.epoch)return b?.pose||a.pose;const t=Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time))),out={...b.pose};for(const key of ['position','velocity','up','forward'])out[key]=a.pose[key].map((v,i)=>v+(b.pose[key][i]-v)*t);out.pitch=a.pose.pitch+(b.pose.pitch-a.pose.pitch)*t;return out}
}
