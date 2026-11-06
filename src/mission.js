import { encounterFor, difficultyFor } from './encounters.js';
export class Mission {
  constructor(){this.reset()}
  reset(){this.stage='briefing';this.lives=0;this.cells=0;this.wardens=0;this.defeatedWardens=new Set();this.elapsed=0;this.world='station';this.wave=0;this.messages=[];this.epoch=0;this.revision=0;this.encounterKills=new Set();this.intermission=0;this.upgrades=0;this.teamName='';this.teamObjective='';this.opening={breach:false,tether:false,reactor:false};this.say('IRIS','Pilot, wake up. The ARCHON has sealed Earth behind the Meridian gate. Launch from Kestrel, reopen the city relays, and carry the seed archive home.');}
  say(speaker,text){this.messages.push({speaker,text,id:++this.epoch})}
  launch(){if(this.stage!=='briefing')return false;this.stage='relays';this.revision++;this.say('IRIS','Launch confirmed. Three sentries hold the gate cells. Breach the marked glass, then use C to tether onto the exterior pad. The Bulwark turns slowly: flank it and shoot its orange rear reactor. Recover all three gate cells.');return true}
  recordOpening(action){
    if(this.world!=='station'||this.stage!=='relays'||!Object.hasOwn(this.opening,action)||this.opening[action])return false;
    this.opening[action]=true;return true;
  }
  get openingStep(){
    if(this.world!=='station'||this.stage!=='relays')return null;
    return !this.opening.breach?'breach':!this.opening.tether?'tether':!this.opening.reactor?'reactor':'cells';
  }
  recoverCell(){
    if(this.stage!=='relays')return false;this.cells=Math.min(3,this.cells+1);
    if(this.cells===3){this.stage='portal';this.messages=[];this.say('IRIS','The Meridian gateway is awake. The city below holds the route to Eden. Cross the green ring.');}return true;
  }
  enterCity(){if(this.stage!=='portal')return false;this.world='city';this.stage='city-combat';this.wave=0;this.encounterKills.clear();this.revision++;this.messages=[];this.say('IRIS','Meridian. Empty streets, but its machines are still awake. Clear the defenders, then use each marked relay. We need all three to reach Eden.');return true}
  defeatEnemy(id){
    if(!['relays','city-combat','sanctuary','gauntlet'].includes(this.stage)||this.encounterKills.has(id))return false;
    this.encounterKills.add(id);if(this.world==='eden'){this.defeatedWardens.add(`${this.wave}:${id}`);this.wardens=this.defeatedWardens.size}
    if(this.encounterKills.size<this.composition.length)return true;
    if(this.stage==='gauntlet'){this.intermission=4;this.say('IRIS',`Wave ${this.wave+1} cleared. Suit refit in progress. Stay sharp.`);return true}
    if(this.world==='city'){this.stage='city-uplink';this.say('IRIS','Sector clear. Move to the marked relay and press E. Your suit will refit before the next encounter.');}
    else if(this.world==='eden'){
      if(this.wave===0){this.intermission=6;this.say('ARCHON','You carried the seed this far. Now watch it burn.');}
      else{this.stage='beacon';this.messages=[];this.say('IRIS','ARCHON is down. Reach the Heart Tree and restore the archive. It is time to bring the forest home.');}
    }
    return true;
  }
  activateUplink(){
    if(this.stage!=='city-uplink')return false;this.upgrades++;
    if(this.wave<2){this.wave++;this.stage='city-combat';this.encounterKills.clear();this.revision++;this.say('IRIS',this.wave===1?'Relay one restored. Weapon amplifiers online. Heavy units are entering the civic district.':'Relay two restored. Thrusters and missile recharge upgraded. One final city sector stands between us and Eden.');}
    else{this.stage='city-portal';this.messages=[];this.say('IRIS','Meridian is connected. The Eden gate is open at the north end of the avenue. Cross it before ARCHON follows.');}return true;
  }
  // Bonus mode: the city, a fully upgraded suit, three lives and waves that never stop coming.
  startGauntlet(){this.world='city';this.stage='gauntlet';this.wave=0;this.upgrades=3;this.lives=3;this.intermission=0;this.encounterKills.clear();this.revision++;this.messages=[];this.say('IRIS','Gauntlet engaged. ARCHON is throwing everything it has at Meridian. Chain kills for a bigger multiplier, and expect a commander every fifth wave.');return true}
  // Team operation: no scripted waves; src/team-battle.js runs the match and writes the objective line.
  startTeam(op){this.world=op.arena==='eden'?'eden':'city';this.stage='team';this.wave=0;this.upgrades=0;this.lives=0;this.intermission=0;this.encounterKills.clear();this.teamName=op.name;this.teamObjective='';this.revision++;this.messages=[];this.say('IRIS','Squad is ready, pilot. Your allies are marked in blue. Stay close to them and focus the red markers.');return true}
  enterEden(){if(this.stage!=='city-portal')return false;this.stage='sanctuary';this.world='eden';this.wave=0;this.encounterKills.clear();this.revision++;this.messages=[];this.say('IRIS','This is what we are fighting for. The Heart Tree shelters the last seed archive. Stop the wardens, then face ARCHON.');return true}
  defeatWarden(id){return this.defeatEnemy(id)}
  tick(dt){if(this.intermission>0){this.intermission=Math.max(0,this.intermission-dt);if(this.intermission===0){if(this.stage==='gauntlet'){this.wave++;this.encounterKills.clear();this.revision++;this.say('IRIS',this.composition.includes('archon')?'ARCHON on the field. Watch the ground marks and dash out of the red ring.':`Wave ${this.wave+1} inbound. ${this.composition.length} hostiles.`)}else{this.wave=1;this.encounterKills.clear();this.revision++;this.say('IRIS','ARCHON incoming. Watch the ground marks, dash out of the blast zones, and break its core.')}}}}
  restore(){if(this.stage!=='beacon')return false;this.stage='complete';this.messages=[];this.say('IRIS','The archive is alive. Meridian will have forests again. You brought us home, pilot.');return true}
  get composition(){return encounterFor(this.stage==='gauntlet'?'gauntlet':this.world,this.wave)}
  get difficulty(){return difficultyFor(this.stage==='gauntlet'?'gauntlet':this.world,this.wave)}
  get alive(){return Math.max(0,this.composition.length-this.encounterKills.size)}
  get combatActive(){return ['relays','city-combat','sanctuary','gauntlet'].includes(this.stage)&&!this.intermission&&this.alive>0}
  get objective(){return{gauntlet:this.intermission?`Next wave in ${Math.ceil(this.intermission)}`:`Wave ${this.wave+1} · ${this.alive} hostiles`,briefing:'Activate the launch console · E',relays:`Recover gate cells · ${this.cells} / 3`,portal:'Cross the Meridian gateway','city-combat':`Clear sector ${this.wave+1} · ${this.alive} hostiles`,'city-uplink':`Restore relay ${this.wave+1} · E`,'city-portal':'Cross the Eden gateway',sanctuary:this.intermission?'ARCHON approaching…':this.wave===1?'Defeat ARCHON and its escorts':`Defend the sanctuary · ${this.alive} hostiles`,beacon:'Restore the Heart Tree archive · E',team:this.teamObjective||this.teamName,complete:'Eden restored · Explore the sanctuary'}[this.stage]}
  get title(){return this.stage==='team'?`05 · ${this.teamName}`:this.stage==='gauntlet'?`04 · GAUNTLET · WAVE ${this.wave+1}`:this.world==='station'?'01 · ESCAPE FROM KESTREL':this.world==='city'?'02 · THE SILENT CITY':this.stage==='complete'?'CAMPAIGN COMPLETE':'03 · THE LAST FOREST'}
  get gateOpen(){return this.world==='station'?this.stage==='portal':this.world==='city'?this.stage==='city-portal':false}
}
