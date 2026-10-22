// A preset peer chain of simps: it grows outward from the middle, so every
// smaller layout is still one connected chain. A few shortcuts give hubs a third peer.
export const SIMPS = [
  "acme-platform",
  "identity",
  "payments",
  "mobile-app",
  "checkout",
  "notifications",
  "orders",
  "shipping",
  "billing",
  "inventory",
  "analytics",
  "catalog",
  "admin-console",
  "search",
  "support-faq",
  "onboarding",
] as const;

export type SimpName = (typeof SIMPS)[number];

const CHAIN: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 10],
  [9, 11],
  [10, 12],
  [11, 13],
  [13, 14],
  [14, 15],
];

const SHORTCUTS: [number, number][] = [
  [0, 6],
  [5, 9],
];

export const PEERS = [...CHAIN, ...SHORTCUTS];

// The question each simp answers, and its short reply.
export const REQUESTS: Record<SimpName, { ask: string; answer: string }> = {
  "acme-platform": {
    ask: "How to deploy a service?",
    answer: "Push to main; CI ships it.",
  },
  identity: {
    ask: "How to reset a password?",
    answer: "Use Forgot password at sign-in.",
  },
  payments: {
    ask: "How to refund a payment?",
    answer: "Open the payment, click Refund.",
  },
  "mobile-app": {
    ask: "How to enable push alerts?",
    answer: "Turn them on in app settings.",
  },
  checkout: {
    ask: "How to apply a coupon?",
    answer: "Enter it at the payment step.",
  },
  notifications: {
    ask: "How to mute email alerts?",
    answer: "Unsubscribe in alert settings.",
  },
  orders: {
    ask: "How to cancel an order?",
    answer: "Cancel it before it ships.",
  },
  shipping: {
    ask: "How to track a parcel?",
    answer: "Use the link in your email.",
  },
  billing: {
    ask: "How to download an invoice?",
    answer: "Billing › Invoices › Download.",
  },
  inventory: {
    ask: "How to restock an item?",
    answer: "Set a new quantity in stock.",
  },
  analytics: {
    ask: "How to export a report?",
    answer: "Click Export on the report.",
  },
  catalog: {
    ask: "How to add a product?",
    answer: "Catalog › New product.",
  },
  "admin-console": {
    ask: "How to invite a teammate?",
    answer: "Admin › Members › Invite.",
  },
  search: {
    ask: "How to filter results?",
    answer: "Use the filters by the search box.",
  },
  "support-faq": {
    ask: "How to contact support?",
    answer: "Chat from the Help menu.",
  },
  onboarding: {
    ask: "How to set up a workspace?",
    answer: "Follow the setup checklist.",
  },
};

export interface SimpBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Home position as a fraction of the area, so the layout survives resizes.
  homeX: number;
  homeY: number;
  phase: number;
}

export interface NetworkOptions {
  width: number;
  height: number;
  gap: number;
  maxSpeed: number;
  // Area kept clear of simps, such as the foreground content.
  avoid?: { left: number; top: number; right: number; bottom: number };
}

// Fits the simp count to the room left around the avoided area and its clearance.
export function networkSize({ width, height, gap, avoid }: NetworkOptions) {
  const blocked = avoid
    ? Math.max(
        0,
        Math.min(width, avoid.right + gap) - Math.max(0, avoid.left - gap),
      ) *
      Math.max(
        0,
        Math.min(height, avoid.bottom + gap) - Math.max(0, avoid.top - gap),
      )
    : 0;
  const room = avoid
    ? (width * height - blocked) / 30000
    : (width * height) / 70000;
  return Math.max(5, Math.min(SIMPS.length, Math.round(room)));
}

export function networkEdges(count: number) {
  return PEERS.filter(([a, b]) => a < count && b < count);
}

function neighbors(index: number, edges: [number, number][]) {
  return edges.flatMap(([a, b]) =>
    a === index ? [b] : b === index ? [a] : [],
  );
}

// Walks the chain from one end, so neighbours can be laid out side by side.
export function chainOrder(count: number) {
  const edges = CHAIN.filter(([a, b]) => a < count && b < count);
  let current = 0;
  for (let index = 0; index < count; index++)
    if (neighbors(index, edges).length < 2) {
      current = index;
      break;
    }
  const order = [current];
  while (order.length < count) {
    const next = neighbors(current, edges).find(
      (peer) => !order.includes(peer),
    );
    if (next === undefined) break;
    order.push((current = next));
  }
  return order;
}

// One leg of a conversation: a question or an answer travelling between two simps.
export interface Talk {
  // Simps in the conversation, in the order they joined; the first one asked.
  participants: number[];
  path: number[];
  text: string;
  answer: boolean;
}

// The most simps one origin request may involve.
export const MAX_PARTICIPANTS = 3;

// Picks a directly connected simp that is free to take a question.
function ask(
  from: number,
  count: number,
  exclude: Set<number>,
  random: () => number,
) {
  const peers = neighbors(from, networkEdges(count)).filter(
    (peer) => !exclude.has(peer),
  );
  return peers.length
    ? [from, peers[Math.floor(random() * peers.length)]]
    : undefined;
}

// Opens a conversation from an idle simp to one of its free direct peers.
export function startTalk(
  count: number,
  busy: Set<number>,
  random = Math.random,
): Talk | undefined {
  const edges = networkEdges(count);
  const idle = Array.from({ length: count }, (_, index) => index).filter(
    (index) =>
      !busy.has(index) &&
      neighbors(index, edges).some((peer) => !busy.has(peer)),
  );
  if (!idle.length) return undefined;
  const from = idle[Math.floor(random() * idle.length)];
  const path = ask(from, count, busy, random)!;
  return {
    participants: path,
    path,
    text: REQUESTS[SIMPS[path[1]]].ask,
    answer: false,
  };
}

// After a leg arrives, the receiver either asks its next direct peer or answers back.
export function nextTalk(
  talk: Talk,
  count: number,
  busy: Set<number>,
  random = Math.random,
): Talk | undefined {
  const { participants } = talk;
  const receiver = talk.path[1];
  const position = participants.indexOf(receiver);
  if (
    !talk.answer &&
    participants.length < MAX_PARTICIPANTS &&
    random() < 0.5
  ) {
    const path = ask(
      receiver,
      count,
      new Set([...busy, ...participants]),
      random,
    );
    if (path)
      return {
        participants: [...participants, path[1]],
        path,
        text: REQUESTS[SIMPS[path[1]]].ask,
        answer: false,
      };
  }
  if (position === 0) return undefined;
  return {
    participants,
    path: [receiver, participants[position - 1]],
    text: REQUESTS[SIMPS[receiver]].answer,
    answer: true,
  };
}

// Spreads simps over a jittered grid and settles their homes clear of each other.
export function seedBodies(
  count: number,
  options: NetworkOptions,
  random = Math.random,
): SimpBody[] {
  const { width, height, gap, avoid } = options;
  const columns = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.ceil(count / columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const jitter = (cell: number) => Math.max(0, cell - gap) * (random() - 0.5);
  // Chain neighbours take neighbouring cells along a snaking row order.
  const cells = new Map(chainOrder(count).map((index, cell) => [index, cell]));
  const bodies = Array.from({ length: count }, (_, index) => {
    const cell = cells.get(index) ?? index;
    const row = Math.floor(cell / columns);
    const column = row % 2 ? columns - 1 - (cell % columns) : cell % columns;
    return {
      x: cellWidth * (column + 0.5) + jitter(cellWidth),
      y: cellHeight * (row + 0.5) + jitter(cellHeight),
      vx: 0,
      vy: 0,
      homeX: 0,
      homeY: 0,
      phase: random() * Math.PI * 2,
    };
  });
  for (let pass = 0; pass < 20; pass++) {
    // Homes keep a full gap from the avoided area, so orbits never reach it.
    if (avoid)
      for (const body of bodies)
        evade(body, avoid, gap, undefined, { width, height, margin: gap / 2 });
    separate(bodies, gap * 1.4, -1);
    // Homes stay inside the area, with room for the logo.
    for (const body of bodies) {
      body.x = Math.min(Math.max(body.x, gap / 2), width - gap / 2);
      body.y = Math.min(Math.max(body.y, gap / 2), height - gap / 2);
    }
  }
  for (const body of bodies) {
    body.homeX = body.x / width;
    body.homeY = body.y / height;
  }
  return bodies;
}

// Spreads fresh homes over a resized area. Each home takes a spot a simp was
// showing at, matched so trips are short and never cross (crossing simps would
// jam in the gaps beside the avoided area). A simp whose trip would pass
// through the avoided area starts at home instead.
export function relayout(
  previous: SimpBody[],
  count: number,
  options: NetworkOptions,
  random = Math.random,
): SimpBody[] {
  const { width, height, avoid } = options;
  const bodies = seedBodies(count, options, random);
  const homes = bodies.map((body) => ({
    x: body.homeX * width,
    y: body.homeY * height,
  }));
  const spots = previous.slice(0, count).map(({ x, y }) => ({
    x: Math.min(Math.max(x, 0), width),
    y: Math.min(Math.max(y, 0), height),
  }));
  const trip = (spot: number, home: number) =>
    Math.hypot(spots[spot].x - homes[home].x, spots[spot].y - homes[home].y);
  const match = spots.map((_, index) => index);
  for (let improved = true; improved;) {
    improved = false;
    for (let a = 0; a < match.length; a++)
      for (let b = a + 1; b < match.length; b++)
        if (
          trip(match[b], a) + trip(match[a], b) <
          trip(match[a], a) + trip(match[b], b) - 1e-6
        ) {
          [match[a], match[b]] = [match[b], match[a]];
          improved = true;
        }
  }
  for (const [home, spot] of match.entries()) {
    const { x, y } = spots[spot];
    if (avoid && crosses(x, y, homes[home].x, homes[home].y, avoid)) continue;
    bodies[home].x = x;
    bodies[home].y = y;
  }
  separate(bodies, options.gap, -1);
  return bodies;
}

// Whether the segment between two points passes through a rectangle.
function crosses(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  { left, top, right, bottom }: NonNullable<NetworkOptions["avoid"]>,
) {
  let enter = 0;
  let leave = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const [p, q] of [
    [-dx, x1 - left],
    [dx, right - x1],
    [-dy, y1 - top],
    [dy, bottom - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

// Advances each simp's orbit around its home by `dt` milliseconds; pinned bodies hold still.
export function stepBodies(
  bodies: SimpBody[],
  { width, height, gap, maxSpeed, avoid }: NetworkOptions,
  dt: number,
  pinned = -1,
) {
  const scale = Math.min(dt, 64) / 16;
  const radius = gap * 0.3;
  for (const [index, body] of bodies.entries()) {
    if (index === pinned) {
      body.vx = body.vy = 0;
      continue;
    }
    body.phase += dt * 0.0003;
    const targetX = body.homeX * width + Math.cos(body.phase) * radius;
    const targetY = body.homeY * height + Math.sin(body.phase * 1.3) * radius;
    body.vx += (targetX - body.x) * 0.002 * scale;
    body.vy += (targetY - body.y) * 0.002 * scale;
    for (const [other, peer] of bodies.entries()) {
      if (other === index) continue;
      const dx = body.x - peer.x;
      const dy = body.y - peer.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < gap * 1.3) {
        const push = ((gap * 1.3 - distance) / gap) * 0.02 * scale;
        body.vx += (dx / distance) * push;
        body.vy += (dy / distance) * push;
      }
    }
    body.vx *= 0.94 ** scale;
    body.vy *= 0.94 ** scale;
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > maxSpeed) {
      body.vx *= maxSpeed / speed;
      body.vy *= maxSpeed / speed;
    }
    body.x += body.vx * scale;
    body.y += body.vy * scale;
    if (avoid)
      evade(body, avoid, gap / 2, {
        x: body.homeX * width - body.x,
        y: body.homeY * height - body.y,
      });
  }
  separate(bodies, gap, pinned);
}

// Moves a body out through the nearest side of the padded area and turns it away.
// With a heading, sides that would push it back from where it is going are
// skipped, so it slides around the area instead of bouncing off a corner.
// With bounds, sides with no room before the edge of the bounds are skipped.
function evade(
  body: SimpBody,
  { left, top, right, bottom }: NonNullable<NetworkOptions["avoid"]>,
  padding: number,
  heading?: { x: number; y: number },
  bounds?: { width: number; height: number; margin: number },
) {
  const exits = [
    { distance: body.x - (left - padding), x: -1, y: 0 },
    { distance: right + padding - body.x, x: 1, y: 0 },
    { distance: body.y - (top - padding), x: 0, y: -1 },
    { distance: bottom + padding - body.y, x: 0, y: 1 },
  ];
  if (exits.some(({ distance }) => distance <= 0)) return;
  const roomy = bounds
    ? exits.filter(({ x, y }) =>
        x < 0
          ? left - padding >= bounds.margin
          : x > 0
            ? right + padding <= bounds.width - bounds.margin
            : y < 0
              ? top - padding >= bounds.margin
              : bottom + padding <= bounds.height - bounds.margin,
      )
    : exits;
  const usable = roomy.length ? roomy : exits;
  const onward = usable.filter(
    ({ x, y }) => !heading || x * heading.x + y * heading.y >= 0,
  );
  const exit = (onward.length ? onward : usable).reduce((best, next) =>
    next.distance < best.distance ? next : best,
  );
  body.x += exit.x * exit.distance;
  body.y += exit.y * exit.distance;
  if (exit.x) body.vx = exit.x * Math.abs(body.vx);
  if (exit.y) body.vy = exit.y * Math.abs(body.vy);
}

// Hard spacing rule: overlapping pairs are moved apart so no two simps touch.
function separate(bodies: SimpBody[], gap: number, pinned: number) {
  for (let a = 0; a < bodies.length; a++)
    for (let b = a + 1; b < bodies.length; b++) {
      const dx = bodies[b].x - bodies[a].x;
      const dy = bodies[b].y - bodies[a].y;
      const distance = Math.hypot(dx, dy);
      if (distance >= gap) continue;
      const nx = distance ? dx / distance : 1;
      const ny = distance ? dy / distance : 0;
      const overlap = gap - distance;
      const shareA = a === pinned ? 0 : b === pinned ? 1 : 0.5;
      bodies[a].x -= nx * overlap * shareA;
      bodies[a].y -= ny * overlap * shareA;
      bodies[b].x += nx * overlap * (1 - shareA);
      bodies[b].y += ny * overlap * (1 - shareA);
    }
}
