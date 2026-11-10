---
type: procedure
title: Configure gitSource and load its snapshot
summary: Create a gitSource for a repository, ref, and folder, optionally with a persistent checkout, and pass it to createKB.
aliases:
  - dùng gitSource
  - use gitSource
uses:
  - capability.integration.extensible-facade
constrained_by:
  - constraint.integration.source-contract
  - constraint.integration.snapshot-lifecycle
---

## Steps

1. Confirm that `git` is installed and that the machine can clone the repository without a prompt, using existing credentials or SSH keys.
2. Create the source with `gitSource(repo, { ref, directory })`. `repo` is a Git URL or a local repository path, `ref` is a branch or tag, and `directory` is the relative KB folder (default: the repository root).
3. To keep a reusable clone, add `checkout: "/path/to/clone"`; leave it out to clone into a temporary folder on every load.
4. Load the KB with `const kb = await createKB(source)`.
5. Check `kb.status.root` (the KB folder for a persistent checkout, or the repository otherwise) and `kb.status.errors`.
6. To pick up repository changes, call `createKB` again. With a persistent checkout, update the clone with Git first, for example `git pull` in the checkout folder.

## Failure handling

- `Git checkout belongs to a different repository`: point `checkout` to an empty folder, or to a clone whose `origin` is `repo`.
- `Git source directory must ...`: use a relative folder that exists inside the repository.
- Clone failures and two-minute timeouts are passed to the caller; check the URL, the ref, and the credentials.
