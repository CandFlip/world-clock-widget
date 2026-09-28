import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionInputError } from '../lib/auth-input.ts';

const request = (origin) => new Request('https://clock.example/api/auth/session', {
  method: 'POST',
  headers: origin ? { Origin: origin } : {},
});

test('session input accepts a same-origin credential', () => {
  assert.equal(sessionInputError(request('https://clock.example'), { credential: 'token' }), null);
  assert.equal(sessionInputError(request(), { credential: 'token' }), null);
});

test('session input rejects foreign origins and invalid credential shapes', () => {
  assert.equal(sessionInputError(request('https://foreign.example'), { credential: 'token' }), 'Invalid request origin.');
  for (const value of [null, {}, { credential: 123 }, { credential: '' }, { credential: 'x'.repeat(5001) }]) {
    assert.equal(sessionInputError(request('https://clock.example'), value), 'Missing Google credential.');
  }
});
