import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLabel, parseAmount, parseDate } from '../src/normalization.js';

test('normalizes unambiguous labels', () => { assert.equal(canonicalLabel(' ENERGY '), 'Energy'); assert.equal(canonicalLabel('energy'), 'Energy'); });
test('parses currency without treating empty values as zero', () => { assert.equal(parseAmount('₹ 1,200.50'), 1200.5); assert.equal(parseAmount(''), null); });
test('rejects ambiguous slash dates', () => { assert.equal(parseDate('09/10/2026'), null); assert.equal(parseDate('15/09/2026').toISOString().slice(0, 10), '2026-09-15'); assert.equal(parseDate('invalid date'), null); });
