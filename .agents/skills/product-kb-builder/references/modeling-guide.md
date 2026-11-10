# Modeling guide

How to turn product facts into kb-graph nodes that resolve into good plans and are easy to find.

## Contents

1. Choosing the node type
2. Granularity
3. Branching: alternatives vs choices vs optional
4. Writing for retrieval (aliases, when_to_use)
5. Writing steps
6. Worked example

## 1. Choosing the node type

| You found…                                                                      | Model as       | Why                                            |
| ------------------------------------------------------------------------------- | -------------- | ---------------------------------------------- |
| Something a user wants to accomplish ("export a report")                        | **goal**       | Entry point for search; one per intent         |
| A sequence of actions in the UI or API                                          | **procedure**  | Becomes RUN steps                              |
| A product feature/ability, gated or reusable ("Scheduling")                     | **capability** | Carries availability; shared by procedures     |
| A condition that may or may not hold ("channel connected", "template approved") | **state**      | Becomes a CHECK with a conditional fix         |
| A limit, policy, or validation rule ("max 1,000 recipients", "content policy")  | **constraint** | Shown with the plan; blocking ones always kept |

Signals in code:

| Code artifact                                                                    | Usually becomes                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Menu item / route / page                                                         | procedure (sometimes a goal if it maps to one intent)    |
| Status enum value checked before an action (`connected`, `approved`, `verified`) | state                                                    |
| Guard / middleware / "must X before Y" error                                     | state + `preconditions`, or `requires`                   |
| Plan matrix, feature flag, permission check                                      | capability `availability` (and procedure `availability`) |
| Validation rule, rate limit, quota, policy error message                         | constraint                                               |
| Setup flow that other flows depend on (connect account, create API key)          | procedure that `produces` a state                        |
| Docs article title phrased as "How to …"                                         | goal (+ its procedure)                                   |

## 2. Granularity

- **Goal**: phrase as "I want to …". If two goals would have identical procedures, merge them and keep
  the other phrasing as an alias.
- **Procedure**: 2–10 steps. Longer usually means a hidden prerequisite procedure or a choice.
  One procedure per way of doing it, not per screen.
- **State**: binary and checkable. "Account is set up" is too vague; "SMS sender connected" is right.
- **Capability**: only when it carries availability, constraints, or is used by several procedures.
  Don't create a capability for every button.
- **Constraint**: one rule family per node ("SMS broadcast policy"), with specifics in the body.

## 3. Branching

| Situation                                                       | Model                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Two whole ways to reach the goal (UI vs API)                    | Two procedures in the goal's `procedures` (ranked alternatives)              |
| Shared steps, one fork in the middle (send by user ID vs phone) | `choices` on the procedure; one procedure per option                         |
| Either A or B must be true                                      | `choices`, each option with its own `preconditions` (no boolean expressions) |
| Helpful but not required ("a saved segment makes this faster")  | `optional_preconditions`                                                     |
| Prerequisite that may already be done                           | `preconditions` + state with `satisfied_by`                                  |
| Prerequisite that must always run first                         | `requires`                                                                   |

## 4. Writing for retrieval

Search weights: title 5, aliases 4, when_to_use 4, tags 3, id words 2, summary 2, body 1.
Queries are diacritic-folded, so `gửi tin` and `gui tin` match the same; you never need no-diacritic
duplicates.

**Aliases** — the words users actually type, 3–8 per goal:

- Vietnamese with diacritics _and_ English.
- Colloquial forms and product jargon: "nhắn tin hàng loạt", "bulk message", "campaign".
- Not marketing copy, not the title repeated, and no alias shared with another goal (W105).

**when_to_use** — situations, not features, 1–4 per goal:

- Good: "User wants to text many customers at once"
- Bad: "Broadcast feature"

**Summary** — one sentence on the outcome, ≤ 200 chars. It is what the agent sees in search results.

## 5. Writing steps

- Use the exact UI labels from i18n files, in the KB's primary language, with paths like
  `Settings → Channels → SMS`.
- One action per step; start with a verb.
- For API procedures: method and path, key fields — no auth secrets or internal hosts.
- No internal function names, table names, or feature-flag names.
- Put error recovery in `## Failure handling`, linking constraints with `[[id]]`.

## 6. Worked example

Evidence:

- `src/pages/broadcast/New.tsx` creates a broadcast; `i18n/vi.json` labels "Tạo chiến dịch".
- `src/api/broadcast.ts` throws `SMS_NOT_CONNECTED` if the channel is missing.
- `config/plans.ts`: scheduling only on `pro` and `enterprise`.
- `docs/help/broadcast.md`: "How to send an SMS broadcast".

Model:

- goal `goal.broadcast.send-sms` (from the docs title)
- procedure `procedure.broadcast.send-sms` (from the page + labels)
- state `state.channel.sms-connected`: `check` from the settings UI, `satisfied_by: [procedure.channel.connect-sms]` (from the error guard)
- capability `capability.broadcast.schedule` with `availability: { plans: [pro, enterprise] }` (from the plan matrix)
- constraint only if a policy or limit is evidenced
