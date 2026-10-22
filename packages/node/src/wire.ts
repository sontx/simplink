import { EDGE_KINDS, NODE_TYPES } from "@sontx/simplink-core";
export const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown) => typeof v === "string";
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const array = (v: unknown, test: (v: unknown) => boolean): boolean =>
  Array.isArray(v) && v.every(test);
const strings = (v: unknown) => array(v, string);
const ref = (v: unknown): boolean =>
  object(v) && string(v.id) && string(v.title) && string(v.summary);
const available = (v: Record<string, unknown>) =>
  (v.available === null || typeof v.available === "boolean") &&
  strings(v.unavailableReasons);
const constraints = (v: unknown) =>
  array(
    v,
    (c) =>
      ref(c) &&
      object(c) &&
      (c.severity === "blocking" || c.severity === "warning"),
  );
const conditions = (v: unknown) =>
  v === undefined ||
  array(v, (c) => object(c) && string(c.state) && c.is === false);
const optional = (v: unknown) =>
  v === undefined ||
  array(
    v,
    (c) =>
      object(c) &&
      ref(c.state) &&
      string(c.how) &&
      (c.fix === null || string(c.fix)),
  );
const plan = (v: unknown): boolean =>
  array(v, (step) => {
    if (!object(step) || !conditions(step.when)) return false;
    if (step.kind === "check")
      return (
        ref(step.state) &&
        string(step.how) &&
        (step.ifFalse === null || string(step.ifFalse))
      );
    return (
      step.kind === "run" &&
      ref(step.procedure) &&
      ["main", "requires", "precondition"].includes(step.reason as string) &&
      optional(step.optional) &&
      (step.failureHandling === undefined || string(step.failureHandling)) &&
      array(step.steps, (item) => {
        if (string(item)) return true;
        return (
          object(item) &&
          item.kind === "choose" &&
          string(item.choice) &&
          string(item.question) &&
          (item.selected === undefined || string(item.selected)) &&
          array(
            item.options,
            (option) =>
              object(option) &&
              string(option.key) &&
              string(option.when) &&
              ref(option.procedure) &&
              available(option) &&
              plan(option.plan) &&
              array(option.capabilities, ref) &&
              constraints(option.constraints) &&
              strings(option.warnings),
          )
        );
      })
    );
  });
export const sources = (v: unknown) =>
  array(
    v,
    (s) =>
      object(s) &&
      string(s.simp) &&
      typeof s.ok === "boolean" &&
      number(s.ms) &&
      (s.error === undefined || string(s.error)),
  );

export const hits = (v: unknown) =>
  array(
    v,
    (h) =>
      ref(h) &&
      object(h) &&
      NODE_TYPES.includes(h.type as (typeof NODE_TYPES)[number]) &&
      number(h.score) &&
      number(h.relevance) &&
      object(h.matched) &&
      Object.values(h.matched).every(strings) &&
      strings(h.goals),
  );

export const goals = (v: unknown) =>
  array(
    v,
    (g) =>
      ref(g) &&
      object(g) &&
      number(g.score) &&
      number(g.relevance) &&
      array(g.via, (v) => object(v) && string(v.id) && number(v.hops)),
  );
const fields = (v: unknown) => {
  if (!object(v)) return false;
  for (const key of EDGE_KINDS)
    if (v[key] !== undefined && !strings(v[key])) return false;
  return (
    v.choices === undefined ||
    array(
      v.choices,
      (c) =>
        object(c) &&
        string(c.id) &&
        string(c.question) &&
        array(
          c.options,
          (o) =>
            object(o) && string(o.key) && string(o.when) && string(o.procedure),
        ),
    )
  );
};
export const nodes = (v: unknown) =>
  array(
    v,
    (n) =>
      ref(n) &&
      object(n) &&
      NODE_TYPES.includes(n.type as (typeof NODE_TYPES)[number]) &&
      (n.status === "active" || n.status === "deprecated") &&
      strings(n.aliases) &&
      strings(n.tags) &&
      fields(n.fields) &&
      (n.body === undefined || string(n.body)) &&
      (n.availability === undefined ||
        (object(n.availability) &&
          (n.availability.plans === undefined ||
            strings(n.availability.plans)) &&
          (n.availability.permissions === undefined ||
            strings(n.availability.permissions)))) &&
      array(
        n.out,
        (e) =>
          object(e) &&
          EDGE_KINDS.includes(e.kind as (typeof EDGE_KINDS)[number]) &&
          string(e.to),
      ) &&
      array(
        n.in,
        (e) =>
          object(e) &&
          EDGE_KINDS.includes(e.kind as (typeof EDGE_KINDS)[number]) &&
          string(e.from),
      ),
  );

export const resolved = (v: unknown) =>
  object(v) &&
  (v.subject === "goal" || v.subject === "procedure") &&
  ref(v.goal) &&
  object(v.goal) &&
  strings(v.goal.whenToUse) &&
  strings(v.warnings) &&
  array(
    v.alternatives,
    (a) =>
      object(a) &&
      number(a.rank) &&
      ref(a.procedure) &&
      typeof a.deprecated === "boolean" &&
      available(a) &&
      plan(a.plan) &&
      array(a.capabilities, ref) &&
      constraints(a.constraints) &&
      strings(a.satisfiedStates) &&
      strings(a.warnings),
  );

export { strings };
