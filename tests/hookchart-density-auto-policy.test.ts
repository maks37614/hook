import test from 'node:test';
import assert from 'node:assert/strict';
import {autoDensityBaseCut,autoDensitySideCuts,passesAutoLocalLiquidity} from '../src/components/hookchart/densityAutoPolicy';
test('turnover and spread floors stay capped and ignore missing data',()=>{
 assert.equal(autoDensityBaseCut(4_000,1,1e9),20_000);
 assert.equal(autoDensityBaseCut(4_000,1,0),4_000);
 assert.equal(autoDensityBaseCut(4_000,1,NaN),4_000);
 assert.ok(Math.abs(autoDensityBaseCut(4_000,1,1e9,2)-28_000)<=1);
 assert.equal(autoDensityBaseCut(0,1,1e9),0);
 assert.equal(autoDensityBaseCut(4_000,2,1e9),40_000);
});
test('flow cut is side-specific, capped and uses actual opposite executions',()=>{
 assert.deepEqual(autoDensitySideCuts(4_000,0,400_000),{bidCut:10_000,askCut:4_000});
 assert.deepEqual(autoDensitySideCuts(400_000,0,10_000_000),{bidCut:800_000,askCut:400_000});
 assert.deepEqual(autoDensitySideCuts(4_000,0,1e10),{bidCut:10_000,askCut:4_000});
});
test('one wall is not hidden by another, but ordinary small amounts remain filtered',()=>{
 assert.equal(passesAutoLocalLiquidity(50_000,4_000,80_000),true);
 assert.equal(passesAutoLocalLiquidity(6_000,4_000,80_000),false);
 assert.equal(passesAutoLocalLiquidity(6_000,4_000,5_000),true);
 assert.equal(passesAutoLocalLiquidity(3_999,4_000,0),false);
});
