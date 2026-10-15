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
  input.update(100);
  assert.ok(directions.every((value) => value === 0));
  input.update(150);
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
