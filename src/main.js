import './style.css';
import './pilot-guide.css';
import './launch-menu.css';
import './results.css';
import './loadout.css';
import './shop.css';
import './mission-board.css';
import './combat-hud.css';
import './online-lobby.css';
import { OrbitalBreach, showFatal } from './game.js';

try {
  const game = new OrbitalBreach();
  // Dev-only handle so automated playtests can drive the simulation. Stripped from production builds.
  if (import.meta.env.DEV) window.__game = game;
} catch (error) {
  console.error(error);
  showFatal('The arena could not initialize. Check WebGL support and reload.', error);
}
