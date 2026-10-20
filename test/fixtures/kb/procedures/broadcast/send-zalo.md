---
type: procedure
title: Send Zalo broadcast
summary: Deliver a message to an audience.
availability:
  plans: [pro]
uses: [capability.broadcast.schedule]
preconditions: [state.channel.zalo-connected]
constrained_by: [constraint.broadcast.consent]
---

## Steps

1. Select an audience.
2. Write the message and send it.

## Failure handling

If delivery fails, check the channel status before retrying.
