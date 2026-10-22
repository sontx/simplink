import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PEERS,
  REQUESTS,
  SIMPS,
  chainOrder,
  networkEdges,
  networkSize,
  nextTalk,
  relayout,
  seedBodies,
  startTalk,
  stepBodies,
} from "../src/lib/simp-network.js";

const options = {
  width: 1280,
  height: 800,
  gap: 120,
  maxSpeed: 0.18,
  avoid: { left: 416, top: 100, right: 864, bottom: 700 },
};

const random = (seed: number) => () =>
  ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test("simp network keeps every simp apart while orbiting", () => {
  const count = networkSize(options);
  const bodies = seedBodies(count, options, random(7));
  for (let frame = 0; frame < 2000; frame++) {
    stepBodies(bodies, options, 16, frame < 1000 ? 0 : -1);
    for (let a = 0; a < count; a++)
      for (let b = a + 1; b < count; b++) {
        const distance = Math.hypot(
          bodies[a].x - bodies[b].x,
          bodies[a].y - bodies[b].y,
        );
        assert.ok(distance >= options.gap - 1e-6, `frame ${frame}`);
      }
  }
});

test("simp network keeps each simp near its home so the layout holds", () => {
  const count = networkSize(options);
  const bodies = seedBodies(count, options, random(11));
  for (let frame = 0; frame < 5000; frame++) {
    stepBodies(bodies, options, 16);
    for (const body of bodies)
      assert.ok(
        Math.hypot(
          body.x - body.homeX * options.width,
          body.y - body.homeY * options.height,
        ) <= options.gap,
        `frame ${frame}`,
      );
  }
});

test("simp network presets link only known simps and every simp has a peer", () => {
  for (const [a, b] of PEERS) assert.ok(a < SIMPS.length && b < SIMPS.length);
  for (const [index, name] of SIMPS.entries())
    assert.ok(
      PEERS.filter((edge) => edge.includes(index)).length <= 3,
      `${name} has at most three peers`,
    );
  const degrees = SIMPS.map(
    (_, index) => PEERS.filter((edge) => edge.includes(index)).length,
  );
  assert.ok(degrees.some((degree) => degree === 3));
  assert.ok(degrees.filter((degree) => degree <= 2).length > SIMPS.length / 2);
  for (let count = 5; count <= SIMPS.length; count++)
    for (let index = 0; index < count; index++)
      assert.ok(
        networkEdges(count).some((edge) => edge.includes(index)),
        `${SIMPS[index]} with ${count} simps`,
      );
});

test("simp network settles homes outside the avoided area", () => {
  const bodies = seedBodies(SIMPS.length, options, random(3));
  for (let frame = 0; frame < 200; frame++) stepBodies(bodies, options, 16);
  const { left, top, right, bottom } = options.avoid;
  for (const { x, y } of bodies)
    assert.ok(x < left || x > right || y < top || y > bottom, `${x},${y}`);
});

test("simp network chains every layout size into one walkable line", () => {
  for (let count = 5; count <= SIMPS.length; count++)
    assert.equal(new Set(chainOrder(count)).size, count, `${count} simps`);
});

test("simp conversations only talk to direct peers, involve at most three simps, and answer back", () => {
  for (const name of SIMPS) {
    assert.match(REQUESTS[name].ask, /^How to /);
    assert.ok(REQUESTS[name].answer);
  }
  const linked = (path: number[]) =>
    path
      .slice(0, -1)
      .every((from, hop) =>
        PEERS.some(
          ([a, b]) =>
            (a === from && b === path[hop + 1]) ||
            (b === from && a === path[hop + 1]),
        ),
      );
  const pick = random(5);
  let followUps = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const busy = new Set([0, 1]);
    let talk = startTalk(SIMPS.length, busy, pick);
    assert.ok(talk);
    const origin = talk.path[0];
    assert.ok(!busy.has(origin));
    let answers = 0;
    let legs = 0;
    for (; talk; talk = nextTalk(talk, SIMPS.length, busy, pick), legs++) {
      assert.ok(legs < 10);
      assert.ok(linked(talk.path) && talk.path.length === 2);
      assert.ok(talk.participants.length <= 3);
      assert.ok(talk.participants.every((simp) => !busy.has(simp)));
      const sender = talk.path[0];
      const receiver = talk.path[talk.path.length - 1];
      if (talk.answer) {
        answers++;
        assert.equal(talk.text, REQUESTS[SIMPS[sender]].answer);
        assert.equal(
          talk.participants.indexOf(receiver),
          talk.participants.indexOf(sender) - 1,
        );
      } else assert.equal(talk.text, REQUESTS[SIMPS[receiver]].ask);
      if (talk.participants.length === 3) followUps++;
      if (!nextTalk({ ...talk }, SIMPS.length, busy, () => 0.99))
        assert.equal(receiver, origin);
    }
    assert.ok(answers >= 1);
  }
  assert.ok(followUps > 0);
});

test("simp network redistributes simps over a resized area", () => {
  const wide = seedBodies(SIMPS.length, options, random(9));
  const narrow = {
    ...options,
    width: 900,
    height: 700,
    avoid: { left: 240, top: 80, right: 660, bottom: 620 },
  };
  const count = networkSize(narrow);
  const bodies = relayout(wide, count, narrow, random(4));
  assert.equal(bodies.length, count);
  for (let frame = 0; frame < 400; frame++)
    stepBodies(bodies, { ...narrow, maxSpeed: 8 }, 16);
  for (const body of bodies)
    assert.ok(
      Math.hypot(
        body.x - body.homeX * narrow.width,
        body.y - body.homeY * narrow.height,
      ) <= narrow.gap,
      `${body.x},${body.y}`,
    );
});
