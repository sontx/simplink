---
type: procedure
title: Send a message
summary: Select a recipient delivery method.
docs:
  path: guides/messaging/choose-a-recipient.md
  order: 20
preconditions: [state.channel.zalo-connected]
optional_preconditions: [state.audience.segment-created]
choices:
  - id: recipient
    question: How is the recipient identified?
    options:
      - key: uid
        when: A user identifier is known
        procedure: procedure.zalo.deliver-by-uid
      - key: phone
        when: A phone number is known
        procedure: procedure.zalo.deliver-by-phone
---

## Steps

1. Open the customer conversation.
2. choice:recipient
