export const ENEMY_TYPES={
  striker:{name:'STRIKER',color:'#d46c36',glow:'#ffbd67',armor:'#3c3430',health:75,shield:20,speed:1.45,range:4.2,damage:17,cooldown:1.25,shotSpeed:40,attack:'rush',tip:'Keep moving. Dash sideways when it charges.'},
  gunner:{name:'GUNNER',color:'#a34743',glow:'#ff9a70',armor:'#b7ada1',health:100,shield:35,speed:1,range:20,damage:11,cooldown:1.65,shotSpeed:50,attack:'burst',tip:'Fires four-round bursts that track you. Break line of sight or dash.'},
  sniper:{name:'LANCER',color:'#6051a0',glow:'#dcacff',armor:'#4d546d',health:80,shield:30,speed:.85,range:30,damage:34,cooldown:2.9,shotSpeed:72,attack:'snipe',tip:'A violet sight line warns of its charged shot. Break the line before it fires.'},
  bulwark:{name:'BULWARK',color:'#948029',glow:'#ffe291',armor:'#353c43',health:190,shield:80,speed:.7,range:16,damage:21,cooldown:2.3,shotSpeed:34,attack:'blast',tip:'Front armor resists bullets. Grapple behind it and shoot the orange reactor. An airborne reactor kill recharges your dash. Missiles also work.'},
  archon:{name:'ARCHON',color:'#202e39',glow:'#ff5148',armor:'#c3b4a0',health:520,shield:160,speed:.85,range:19,damage:13,cooldown:2.1,shotSpeed:40,attack:'boss',tip:'Alternates volleys and marked ground strikes. Leave the red ring.'}
};
export const CAMPAIGN_ENCOUNTERS={
 station:[['striker','bulwark','striker']],
 city:[['striker','gunner','sniper'],['striker','gunner','bulwark','sniper'],['striker','striker','sniper','bulwark','gunner']],
 eden:[['striker','sniper','bulwark','gunner'],['archon','striker','gunner']]
};
// Endless Gauntlet. Waves are deterministic so runs are comparable: the roster widens with the wave number,
// squads grow to the six-mech cap, and every fifth wave is an ARCHON commander with escorts.
export const GAUNTLET_BOSS_EVERY=5;
export function gauntletWave(wave=0){
  const roster=['striker','gunner','sniper','bulwark'];
  if(wave%GAUNTLET_BOSS_EVERY===GAUNTLET_BOSS_EVERY-1)return['archon',...roster.slice(0,Math.min(4,2+Math.floor(wave/GAUNTLET_BOSS_EVERY)))];
  const size=Math.min(6,3+Math.floor(wave/2)),pool=roster.slice(0,wave<1?2:wave<3?3:4);
  return Array.from({length:size},(_,i)=>pool[(i+wave)%pool.length]);
}
export function encounterFor(realm,wave=0){return realm==='gauntlet'?gauntletWave(wave):CAMPAIGN_ENCOUNTERS[realm]?.[wave]||[]}
export function difficultyFor(realm,wave=0){const tier=realm==='gauntlet'?3+Math.floor(wave*.75):(realm==='city'?2:realm==='eden'?5:1)+wave;return{tier,health:1+(tier-1)*.10,damage:1+(tier-1)*.08,cadence:Math.max(.65,1-(tier-1)*.045)}}
export const CITY_UPLINKS=[{x:-22,z:-6,name:'TRANSIT RELAY'},{x:23,z:29,name:'CIVIC ARRAY'},{x:0,z:68,name:'MERIDIAN GATE'}];
