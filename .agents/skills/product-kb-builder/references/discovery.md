# Discovery: where to look

Goal of Phase 1: find the product's user-facing surface and its rules quickly, without reading
everything. Sample broadly, then go deep only where an area is in scope.

## Contents

1. Order of exploration
2. Search patterns by artifact
3. Docs
4. What to ignore
5. Recording evidence

## 1. Order of exploration

1. **Docs / help center**: user intents and wording (goals, aliases).
2. **Navigation and routes**: the map of areas and procedures.
3. **i18n label files**: exact UI labels in every language (steps, aliases).
4. **Plans / permissions / feature flags**: availability.
5. **Guards, validation, error codes**: states, preconditions, constraints.
6. **Status enums and models**: candidate states.
7. **Public API spec** (OpenAPI, GraphQL schema): API procedures.

## 2. Search patterns

In Claude Code, prefer the built-in Grep/Glob tools or `rg`. If `rg` is not installed, use the
`grep -E` column; the regexes are the same. Adjust globs to the repo's languages.

```bash
G='grep -rEn --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.vue --include=*.py --include=*.go --include=*.java --exclude-dir=node_modules --exclude-dir=dist'
```

| Looking for               | Pattern (use with `rg -n` or `$G`)                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SPA route tables          | `path:\s*['"]/`                                                                                                  |
| Server routes             | `@(Get\|Post\|Put\|Patch\|Delete)\(\|router\.(get\|post\|put\|patch\|delete)\(\|@app\.(get\|post)\|HandleFunc\(` |
| Plan matrix keys          | `\b(free\|basic\|starter\|pro\|premium\|business\|enterprise)\s*:`                                               |
| Feature/permission checks | `featureFlag\|isEnabled\(\|hasFeature\|hasPermission\|requirePermission\|can\(\|FLAGS`                           |
| Guards and error codes    | `throw new .*Error\|ErrorCode\.\|errors?\.[A-Z_]{4,}\|status\s*(!==\|===\|==)\s*['"]`                            |
| Limits and quotas         | `max(imum)?_?\|limit\|quota\|rate.?limit\|exceed\|not allowed\|must be`                                          |
| Status enums / unions     | `enum .*status\|type \w*Status\|status:\s*\[\|['"](connected\|approved\|verified\|active\|pending\|expired)['"]` |

(In the table, `\|` is an escaped pipe; type it as `|` in the shell.)

Files rather than lines:

```bash
# i18n label files
find . -path ./node_modules -prune -o -type f -print | grep -Ei "(i18n|locales?|lang|translations?)/.*\.(json|ya?ml|po)$"
# API specs
find . -path ./node_modules -prune -o -type f -print | grep -Ei "(openapi|swagger).*\.(ya?ml|json)$|schema\.graphql$"
```

Read each hit in context: one guard line often yields a state (the status check), its fix procedure
(how the status becomes true), and a constraint (the limit), as in the modeling guide's worked example.

## 3. Docs

- Help-center titles phrased "How to …" or "Cách …" are goal candidates; their wording feeds aliases.
- Docs can be outdated. When docs and code disagree, follow the code and note the conflict in the
  inventory's open questions.
- Docs may be a URL rather than files; record the URL in `sources`.

## 4. What to ignore

- Admin/internal tooling unless the user includes it in scope.
- Test fixtures, mocks, seed data, migrations (except to understand enums).
- Feature flags for unreleased features. Note them as open questions instead.
- Secrets, env files, internal hostnames, customer data: never copy them into the KB.

## 5. Recording evidence

For every inventory row, record at least one source: `path:line` or a doc URL. These become the
node's `sources:` field, which update mode uses to find nodes affected by a code change.
