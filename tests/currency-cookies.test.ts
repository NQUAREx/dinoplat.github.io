import { test } from "node:test";
import assert from "node:assert/strict";
import { CurrencyCookies } from "../src/currency-cookies.ts";
import { Wallet, Currency } from "../src/progression.ts";
import { GameEvents } from "../src/events.ts";

test("project cookie restores both balances, batches pickups, scopes attributes and flushes before disposal", async (t) => {
  let value = "dinoplat3d-wallet-v1=1.17.3",
    writes = 0,
    last = "";
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, "document"),
    oldLoc = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return value;
      },
      set cookie(v: string) {
        last = v;
        value = v.split(";")[0];
        writes++;
      },
    },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "https:" },
  });
  t.after(() => {
    if (oldDoc) Object.defineProperty(globalThis, "document", oldDoc);
    else Reflect.deleteProperty(globalThis, "document");
    if (oldLoc) Object.defineProperty(globalThis, "location", oldLoc);
    else Reflect.deleteProperty(globalThis, "location");
  });
  const events = new GameEvents(),
    wallet = new Wallet(events),
    store = new CurrencyCookies(wallet, events, "/DinoPlat3d/");
  assert.equal(wallet.coins, 17);
  assert.equal(wallet.diamonds, 3);
  wallet.add(Currency.Coin, 2);
  wallet.add(Currency.Diamond, 1);
  assert.equal(writes, 0);
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.match(last, /Path=\/DinoPlat3d\//);
  assert.match(last, /SameSite=Lax; Secure/);
  assert.match(last, /Max-Age=31536000/);
  wallet.add(Currency.Coin, 1);
  store.dispose();
  assert.equal(writes, 2);
  await Promise.resolve();
  assert.equal(writes, 2);
  const restored = new Wallet(new GameEvents()),
    second = new CurrencyCookies(restored, new GameEvents(), "/DinoPlat3d/");
  assert.equal(restored.coins, 20);
  assert.equal(restored.diamonds, 4);
  second.dispose();
});

test("corrupt/blocked cookies never produce invalid balances or break play", async (t) => {
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, "document"),
    oldLoc = Object.getOwnPropertyDescriptor(globalThis, "location");
  const doc = { cookie: "dinoplat3d-wallet-v1=1.999999999999999999999999.2" };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: doc,
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "http:" },
  });
  t.after(() => {
    if (oldDoc) Object.defineProperty(globalThis, "document", oldDoc);
    else Reflect.deleteProperty(globalThis, "document");
    if (oldLoc) Object.defineProperty(globalThis, "location", oldLoc);
    else Reflect.deleteProperty(globalThis, "location");
  });
  let events = new GameEvents(),
    wallet = new Wallet(events),
    store = new CurrencyCookies(wallet, events, "/");
  assert.equal(wallet.coins + wallet.diamonds, 0);
  store.dispose();
  Object.defineProperty(doc, "cookie", {
    get() {
      throw new Error("blocked");
    },
    set() {
      throw new Error("blocked");
    },
  });
  events = new GameEvents();
  wallet = new Wallet(events);
  store = new CurrencyCookies(wallet, events, "/");
  wallet.add(Currency.Coin, 1);
  await Promise.resolve();
  store.dispose();
  assert.equal(wallet.coins, 1);
});
