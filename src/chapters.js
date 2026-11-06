import { SOLO_SECONDS } from './match-limits.js';
// Static chapter data shared by the launch menu, scoring and results screens.
export const CHAPTERS = [
  {
    id: 'kestrel', number: '01', name: 'Kestrel Station', tag: 'Break out of orbit',
    objective: 'Launch from Kestrel Station.',
    copy: 'Recover three gate cells from the station sentries, then cross the awakened gateway.',
    intel: ['2 strikers and a shielded Bulwark', 'Breach glass → tether → flank the rear reactor', 'Time limit 03:00'],
    accent: '#8cc6d7', par: SOLO_SECONDS,
  },
  {
    id: 'meridian', number: '02', name: 'Meridian', tag: 'Restore the gate network',
    objective: 'Clear three city sectors.',
    copy: 'Fight through the avenue. Each restored relay refits your suit before a tougher sector.',
    intel: ['3 sectors: lancers and heavy bulwarks', 'Every relay adds damage and faster recharge', 'Time limit 03:00'],
    accent: '#e6a45e', par: SOLO_SECONDS,
  },
  {
    id: 'eden', number: '03', name: 'Eden', tag: 'Face the final commander',
    objective: 'Defend the sanctuary. Defeat ARCHON.',
    copy: 'Hold the forest, survive ARCHON’s ground strikes, then restore the Heart Tree archive.',
    intel: ['Mixed squad, then the ARCHON boss', 'Dash out of red ground-strike rings', 'Time limit 03:00'],
    accent: '#8fd98e', par: SOLO_SECONDS,
  },
  {
    id: 'gauntlet', number: '04', name: 'The Gauntlet', tag: 'Three-minute survival',
    objective: 'Survive as many waves as you can.',
    copy: 'Hold Meridian against squads that never stop growing. Chain kills for a bigger multiplier. Every fifth wave brings ARCHON.',
    intel: ['Fully upgraded suit · three lives', 'Squads and threat level rise every wave', 'ARCHON commands every fifth wave', '3-minute time limit', 'Unlocks when you finish the campaign'],
    accent: '#e57a96', par: 0,
  },
  {
    id: 'team-ops', number: '05', name: 'Team Ops', tag: 'Squad versus squad',
    objective: 'Pick a side. Win the operation.',
    copy: 'Fight beside AI squadmates against an AI team on Meridian Avenue or in the Eden sanctuary. Choose COBALT or OXBLOOD, set how good the opposition is, and earn credits for the shop.',
    intel: ['3 v 3, 4 v 4 or 5 v 5 squads', 'Team deathmatch or hold the beacon', 'Pick your team and the opposition’s skill', 'Wins pay credits you can spend in the shop'],
    accent: '#5fb0ff', par: 0,
  },
];
