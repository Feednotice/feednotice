#!/bin/sh
# Called by Postfix (pipe) with one message on standard input: a bounce for BOUNCE_ADDRESS.
# Posts it to the application. Exit 75 (EX_TEMPFAIL) tells Postfix to keep the message and
# retry later, e.g. while the application restarts.
# shellcheck source=/dev/null
. /etc/forward-bounce.env
curl -fsS --max-time 30 -o /dev/null -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H 'Content-Type: message/rfc822' \
  --data-binary @- "$APP_URL/hooks/bounce" || exit 75
