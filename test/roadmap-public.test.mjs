import test from 'node:test';
import assert from 'node:assert/strict';
import {publicIdeas, parseIdeas} from '../lib/roadmap.ts';

test('published suggestions are selectable cards in the same list', () => {
 const cards=publicIdeas(undefined,[{id:'123',title:'A community idea',problem:'A real problem',outcome:'A useful outcome'}]);
 assert.equal(cards.length,4);assert.equal(cards[3].id,'suggestion-123');assert.equal(cards[3].status,'community');assert.equal(cards[3].title.en,'A community idea');
});
test('hidden cards cannot receive votes, and empty translations fall back', () => {
 const cards=parseIdeas();cards[0].status='hidden';cards[1].title.en='';cards[1].description.ru='';
 const visible=publicIdeas(JSON.stringify(cards),[]);
 assert.equal(visible.length,2);assert.equal(visible[0].title.en,cards[1].title.ru);assert.equal(visible[0].description.ru,cards[1].description.en);
 assert.equal(cards[1].title.en,'');
});
test('hiding and restoring preserves stable option IDs', () => {
 const card=parseIdeas()[0];const original=card.id;card.status='hidden';assert.deepEqual(publicIdeas(JSON.stringify([card]),[]),[]);
 card.status='idea';assert.equal(publicIdeas(JSON.stringify([card]),[])[0].id,original);
});
