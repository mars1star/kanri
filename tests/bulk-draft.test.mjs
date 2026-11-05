import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetUpdate, buildBatchEntries, parseOptionalCount } from '../src/bulkDraft.ts';

const inventory = () => ({
  places: [{ id: 'a', name: '教室' }, { id: 'b', name: '体育館' }],
  items: [{ id: 'desk', name: '机', unit: '台' }, { id: 'chair', name: '椅子', unit: '脚' }],
  counts: { a: { desk: 12, chair: 20 }, b: { desk: 8 } },
  targets: { a: { desk: 10, chair: 25 }, b: { desk: 30 } },
});

test('目標の空欄は保持し、入力した0と数値だけを反映する', () => {
  const data = inventory();
  const original = structuredClone(data);
  const result = buildTargetUpdate(data, { a: { desk: '', chair: '0' }, b: { chair: '１５' } });
  assert.equal(result.changed, true);
  assert.deepEqual(result.targets, { a: { desk: 10, chair: 0 }, b: { desk: 30, chair: 15 } });
  assert.deepEqual(data, original);
});

test('全て空欄、入力の取り消し、同じ目標値では変更しない', () => {
  for (const draft of [{}, { a: { chair: '' } }, { a: { desk: '10' } }]) {
    assert.deepEqual(buildTargetUpdate(inventory(), draft), { targets: inventory().targets, changed: false });
  }
});

test('個数は空欄を除外し、明示した0だけを0に設定する', () => {
  const data = inventory();
  assert.deepEqual(buildBatchEntries(data, 'a', { desk: '', chair: '0' }, 'adjust'), [{ item: 'chair', quantity: 0 }]);
  assert.deepEqual(buildBatchEntries(data, 'a', {}, 'adjust'), []);
  assert.deepEqual(buildBatchEntries(data, 'a', { desk: '12' }, 'adjust'), []);
  assert.deepEqual(buildBatchEntries(data, 'a', { desk: '3', chair: '' }, 'transfer'), [{ item: 'desk', quantity: 3 }]);
});

test('再取得した目標に変更を重ね、未入力の値を上書きしない', () => {
  const data = inventory();
  data.targets.b.desk = 45;
  assert.equal(buildTargetUpdate(data, { a: { chair: '5' } }).targets.b.desk, 45);
});

test('空欄と0を区別し、範囲外や不正な数値を保存しない', () => {
  assert.equal(parseOptionalCount(' '), undefined);
  assert.equal(parseOptionalCount('０'), 0);
  assert.equal(parseOptionalCount('99,999'), 99999);
  for (const value of ['-1', '1.5', '100000', 'NaN', '1e3']) assert.throws(() => parseOptionalCount(value));
});
