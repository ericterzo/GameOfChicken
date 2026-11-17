// Finds every sentence the app can show and checks each language has it.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it as test } from 'vitest';
import { MODE_BLURBS, MODE_NAMES, RULESET_BLURBS, RULESET_NAMES } from '../game/rules';
import { it } from './it';
import { pirate } from './pirate';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

function allKeys(srcDir: string): string[] {
  const keys = new Set<string>([...Object.values(MODE_NAMES), ...Object.values(MODE_BLURBS), ...Object.values(RULESET_NAMES), ...Object.values(RULESET_BLURBS), 'Walking in…']);
  for (const path of files(srcDir)) {
    const text = readFileSync(path, 'utf8');
    // t('…') anywhere, and the plain-English messages thrown or returned by the rules.
    for (const m of text.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) keys.add(m[1]);
    if (/game[\\/]rules\.ts$/.test(path)) {
      for (const m of text.matchAll(/RuleError\('([^']+)'\)/g)) keys.add(m[1]);
      for (const m of text.matchAll(/RuleError\(`([^`]+)`\)/g)) keys.add(m[1].replace('${MIN_MEAL_S}', '5'));
      for (const m of text.matchAll(/return (?:yard\.eating\.uid === uid \? )?'([A-Z][^']+)'(?: : '([A-Z][^']+)')?;/g)) {
        keys.add(m[1]);
        if (m[2]) keys.add(m[2]);
      }
    }
    if (/statsTable\.ts$|lookEditor\.ts$/.test(path)) {
      for (const m of text.matchAll(/(?:\w+: |\['\w+', )'([A-Z][^']*)'/g)) keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

describe('languages', () => {
  const keys = allKeys(join(__dirname, '..'));
  const gaps = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join();

  for (const [name, book] of [['Italian', it], ['Pirate', pirate]] as const) {
    test(`${name} has every sentence, with the same gaps`, () => {
      if (process.env.LIST_KEYS) writeFileSync(process.env.LIST_KEYS, JSON.stringify(keys, null, 1));
      expect(keys.filter((k) => !(k in book))).toEqual([]);
      expect(keys.filter((k) => k in book && gaps(book[k]) !== gaps(k))).toEqual([]);
      // Nothing left over from sentences the app no longer uses.
      expect(Object.keys(book).filter((k) => !keys.includes(k))).toEqual([]);
    });
  }
});
