import { useEffect, useRef, useState, type RefObject } from "react";
import {
  SIMPS,
  networkEdges,
  networkSize,
  nextTalk,
  relayout,
  seedBodies,
  startTalk,
  stepBodies,
  type NetworkOptions,
  type Talk,
} from "../lib/simp-network.js";

const GAP = 120;
const SIZE = 36;
const PACKETS = 3;
// Message travel speed in pixels per millisecond.
const SPEED = 0.09;
// How long a simp pauses before passing a conversation on, in milliseconds.
const PAUSE = 600;
// After a resize, simps glide faster to their new homes for this long.
const SETTLE = 2500;

interface Packet extends Talk {
  hop: number;
  waitUntil: number;
}

// Decorative background: simps drifting as a linked peer network around `avoid`.
export function SimpNetwork({
  avoid,
}: {
  avoid?: RefObject<HTMLElement | null>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const packets = useRef<(HTMLDivElement | null)[]>([]);
  const hovered = useRef(-1);
  const [count, setCount] = useState(0);
  const edges = networkEdges(count);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let options: NetworkOptions = {
      // A container not laid out yet measures 0, which would seed NaN positions.
      width: element.clientWidth || window.innerWidth,
      height: element.clientHeight || window.innerHeight,
      gap: GAP,
      maxSpeed: 0.4,
    };
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      // Hidden or detached: keep the last real layout.
      if (!bounds.width || !bounds.height) return;
      const content = avoid?.current?.getBoundingClientRect();
      options = {
        ...options,
        width: bounds.width,
        height: bounds.height,
        // Narrow screens have no room beside the content, so simps pass behind it.
        avoid:
          content && bounds.width >= 768
            ? {
                left: content.left - bounds.left,
                top: content.top - bounds.top,
                right: content.right - bounds.left,
                bottom: content.bottom - bounds.top,
              }
            : undefined,
      };
    };
    measure();
    let size = networkSize(options);
    let bodies = seedBodies(size, options);
    let links = networkEdges(size);
    let laidOut = { width: options.width, height: options.height };
    let settleUntil = 0;
    setCount(size);
    const flights: (Packet | undefined)[] = Array.from({ length: PACKETS });
    // Redistributes simps over the new area once resizing pauses.
    const redistribute = () => {
      if (options.width === laidOut.width && options.height === laidOut.height)
        return;
      laidOut = { width: options.width, height: options.height };
      size = networkSize(options);
      bodies = relayout(bodies, size, options);
      links = networkEdges(size);
      settleUntil = performance.now() + SETTLE;
      flights.fill(undefined);
      for (const packet of packets.current)
        if (packet) packet.dataset.visible = "false";
      if (hovered.current >= size) hovered.current = -1;
      setCount(size);
      if (still)
        for (const body of bodies) {
          body.x = body.homeX * options.width;
          body.y = body.homeY * options.height;
        }
      if (still) frame = requestAnimationFrame(draw);
    };
    let pending = 0;
    const observer = new ResizeObserver(() => {
      measure();
      clearTimeout(pending);
      pending = window.setTimeout(redistribute, 150);
    });
    observer.observe(element);
    if (avoid?.current) observer.observe(avoid.current);
    // Simps already talking in another conversation stay out of this one.
    const busy = (skip = -1) =>
      new Set(
        flights.flatMap((flight, slot) =>
          flight && slot !== skip
            ? [...flight.participants, ...flight.path]
            : [],
        ),
      );
    const show = (element: HTMLDivElement, talk: Talk) => {
      element.querySelector("span")!.textContent = talk.text;
      element.dataset.answer = String(talk.answer);
    };
    let nextLaunch = 0;
    const travel = (now: number, dt: number) => {
      if (now >= nextLaunch) {
        nextLaunch = now + 1200 + Math.random() * 1800;
        const slot = flights.findIndex((flight) => !flight);
        const talk = slot < 0 ? undefined : startTalk(size, busy());
        const element = packets.current[slot];
        if (talk && element) {
          flights[slot] = { ...talk, hop: 0, waitUntil: now };
          show(element, talk);
        }
      }
      for (const [slot, flight] of flights.entries()) {
        const element = packets.current[slot];
        if (!flight || !element || now < flight.waitUntil) continue;
        const from = bodies[flight.path[Math.floor(flight.hop)]];
        const to = bodies[flight.path[Math.floor(flight.hop) + 1]];
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        flight.hop += (dt * SPEED) / length;
        const hops = flight.path.length - 1;
        if (flight.hop >= hops) {
          element.dataset.visible = "false";
          const target = nodes.current[flight.path[hops]];
          // The receiver lights up in the message's colour while it handles it.
          target?.setAttribute(
            "data-receiving",
            flight.answer ? "answer" : "question",
          );
          setTimeout(
            () => target?.removeAttribute("data-receiving"),
            PAUSE + 400,
          );
          // The receiver thinks briefly, then asks onward or answers back.
          const next = nextTalk(flight, size, busy(slot));
          flights[slot] = next && { ...next, hop: 0, waitUntil: now + PAUSE };
          if (next) setTimeout(() => show(element, next), 300);
          continue;
        }
        const at = Math.floor(flight.hop);
        const progress = flight.hop - at;
        const a = bodies[flight.path[at]];
        const b = bodies[flight.path[at + 1]];
        element.dataset.visible = "true";
        element.style.setProperty(
          "transform",
          `translate(${a.x + (b.x - a.x) * progress}px, ${a.y + (b.y - a.y) * progress}px)`,
        );
      }
    };
    const travelling = () =>
      new Set(
        flights.flatMap((flight) =>
          flight
            ? [
                flight.path[Math.floor(flight.hop)],
                flight.path[Math.floor(flight.hop) + 1],
              ].join("-")
            : [],
        ),
      );
    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      // The first frame's timestamp can precede the mount time.
      const dt = Math.max(0, Math.min(now - last, 64));
      if (!still) {
        stepBodies(
          bodies,
          now < settleUntil ? { ...options, maxSpeed: 8 } : options,
          dt,
          hovered.current,
        );
        travel(now, dt);
      }
      last = now;
      const lit = travelling();
      for (const [index, body] of bodies.entries())
        nodes.current[index]?.style.setProperty(
          "transform",
          `translate(${body.x - SIZE / 2}px, ${body.y - SIZE / 2}px)`,
        );
      for (const [index, [a, b]] of links.entries()) {
        const line = lines.current[index];
        if (!line) continue;
        line.setAttribute("x1", String(bodies[a].x));
        line.setAttribute("y1", String(bodies[a].y));
        line.setAttribute("x2", String(bodies[b].x));
        line.setAttribute("y2", String(bodies[b].y));
        line.dataset.active = String(
          hovered.current === a ||
            hovered.current === b ||
            lit.has(`${a}-${b}`) ||
            lit.has(`${b}-${a}`),
        );
      }
      if (!still || !nodes.current[0]) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(pending);
      observer.disconnect();
    };
  }, [avoid]);

  return (
    <div
      ref={container}
      aria-hidden
      className="absolute inset-0 overflow-hidden select-none max-md:opacity-40"
    >
      <svg className="absolute inset-0 size-full text-primary">
        {edges.map(([a, b], index) => (
          <line
            key={`${a}-${b}`}
            ref={(line) => {
              lines.current[index] = line;
            }}
            stroke="currentColor"
            strokeDasharray="4 6"
            className="opacity-25 transition-opacity data-[active=true]:opacity-70"
          />
        ))}
      </svg>
      {SIMPS.slice(0, count).map((name, index) => (
        <div
          key={name}
          ref={(node) => {
            nodes.current[index] = node;
          }}
          onPointerEnter={() => (hovered.current = index)}
          onPointerLeave={() => (hovered.current = -1)}
          className="group absolute top-0 left-0 will-change-transform"
          style={{ width: SIZE, height: SIZE }}
        >
          <span className="pointer-events-none absolute -inset-2 scale-75 rounded-[14px] border-2 border-transparent opacity-0 transition-[opacity,scale] duration-300 group-data-[receiving]:scale-100 group-data-[receiving]:opacity-100 group-data-[receiving=answer]:border-emerald-500 group-data-[receiving=answer]:shadow-[0_0_14px] group-data-[receiving=answer]:shadow-emerald-500/50 group-data-[receiving=question]:border-primary group-data-[receiving=question]:shadow-[0_0_14px] group-data-[receiving=question]:shadow-primary/50" />
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            width={SIZE}
            height={SIZE}
            draggable={false}
            className="opacity-60 transition-[opacity,scale] duration-300 group-hover:scale-125 group-hover:opacity-100 group-data-[receiving]:scale-110 group-data-[receiving]:opacity-100"
          />
          <span className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-md border bg-card px-2 py-0.5 font-mono text-xs whitespace-nowrap opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
            {name}
          </span>
        </div>
      ))}
      {Array.from({ length: PACKETS }, (_, slot) => (
        <div
          key={slot}
          ref={(packet) => {
            packets.current[slot] = packet;
          }}
          data-visible="false"
          data-answer="false"
          className="group/packet pointer-events-none absolute top-0 left-0 transition-opacity duration-300 will-change-transform data-[visible=false]:opacity-0"
        >
          <div className="absolute -top-1 -left-1 size-2 rounded-full bg-primary shadow-[0_0_0_4px] shadow-primary/20 group-data-[answer=true]/packet:bg-emerald-500 group-data-[answer=true]/packet:shadow-emerald-500/20" />
          <span className="absolute bottom-2.5 left-0 -translate-x-1/2 rounded-full border border-primary/30 bg-card/90 px-2 py-0.5 text-[11px] whitespace-nowrap text-primary shadow-sm group-data-[answer=true]/packet:border-emerald-500/40 group-data-[answer=true]/packet:text-emerald-700 dark:group-data-[answer=true]/packet:text-emerald-400" />
        </div>
      ))}
    </div>
  );
}
