import { test } from "node:test";
import assert from "node:assert/strict";
import { Biome, LandscapeField, Surface, type LandscapeSample } from "../src/landscape.ts";
import { Tuning } from "../src/tuning.ts";

test("one-query cache reuses geometry across modes and observes seed, enable and tuning edits", (t) => {
  class CountedField extends LandscapeField {
    gridCalls = 0;
    override gridX(x: number, z: number) { this.gridCalls++; return super.gridX(x, z); }
    override gridZ(x: number, z: number) { this.gridCalls++; return super.gridZ(x, z); }
  }
  const field = new CountedField(23), x = -1000000.13, z = 1000000.37;
  field.heightAt(x, z); const located = field.gridCalls;
  field.surfaceAt(x, z); field.hazardKindAt(x, z); field.supportAt(x, z); field.ledgeHeightAt(x, z);
  assert.equal(field.gridCalls, located);
  field.seed = 1979;
  assert.equal(field.heightAt(x, z), new LandscapeField(1979).heightAt(x, z));
  assert.ok(field.gridCalls > located);
  field.reset(23); field.heightAt(x, z); const resetCalls = field.gridCalls;
  field.enabled = false;
  assert.equal(field.heightAt(x, z), 0); assert.equal(field.gridCalls, resetCalls);
  field.hazardKindAt(x, z); field.enabled = true;
  assert.equal(field.heightAt(x, z), new LandscapeField(23).heightAt(x, z));
  const scale = Tuning.landscape.heightScale, size = Tuning.landscape.biomeSize;
  try {
    Tuning.landscape.heightScale = scale * 2; Tuning.landscape.biomeSize = size * 1.1;
    const fresh = new LandscapeField(23);
    assert.equal(field.heightAt(x, z), fresh.heightAt(x, z));
    assert.equal(field.surfaceAt(x, z), fresh.surfaceAt(x, z));
    assert.equal(field.hazardKindAt(x, z), fresh.hazardKindAt(x, z));
  } finally { Tuning.landscape.heightScale = scale; Tuning.landscape.biomeSize = size; }
  let sum = 0, elapsed = 0;
  for (let pass = 0; pass < 3; pass++) {
    field.gridCalls = 0; const start = performance.now();
    for (let i = 0; i < 20000; i++) {
      const px = 100 + i * 0.017, pz = -400 + i * 0.031;
      sum += field.heightAt(px, pz) + field.surfaceAt(px, pz) + field.hazardKindAt(px, pz);
    }
    elapsed = performance.now() - start;
  }
  t.diagnostic(`20k query groups: ${elapsed.toFixed(1)}ms, ${field.gridCalls} lattice calls, checksum ${sum.toFixed(3)}`);
  assert.ok(field.gridCalls < 400000, "bounded central-first geometry work across 60,000 API calls");
});

test("high mountain cores own deterministic non-desert biomes", () => {
  const field = new LandscapeField(1979); const seen = new Set<Biome>(); let cores = 0;
  for (let iz = -8; iz <= 8; iz++) for (let ix = -8; ix <= 8; ix++) {
    if (field.hash(ix, iz, 114) >= 0.64) continue;
    const x = (ix + 0.35 + 0.3 * field.hash(ix, iz, 115)) * 320;
    const z = (iz + 0.35 + 0.3 * field.hash(ix, iz, 116)) * 320;
    assert.ok(field.vertexHeight(x, z) > 120);
    const biome = field.biomeAt(x, z); assert.notEqual(biome, Biome.Desert);
    assert.equal(field.biomeAt(x + 20, z), biome); seen.add(biome); cores++;
  }
  assert.ok(cores > 50); assert.equal(seen.size, 2);
});

test("seed-rotated bridge curves cover all heading sectors with matching tangents and support", () => {
  const field = new LandscapeField(), sectors = new Set<number>(), bridgeSectors = new Set<number>();
  let checked = 0;
  for (let seed = 1; seed <= 64; seed++) {
    field.reset(seed);
    const theta = field.hash(0, 0, 303) * Math.PI * 2, c = Math.cos(theta), s = Math.sin(theta);
    for (let along = -800; along <= 800; along += 57) {
      const n = 96 + 9 * Math.sin(along / 83);
      const x = c * n - s * along, z = s * n + c * along;
      assert.ok(field.bridgeMaskAt(x, z) >= 3.6 - 1e-10);
      assert.equal(field.supportAt(x, z), true, `seed ${seed}, along ${along}`);
      assert.equal(field.supportAt(field.routeX(z), z), true);
      const d = x - field.routeX(z), route = 4.1 - Math.abs(d - Math.round(d / 32) * 32);
      if (route >= 3.59) continue; // At intersections the dominant route owns heading.
      const heading = field.bridgeAngleAt(x, z), step = 0.01;
      const dn = 9 * (Math.sin((along + step) / 83) - Math.sin((along - step) / 83));
      const tx = c * dn - s * 2 * step, tz = s * dn + c * 2 * step;
      const dot = (-Math.sin(heading) * tx + Math.cos(heading) * tz) / Math.hypot(tx, tz);
      assert.ok(dot > 1 - 1e-10, "heading matches numerical curved-path tangent");
      const sector = Math.floor(((heading + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4));
      sectors.add(sector);
      if (field.surfaceAt(x, z) === Surface.Bridge) bridgeSectors.add(sector);
      checked++;
    }
  }
  assert.ok(checked > 1000); assert.equal(sectors.size, 8); assert.equal(bridgeSectors.size, 8);
  field.seed = 1979;
  assert.equal(field.bridgeMaskAt(133, -277), new LandscapeField(1979).bridgeMaskAt(133, -277));
  assert.equal(field.bridgeAngleAt(133, -277), new LandscapeField(1979).bridgeAngleAt(133, -277));
});

test("warped triangles interpolate heights and clipping scalars at both diagonals and world signs", () => {
  const field = new LandscapeField(1979);
  for (const origin of [0, -250000, 250000]) for (let j = -4; j <= 4; j++) {
    const ix = origin + j, iz = -origin + j * 3;
    assert.ok(Math.hypot(field.gridX(ix, iz) - ix * 4, field.gridZ(ix, iz) - iz * 4) <= 0.85);
    for (const indices of [[[ix, iz], [ix + 1, iz], [ix, iz + 1]], [[ix + 1, iz + 1], [ix, iz + 1], [ix + 1, iz]]]) {
      const points = indices.map(([i, k]) => [field.gridX(i, k), field.gridZ(i, k)]);
      const cx = points.reduce((s, p) => s + p[0], 0) / 3, cz = points.reduce((s, p) => s + p[1], 0) / 3;
      for (const weights of [[0.2, 0.3, 0.5], [0.8, 0.1, 0.1], [0, 0.4, 0.6], [1, 0, 0]]) {
        const x = points.reduce((s, p, i) => s + p[0] * weights[i], 0);
        const z = points.reduce((s, p, i) => s + p[1] * weights[i], 0);
        const expected = points.reduce((s, p, i) => s + field.vertexHeight(p[0], p[1]) * weights[i], 0);
        assert.ok(Math.abs(field.heightAt(x, z) - expected) < 1e-7);
        const hazard = points.reduce((s, p, i) => s + field.hazardAt(p[0], p[1]) * weights[i], 0);
        const bridge = points.reduce((s, p, i) => s + field.bridgeMaskAt(p[0], p[1]) * weights[i], 0);
        if (weights.every(w => w > 0)) {
          assert.equal(field.hazardKindAt(x, z), field.hazardKindAt(cx, cz));
          assert.equal(field.surfaceAt(x, z), hazard <= 0 ? Surface.Land : bridge > 0 ? Surface.Bridge : field.hazardKindAt(cx, cz));
        }
      }
    }
  }
});

test("bridge plank coordinates do not tear between adjacent faces at million-metre origins", () => {
  const field = new LandscapeField(1979);
  for (const origin of [-1000000, 1000000]) {
    for (let i = 0; i < 200; i++) {
      const z = origin + i * 0.41, x = field.routeX(z, Math.round(origin / 32));
      // Route centre dominates away from intersections, where two grain
      // directions deliberately join. Equal references select the same family.
      const a = field.bridgePlankAt(x, z, x - 0.02, z - 0.02),
        b = field.bridgePlankAt(x, z, x + 0.02, z + 0.02);
      if (Math.abs(field.bridgeAngleAt(x - 0.02, z - 0.02)) < 0.09 && Math.abs(field.bridgeAngleAt(x + 0.02, z + 0.02)) < 0.09)
        assert.ok(Math.abs(a - b) < 1e-8);
      const next = field.bridgePlankAt(x + 0.1, z + 0.2, x, z);
      assert.ok(Math.abs(next - field.bridgePlankAt(x, z, x, z)) <= Math.hypot(0.1, 0.2) + 1e-8);
    }
  }
});

test("desert-majority field distribution, increased relief, startup and stable resets", (t) => {
  const field = new LandscapeField(), counts = [0, 0, 0];
  let n = 0, low = 0, high = 0, maximum = -Infinity, minimum = Infinity, maxSlope = 0;
  for (const seed of [1, 23, 1979, 98541]) {
    field.reset(seed);
    for (let z = -3200; z < 3200; z += 71) for (let x = -3200; x < 3200; x += 67) {
      counts[field.biomeAt(x, z)]++; n++;
      const h = field.vertexHeight(x, z);
      maximum = Math.max(maximum, h); minimum = Math.min(minimum, h);
      if (Math.abs(h) < 3) low++;
      if (h > 25) high++;
      maxSlope = Math.max(maxSlope, Math.abs(field.heightAt(x + 1, z) - field.heightAt(x, z)));
      assert.ok(h >= -16.6 && h <= 130);
    }
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      assert.equal(field.heightAt(18 * Math.cos(angle), 18 * Math.sin(angle)), 0);
      assert.equal(field.surfaceAt(36 * Math.cos(angle), 36 * Math.sin(angle)), Surface.Land);
    }
  }
  const fractions = counts.map(c => c / n);
  t.diagnostic(`biomes ${fractions.map(f => (f * 100).toFixed(2)).join("/")}%; low relief ${(100 * low / n).toFixed(2)}%; heights ${minimum.toFixed(2)}..${maximum.toFixed(2)}m; slope ${maxSlope.toFixed(3)}`);
  assert.ok(fractions[Biome.Desert] >= 0.75 && fractions[Biome.Desert] <= 0.85);
  for (const biome of [Biome.Lava, Biome.Meadow]) assert.ok(fractions[biome] >= 0.08 && fractions[biome] <= 0.15);
  assert.ok(low / n > 0.65 && low / n < 0.85 && high / n < 0.16 && maximum > 95 && minimum < -10);
  assert.ok(maxSlope > 1.5 && maxSlope < 4);
  field.reset(23); const h = field.heightAt(-1000000.1, 1000000.3);
  field.reset(1); field.reset(23); assert.equal(field.heightAt(-1000000.1, 1000000.3), h);
});

test("curved routes stay supported and bridge samples preserve underlying bed", () => {
  const field = new LandscapeField();
  const sample = {} as LandscapeSample;
  const seen = new Set<Surface>(); let oblique = false;
  for (const seed of [1, 23, 1979]) {
    field.reset(seed);
    for (let z = -1200; z < 1200; z += 3.7) for (const corridor of [-4, 0, 4]) {
      assert.equal(field.supportAt(field.routeX(z, corridor), z), true);
    }
    for (let z = -400; z < 400; z += 5.3) for (let x = -400; x < 400; x += 5.7) {
      assert.equal(field.sample(x, z, sample), sample);
      seen.add(sample.surface);
      assert.equal(sample.waterLevel, sample.height - 0.9);
      assert.equal(sample.floor, sample.surface === Surface.Land ? sample.height : sample.height - (field.hazardKindAt(x, z) === Surface.Pit ? 14 : 4.8));
      assert.equal(field.supportAt(x, z), sample.surface === Surface.Land || sample.surface === Surface.Bridge);
      if (sample.surface === Surface.Bridge && Math.abs(field.bridgeAngleAt(x, z)) > 0.5) oblique = true;
    }
  }
  assert.equal(seen.size, 5); assert.ok(oblique);
  field.enabled = false;
  assert.equal(field.heightAt(-1000000.5, 1000000.3), 0);
  assert.equal(field.surfaceAt(100, 100), Surface.Land);
  assert.equal(field.gridX(-12, 9), -48);
});

test("lava contours vary in shape and linear diameter within the old-to-sixfold cap", (t) => {
  const field = new LandscapeField(1979), base = Tuning.landscape.biomeSize * 0.085;
  let smallest = Infinity, largest = 0, irregular = 0;
  for (let gz = -20; gz <= 20; gz++) for (let gx = -20; gx <= 20; gx++) {
    if (field.hash(gx, gz, 9) >= 0.5) continue;
    const px = (gx + 0.15 + 0.7 * field.hash(gx, gz, 2)) * Tuning.landscape.biomeSize;
    const pz = (gz + 0.15 + 0.7 * field.hash(gx, gz, 3)) * Tuning.landscape.biomeSize;
    let min = Infinity, max = 0;
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      // At a fixed angle the signed field is radius minus radial distance.
      const radius = field.lavaPatchMaskAt(px + base * Math.cos(a), pz + base * Math.sin(a), gx, gz) + base;
      assert.ok(radius >= base - 1e-9 && radius <= base * 6 + 1e-9);
      assert.ok(Math.abs(field.lavaPatchMaskAt(px + radius * Math.cos(a), pz + radius * Math.sin(a), gx, gz)) < 1e-8);
      min = Math.min(min, radius); max = Math.max(max, radius);
    }
    assert.ok(max / min > 1.1, "even the smallest patches have a visible noncircular contour");
    if (max / min > 1.4) irregular++;
    smallest = Math.min(smallest, max / base); largest = Math.max(largest, max / base);
  }
  t.diagnostic(`lava maximum radial scales ${smallest.toFixed(2)}..${largest.toFixed(2)}; ${irregular} strongly irregular patches`);
  assert.ok(smallest < 1.4 && largest > 5 && irregular > 50);
});

test("second ravine family doubles generated footprints rather than widening old pits", (t) => {
  const field = new LandscapeField(23);
  let oldFootprints = 0, newFootprints = 0;
  for (let row = -10; row <= 10; row++) for (let column = -10; column <= 10; column++) {
    const z = row * 180, x = column * 150 - 11 * Math.sin(z / 53);
    assert.ok(Math.abs(field.pitMaskAt(x, z) - 4) < 1e-10); oldFootprints++;
    // Invert the second family's rigid transform: independent centres, same size.
    assert.ok(Math.abs(field.pitMaskAt(91 - z, x - 73, 1) - 4) < 1e-10); newFootprints++;
  }
  assert.equal(oldFootprints + newFootprints, oldFootprints * 2);
  let old = 0, second = 0, union = 0, newOnly = 0;
  for (let z = -1800; z < 1800; z += 2.71) for (let x = -1500; x < 1500; x += 3.17) {
    const across = x + 11 * Math.sin(z / 53);
    const baseline = Math.min(4 - Math.abs(across - 150 * Math.round(across / 150)), 14 - Math.abs(z - 180 * Math.round(z / 180)));
    assert.equal(field.pitMaskAt(x, z), baseline);
    const a = baseline > 0, b = field.pitMaskAt(x, z, 1) > 0;
    old += +a; second += +b; union += +(a || b); newOnly += +(!a && b);
  }
  t.diagnostic(`old pit samples ${old}; second ${second}; union ${(union / old).toFixed(3)}x; new-only ${newOnly}`);
  assert.ok(second / old > 0.95 && second / old < 1.05);
  assert.ok(union / old > 1.93 && union / old < 2.05);
});

test("hill distribution substantially exceeds the exact old macro baseline", (t) => {
  const field = new LandscapeField(1979);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  let oldHigh = 0, newHigh = 0, oldMedium = 0, newMedium = 0, n = 0;
  for (let z = -4000; z < 4000; z += 53) for (let x = -4000; x < 4000; x += 47) {
    let h = 0;
    const ix = Math.floor(x / 640), iz = Math.floor(z / 640);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = ix + dx, gz = iz + dz, kind = field.hash(gx, gz, 114);
      if (kind > 0.48) continue;
      const px = (gx + 0.35 + 0.3 * field.hash(gx, gz, 115)) * 640;
      const pz = (gz + 0.35 + 0.3 * field.hash(gx, gz, 116)) * 640;
      h += (kind < 0.32 ? 126 : -15) * smooth(Math.max(0, 1 - Math.hypot(x - px, z - pz) / (kind < 0.32 ? 190 : 100)));
    }
    h += (field.noise(x, z, 100, 111) - 0.5) * 3 + (field.noise(x, z, 37, 112) - 0.5) * 0.2;
    h = smooth(Math.min(1, Math.max(0, (Math.hypot(x, z) - 24) / 96))) * Math.max(-16.6, Math.min(130, h));
    const next = field.vertexHeight(x, z);
    oldHigh += +(h > 25); newHigh += +(next > 25);
    oldMedium += +(h > 3 && h <= 25); newMedium += +(next > 3 && next <= 25); n++;
  }
  t.diagnostic(`high relief ${(100 * oldHigh / n).toFixed(2)}% -> ${(100 * newHigh / n).toFixed(2)}%; medium ${(100 * oldMedium / n).toFixed(2)}% -> ${(100 * newMedium / n).toFixed(2)}%`);
  assert.ok(newHigh > oldHigh * 1.7 && newMedium > oldMedium * 2);
  for (let seed = 1; seed <= 100; seed++) {
    field.reset(seed); let peak = 0;
    for (let z = 60; z <= 150; z += 10) for (let x = -70; x <= 70; x += 10) peak = Math.max(peak, field.heightAt(x, z));
    assert.ok(peak > 12, `visible early foothill for seed ${seed}: ${peak}`);
  }
});

test("ledge component follows the same triangles, has jumpable steep faces and guarded routes", (t) => {
  const field = new LandscapeField(1979);
  // Inspect raw vertex contribution only in the test; no new production API/storage.
  const raw = (x: number, z: number) => (field as unknown as { vertexCliffRise(x: number, z: number): number }).vertexCliffRise(x, z);
  let steep = 0, raised = 0, maximum = 0;
  for (let z = -500; z <= 500; z += 2.3) for (let x = -500; x <= 500; x += 2.7) {
    const h = field.ledgeHeightAt(x, z);
    assert.ok(h >= -1e-10 && h <= 3.2 + 1e-10);
    maximum = Math.max(maximum, h); raised += +(h > 0.5);
    if (Math.abs(field.ledgeHeightAt(x + 0.1, z) - h) / 0.1 > 0.28) steep++;
  }
  for (const origin of [-250000, 0, 250000]) for (let i = -20; i <= 20; i++) {
    const ix = origin + i, iz = -origin + i * 7;
    const ax = field.gridX(ix, iz), az = field.gridZ(ix, iz);
    const bx = field.gridX(ix + 1, iz), bz = field.gridZ(ix + 1, iz);
    const cx = field.gridX(ix, iz + 1), cz = field.gridZ(ix, iz + 1);
    assert.ok(Math.abs(field.ledgeHeightAt(ax * 0.2 + bx * 0.3 + cx * 0.5, az * 0.2 + bz * 0.3 + cz * 0.5) - (raw(ax, az) * 0.2 + raw(bx, bz) * 0.3 + raw(cx, cz) * 0.5)) < 1e-7);
  }
  for (let seed = 1; seed <= 100; seed++) {
    field.reset(seed);
    for (let z = -400; z <= 400; z += 7.1) for (const corridor of [-3, 0, 3]) for (const offset of [-2.8, 0, 2.8]) {
      assert.ok(field.ledgeHeightAt(field.routeX(z, corridor) + offset, z) < 1e-10);
    }
  }
  t.diagnostic(`${raised} raised samples; ${steep} faces above .28 slope; maximum ${maximum.toFixed(3)}m`);
  assert.ok(raised > 1000 && steep > 100 && maximum > 2.8);
});

test("rectangle, diamond and elliptical ledges produce distinct footprints", () => {
  class ShapedField extends LandscapeField {
    shape = 0;
    override hash(x: number, z: number, salt = 0) {
      return salt === 228 ? this.shape : super.hash(x, z, salt);
    }
  }
  const field = new ShapedField(1979), area = [0, 0, 0], shapes = [0.1, 0.5, 0.9];
  let distinct = 0;
  for (let z = -240; z <= 240; z += 2.3) for (let x = -240; x <= 240; x += 2.7) {
    const heights = shapes.map((shape, i) => {
      field.shape = shape;
      const h = field.ledgeHeightAt(x, z);
      area[i] += +(h > 0.5);
      return h;
    });
    if (heights[0] - heights[1] > 0.4 && heights[2] > heights[1] + 0.1) distinct++;
  }
  assert.ok(area[0] > area[2] && area[2] > area[1], "rectangle encloses ellipse, which encloses diamond");
  assert.ok(distinct > 100, "shape selection measurably changes the actual interpolated surface");
});

test("new feature queries retain fixed storage, deterministic revisits and continuous cell seams", () => {
  const field = new LandscapeField(23), keys = Object.keys(field);
  const buffers = Object.values(field).filter(v => ArrayBuffer.isView(v));
  assert.equal(buffers.length, 1); assert.equal(buffers[0].byteLength, 64);
  for (let i = 0; i < 5000; i++) {
    const x = -1000000 + i * 403.17, z = 1000000 - i * 389.31;
    const height = field.heightAt(x, z), ledge = field.ledgeHeightAt(x, z);
    assert.equal(height, new LandscapeField(23).heightAt(x, z));
    assert.equal(ledge, new LandscapeField(23).ledgeHeightAt(x, z));
    for (const period of [48, 96, 320]) {
      const edge = Math.round(x / period) * period;
      assert.ok(Math.abs(field.vertexHeight(edge - 1e-6, z) - field.vertexHeight(edge + 1e-6, z)) < 0.0001);
    }
  }
  assert.deepEqual(Object.keys(field), keys);
  assert.deepEqual(Object.values(field).filter(v => ArrayBuffer.isView(v)), buffers);
  field.enabled = false; assert.equal(field.ledgeHeightAt(100, 100), 0);
});
