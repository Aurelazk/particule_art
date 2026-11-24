import assert from 'node:assert/strict';
// mocks navigateur pour Node
global.matchMedia = () => ({ matches: false });
global.innerWidth = 1366; global.innerHeight = 768;
global.devicePixelRatio = 1;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test-node', deviceMemory: 4, hardwareConcurrency: 4, connection: { effectiveType: '4g', saveData: false } }, configurable: true });
const m = await import('./scripts/vl-core.js');
const { clamp, fin, lerp, smoothstep, esc, r3, mulberry32, shuffle, sub, add, mul, dot, cross, norm, mPerspective, mLookAt, mMul, mPoint, catmull, catmull3, hsl2rgb, rgb2hsl, REDUCED, MOBILE, seedOf, yearOf, groupKey, safeFrame, frameDist, faceRotation, createWork, ordered, buildStations, stationAt, chapterProgress, STRIDE, TAU } = m;

// clamp
assert.strictEqual(clamp(5, 0, 10), 5);
assert.strictEqual(clamp(-1, 0, 10), 0);
assert.strictEqual(clamp(20, 0, 10), 10);

// lerp
assert.strictEqual(lerp(0, 10, 0.5), 5);
assert.strictEqual(lerp(0, 10, 0), 0);
assert.strictEqual(lerp(0, 10, 1), 10);

// smoothstep
assert.strictEqual(smoothstep(0, 10, 0), 0);
assert.strictEqual(smoothstep(0, 10, 10), 1);
const s5 = smoothstep(0, 10, 5); assert.ok(s5 >= 0 && s5 <= 1, 'smoothstep mid in [0,1]');

// esc
assert.strictEqual(esc('<script>'), '&lt;script&gt;');

// r3
assert.strictEqual(r3(1.2345), 1.235);
assert.strictEqual(r3(NaN), 0);

// mulberry32 determinism
const r1 = mulberry32(7); const r2 = mulberry32(7);
assert.strictEqual(r1(), r2());

// vector ops
assert.deepStrictEqual(sub([1,2,3],[0,1,0]), [1,1,3]);
assert.deepStrictEqual(add([1,2,3],[0,1,0]), [1,3,3]);
assert.deepStrictEqual(mul([1,2,3],2), [2,4,6]);
assert.strictEqual(dot([1,0,0],[0,1,0]), 0);
assert.strictEqual(dot([1,0,0],[1,0,0]), 1);
const n = norm([3,4,0]); assert.strictEqual(n[0], 0.6); assert.strictEqual(n[1], 0.8);

// matrices
const P = mPerspective(1, 1, 0.1, 100); assert.strictEqual(P.length, 16);
const L = mLookAt([0,0,10],[0,0,0],[0,1,0]); assert.strictEqual(L.length, 16);
const MP = mMul(P, L); assert.strictEqual(MP.length, 16);
const pt = mPoint(L, [0,0,0]); assert.strictEqual(pt.length, 4);

// catmull
assert.strictEqual(catmull(0, 1, 2, 3, 0), 1);
assert.strictEqual(catmull(0, 1, 2, 3, 1), 2);

// hsl2rgb / rgb2hsl round trip
const hsl = hsl2rgb(210, 0.5, 0.5);
assert.strictEqual(hsl.length, 3);

// seedOf
assert.strictEqual(typeof seedOf('abc'), 'number');
assert.strictEqual(seedOf('abc'), seedOf('abc'));

// yearOf
assert.strictEqual(yearOf({year:'1599–1600'}), 1599);
assert.strictEqual(yearOf({year:''}), 2000);

// groupKey
assert.strictEqual(groupKey({artist:'A'},'artist'), 'A');
assert.strictEqual(groupKey({},'movement'), 'Autres');

// safeFrame / frameDist / faceRotation
const sf = safeFrame(); assert.ok(sf.w > 0 && sf.h > 0);
const fd = frameDist({aspect:1.35,scale:1.36}); assert.ok(fd > 0);
const fr = faceRotation([0,0,-1]); assert.strictEqual(fr.length, 2);

// createWork
const w = createWork({id:'t1',title:'T',artist:'A',year:'2000',width:100,height:100}, null, null);
assert.strictEqual(w.id, 't1');
assert.strictEqual(w.aspect, 1);

// ordered
assert.deepStrictEqual(ordered([{visible:true},{visible:false},{visible:true}]).length, 2);

// chapterProgress
const cp0 = chapterProgress(0, 10); assert.ok(cp0 >= 0 && cp0 < 0.1, 'chapter 0 near start');
assert.ok(chapterProgress(5, 10) > 0 && chapterProgress(5, 10) < 1);
assert.strictEqual(chapterProgress(0, 0), 0);

// TAU / STRIDE
assert.strictEqual(STRIDE, 13);
assert.ok(TAU > 6);

console.log('TOUS LES TESTS UNITAIRES vl-core PASSÉ');
