export const FLIGHT_LESSONS = [
  { title:'Move your mech', text:'Use W A S D to move. Move your mouse to look around.', keys:['W A S D','MOUSE'], test:m=>m.distance>=4&&m.look>=.2 },
  { title:'Boost. Then dodge.', text:'Hold SHIFT while moving to sprint. Tap X for a quick thruster dash.', keys:['SHIFT','X'], test:m=>m.boost>=4&&m.actions.has('dash') },
  { title:'Fire both arm weapons', text:'Aim at a marked mech. Hold LEFT CLICK for the Gatling; RIGHT CLICK fires flak. Release to cool, or press R to vent heat.', keys:['LEFT CLICK','RIGHT CLICK','R'], test:m=>m.actions.has('left')&&m.actions.has('right') },
  { title:'Launch your shoulder missile', text:'Aim toward a hostile and press G. The blast damages nearby enemies. Missiles recharge automatically.', keys:['G'], test:m=>m.actions.has('missile') },
  { title:'Jump and take flight', text:'Tap SPACE to jump; hold it to rise. F releases magnetic boots. Jump and boost into the middle of a window to shatter it and fly outside.', keys:['SPACE','SHIFT','F'], test:m=>m.jets>=.35&&m.actions.has('freeFlight') },
  { title:'Hook. Reel. Glide.', text:'Aim at a solid wall, ceiling or hull and press C to fire your tether. It pulls you in and locks your boots to the surface. C releases it; F detaches your boots.', keys:['C','F'], test:m=>m.actions.has('grapple') }
];

export class Onboarding {
  constructor(){this.reset()}
  reset(){this.active=true;this.index=0;this.confirm=0;this.metrics={distance:0,look:0,boost:0,jets:0,actions:new Set()};this.previous=null;this.justCompleted=false}
  record(action,value=1){if(!this.active)return;if(action==='look')this.metrics.look+=Math.abs(value);else this.metrics.actions.add(action)}
  skip(){this.active=false;this.justCompleted=true}
  update(dt,game){
    if(!this.active)return;
    const p=game.player.position;
    if(this.previous){const distance=Math.hypot(p.x-this.previous.x,p.y-this.previous.y,p.z-this.previous.z);if(distance<3){this.metrics.distance+=distance;if(game.keys.has('ShiftLeft')||game.keys.has('ShiftRight'))this.metrics.boost+=distance}}
    this.previous={x:p.x,y:p.y,z:p.z};
    if(game.keys.has('Space'))this.metrics.jets+=dt;
    if(!FLIGHT_LESSONS[this.index].test(this.metrics)){this.confirm=0;return}
    this.confirm+=dt;
    if(this.confirm<.65)return;
    this.confirm=0;this.index++;
    if(this.index>=FLIGHT_LESSONS.length){this.active=false;this.justCompleted=true}
  }
  get lesson(){return this.active?FLIGHT_LESSONS[this.index]:null}
  get tasks(){
    const m=this.metrics,a=m.actions;
    return [
      [{label:'Move 4 m',done:m.distance>=4},{label:'Look around',done:m.look>=.2}],
      [{label:'Sprint 4 m with Shift + W',done:m.boost>=4},{label:'Tap X once',done:a.has('dash')}],
      [{label:'Fire left weapon',done:a.has('left')},{label:'Fire right weapon',done:a.has('right')}],
      [{label:'Press G to launch a missile',done:a.has('missile')}],
      [{label:'Hold Space for jets',done:m.jets>=.35},{label:'Press F for free flight',done:a.has('freeFlight')}],
      [{label:'Aim at a surface and press C',done:a.has('grapple')}]
    ][this.index]||[];
  }
}
