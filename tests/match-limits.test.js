import test from 'node:test';
import assert from 'node:assert/strict';
import { simulation } from './support.js';
import { Mission } from '../src/mission.js';
import { ChapterRun } from '../src/scoring.js';
import { CHAPTERS } from '../src/chapters.js';
function timedGame(stage='relays'){
  const game=simulation();game.mission=new Mission();game.mission.stage=stage;game.run=new ChapterRun();game.run.time=180-1/60;game.started=true;game.buttons=[false,false];game.ui.showResults=result=>{game.result=result;return false};return game;
}
test('campaign hits the three-minute cap without awarding completion or unlocking a chapter',()=>{
  const game=timedGame();game.profile={unlocked:0};game.simulate(1/60);assert.equal(game.running,false);assert.equal(game.ended,true);assert.equal(game.result.timedOut,true);assert.equal(game.result.time,180);assert.equal(game.result.breakdown.timeBonus,0);assert.equal(game.profile.unlocked,0);assert.equal(game.mission.stage,'relays');
});
test('a new campaign chapter starts a fresh three-minute timer',()=>{
  const game=simulation();game.run=new ChapterRun();game.run.time=179;game.remaining=1;game.suppressResults=true;game.completeChapter(0);assert.equal(game.run.time,0);assert.equal(game.remaining,180);assert.equal(CHAPTERS[0].par,180);
});
test('gauntlet banks its score at three minutes even if lives remain',()=>{
  const game=timedGame('gauntlet');game.mission.wave=3;game.mission.lives=3;game.run.score=700;game.simulate(1/60);assert.equal(game.result.mode,'gauntlet');assert.equal(game.result.time,180);assert.equal(game.result.waves,3);assert.equal(game.mission.lives,3);
});
