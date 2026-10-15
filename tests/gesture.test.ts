import { test } from "node:test";
import assert from "node:assert/strict";
import { GestureRecognizer } from "../src/gesture.ts";

test("fast and slow upward swipes jump without ever steering", () => {
  for (const duration of [40, 100, 300]) {
    const directions: number[] = [];
    let jumps = 0;
    const input = new GestureRecognizer(
      (value) => directions.push(value),
      () => jumps++,
    );
    input.begin(30, 600, 0, -1);
    input.move(31, 588, -1);
    input.update(duration);
    input.move(32, 510, -1);
    input.clear();
    assert.equal(jumps, 1);
    assert.ok(directions.every((value) => value === 0));
  }
});
test("stationary hold starts once after classification, continues until release, reverses on transfer", () => {
  const directions: number[] = [];
  const input = new GestureRecognizer(
    (value) => directions.push(value),
    () => assert.fail(),
  );
  input.begin(330, 600, 0, 1);
  input.update(20);
  assert.ok(directions.every((value) => value === 0));
  input.update(40);
  assert.equal(directions.at(-1), 1);
  input.update(500);
  assert.equal(directions.at(-1), 1);
  input.move(40, 600, -1);
  assert.equal(directions.at(-1), -1);
  // A confirmed hold is a separate gesture and can never become a jump.
  input.move(40, 400, -1);
  input.clear();
  assert.equal(directions.at(-1), 0);
});
test("horizontal intent commits on its first small move without waiting for hold timer", () => {
  let direction = 0;
  const input = new GestureRecognizer(
    (value) => (direction = value),
    () => assert.fail(),
  );
  input.begin(300, 600, 0, 1);
  input.move(304, 600, 1);
  assert.equal(direction, 1);
  assert.ok(GestureRecognizer.holdDelay <= 40);
});
test("up and down swipes resolve once and never inherit sideways steering", () => {
  for (const dy of [-100, 100])
    for (const delay of [30, 300]) {
      const directions: number[] = [];
      let up = 0,
        down = 0;
      const gesture = new GestureRecognizer(
        (v) => directions.push(v),
        () => up++,
        () => down++,
      );
      gesture.begin(330, 500, 0, 1);
      gesture.move(331, 500 + Math.sign(dy) * 12, 1);
      gesture.update(delay);
      gesture.move(332, 500 + dy, 1);
      gesture.move(40, 500 - dy, -1);
      gesture.clear();
      assert.equal(up, dy < 0 ? 1 : 0);
      assert.equal(down, dy > 0 ? 1 : 0);
      assert.ok(directions.every((v) => v === 0));
    }
});
