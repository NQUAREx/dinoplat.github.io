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
  field.surfaceAt(x, z); field.hazardKindAt(x, z); field.supportAt(x, z);
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
    if (field.hash(ix, iz, 114) >= 0.32) continue;
    const x = (ix + 0.35 + 0.3 * field.hash(ix, iz, 115)) * 640;
    const z = (iz + 0.35 + 0.3 * field.hash(ix, iz, 116)) * 640;
    assert.ok(field.vertexHeight(x, z) > 120);
    const biome = field.biomeAt(x, z); assert.notEqual(biome, Biome.Desert);
    assert.equal(field.biomeAt(x + 30, z), biome); seen.add(biome); cores++;
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

test("sparse desert field distribution, relief bounds, startup and stable resets", (t) => {
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
  assert.ok(low / n > 0.85 && high / n < 0.08 && maximum > 95 && minimum < -10);
  assert.ok(maxSlope < 1.5);
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
