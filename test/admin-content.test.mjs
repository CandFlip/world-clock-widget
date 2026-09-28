import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIdeas } from '../lib/roadmap.ts';
import { mergeMethodRows } from '../lib/support-method-merge.ts';
import { siteCopy } from '../lib/site-strings.ts';

test('roadmap uses defaults and preserves an intentionally empty list', () => {
  assert.equal(parseIdeas().length, 3);
  assert.deepEqual(parseIdeas('[]'), []);
  assert.equal(parseIdeas('{broken').length, 3);
});

test('method overrides replace defaults without duplicates; hidden defaults stay hidden', () => {
  const base = { id: 'bank', label: 'Bank', instructions: '123', image: '', url: '', active: '1' };
  const hidden = { ...base, label: 'Edited', active: '0' };
  const custom = { ...base, id: 'custom', label: 'Custom' };
  assert.deepEqual(mergeMethodRows([base], [hidden, custom]).map((row) => row.id), ['custom']);
  assert.deepEqual(mergeMethodRows([base], [hidden, custom], true).map((row) => row.label), ['Edited', 'Custom']);
  assert.deepEqual(mergeMethodRows([base], [{ ...base, active: '-1' }], true), []);
});

test('site copy applies only known text fields', () => {
  const copy = siteCopy('ru', JSON.stringify({ headline: 'Новый заголовок', unknown: 'ignored' }));
  assert.equal(copy.headline, 'Новый заголовок');
  assert.equal(copy.navRoadmap, 'Планы');
  assert.equal('unknown' in copy, false);
});
