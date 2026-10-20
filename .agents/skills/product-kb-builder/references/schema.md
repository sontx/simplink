# kb-graph schema reference

The schema files live in kb-graph's `schemas/` directory and are authoritative; this is the readable
version. `kb-lint` enforces all of it.

## Contents

1. Paths and ids
2. Common fields
3. Fields per type (edges)
4. Choices
5. Body conventions
6. Lint codes and fixes

## 1. Paths and ids

```text
kb/<folder>/<seg>/<seg>.md  →  <type>.<seg>.<seg>
kb/procedures/zalo/send-message.md  →  procedure.zalo.send-message
```

| Folder          | Type       |
| --------------- | ---------- |
| `goals/`        | goal       |
| `procedures/`   | procedure  |
| `capabilities/` | capability |
| `states/`       | state      |
| `constraints/`  | constraint |

- Segments: lowercase kebab-case `[a-z0-9]+(-[a-z0-9]+)*`. No dots, no underscores, no uppercase.
- The id is derived from the path. The optional `id:` field must equal it, so omit it.
- Files directly in `kb/` (e.g. `INVENTORY.md`, `index.md`) are ignored by the loader.
- Use the area as the first segment: `procedure.billing.update-card`, `state.billing.card-valid`.

## 2. Common fields (all types)

| Field          | Required | Type                                           | Notes                                                |
| -------------- | -------- | ---------------------------------------------- | ---------------------------------------------------- |
| `type`         | yes      | enum                                           | Must match the folder                                |
| `title`        | yes      | string                                         | Short, user-facing                                   |
| `summary`      | yes      | string                                         | ≤ 200 chars (W103). Shown in search results          |
| `aliases`      |          | string[]                                       | Search synonyms, VI + EN                             |
| `tags`         |          | string[]                                       | Use `needs-review` for unverified nodes              |
| `related`      |          | id[]                                           | Soft link, any type                                  |
| `status`       |          | `active` \| `deprecated`                       | Default `active`                                     |
| `availability` |          | `{ plans?: string[], permissions?: string[] }` | Tenant gating                                        |
| `sources`      |          | string[]                                       | Repo paths / doc URLs used as evidence. Not searched |

Unknown keys are errors (E005), so do not invent fields.

## 3. Fields per type

Edges are declared in one direction only; the reverse direction is computed.

| Field                    | On                    | Target                  | Meaning                                                              |
| ------------------------ | --------------------- | ----------------------- | -------------------------------------------------------------------- |
| `when_to_use`            | goal (required, ≥1)   | strings                 | User situations; strongly weighted in search                         |
| `procedures`             | goal (required, ≥1)   | procedure ids           | Alternative ways to achieve the goal                                 |
| `requires`               | procedure             | procedure ids           | Must run **before** this one (always)                                |
| `requires`               | capability            | capability ids          | Capability dependency                                                |
| `preconditions`          | procedure             | state ids               | Must be true before starting. Unknown → CHECK step + conditional fix |
| `optional_preconditions` | procedure             | state ids               | Nice to have. Shown as advisory, never adds steps                    |
| `produces`               | procedure             | state ids               | True after the procedure succeeds                                    |
| `uses`                   | procedure             | capability ids          | Capabilities exercised                                               |
| `constrained_by`         | procedure, capability | constraint ids          | Applicable rules                                                     |
| `choices`                | procedure             | see §4                  | Branch point inside the steps                                        |
| `check`                  | state (required)      | string                  | How a user/agent verifies the state                                  |
| `satisfied_by`           | state (required, ≥1)  | procedure ids           | How to make the state true                                           |
| `severity`               | constraint (required) | `blocking` \| `warning` | Blocking constraints are never trimmed from plans                    |

`requires` vs `preconditions`: use `requires` when the other procedure must always run first (it has
no checkable outcome, or it is always needed). Use `preconditions` + a state when it may already be done:
the resolver then checks first and fixes only if needed.

## 4. Choices

```yaml
choices:
  - id: recipient # slug, unique within the procedure
    question: How are recipients identified?
    options: # ≥ 2 options (1 is a W108 warning)
      - key: uid # slug, unique within the choice
        when: You have Zalo user IDs of OA followers # helps the agent/user pick
        procedure: procedure.zalo.deliver-by-uid
      - key: phone
        when: You only have phone numbers
        procedure: procedure.zalo.deliver-by-phone
```

Reference each choice exactly once in `## Steps` as its own item: `2. choice:recipient`.
Each option's procedure is resolved as a sub-plan with its own preconditions and availability.

## 5. Body conventions

| Type       | Body                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| goal       | 1–3 sentences on the intent. **No steps** (E011)                       |
| procedure  | `## Steps` with an ordered list (E010). Optional `## Failure handling` |
| capability | What it does, limits, plan notes                                       |
| state      | What "true" means, if `check` needs more detail                        |
| constraint | The rules and what happens when violated                               |

- Link other nodes with `[[id]]`; links become `related` edges and must resolve (E007).
- Code in backticks or fences is ignored for links and step detection.
- Unverified content: tag `needs-review` and add a body line `Unverified: <what and why>`.

## 6. Lint codes and fixes

| Code | Meaning                                                | Usual fix                                                 |
| ---- | ------------------------------------------------------ | --------------------------------------------------------- |
| E001 | Duplicate id                                           | Rename one file                                           |
| E002 | `id:` ≠ path-derived id                                | Delete the `id:` line                                     |
| E003 | Not in a type folder, or `type` ≠ folder               | Move the file or fix `type`                               |
| E004 | Path is not a valid id                                 | Lowercase kebab-case, no dots in file names               |
| E005 | Unknown frontmatter key                                | Remove it, or move the content into the body              |
| E006 | Missing required field / empty required list           | Add it (see §2–3)                                         |
| E007 | Reference to a missing node                            | Create the node or fix the id                             |
| E008 | Reference to the wrong node type                       | e.g. `uses` must point to `capability.*`                  |
| E009 | Dependency cycle (`requires` / choices)                | Break it; usually one edge should be a precondition       |
| E010 | Procedure without ordered `## Steps`                   | Add `## Steps` with `1.` items                            |
| E011 | Goal body contains steps                               | Move steps to a procedure                                 |
| E012 | Other schema violation (enum, type)                    | Read the message                                          |
| E013 | Missing or invalid YAML frontmatter                    | File must start with `---`; quote strings containing `: ` |
| E014 | Choice not referenced exactly once in steps            | Add or dedupe the `choice:<id>` step                      |
| E015 | Duplicate choice id or option key                      | Rename                                                    |
| W101 | Orphan node                                            | Link it from a procedure/goal, or delete it               |
| W102 | Goal without aliases                                   | Add VI + EN aliases                                       |
| W103 | Summary > 200 chars                                    | Shorten                                                   |
| W104 | Active node references a deprecated one                | Update the reference                                      |
| W105 | Alias shared by several goals                          | Make aliases specific                                     |
| W106 | State never produced                                   | Add it to the fix procedure's `produces`                  |
| W107 | Procedure availability wider than a capability it uses | Narrow `availability`                                     |
| W108 | Choice with one option                                 | Remove the choice or add options                          |

YAML gotchas: quote values containing `: `, `#`, or starting with `[`, `{`, `*`, `&`, `!`, `@`.
Permissions like `broadcast:api` need quotes inside flow lists: `["broadcast:api"]`.
