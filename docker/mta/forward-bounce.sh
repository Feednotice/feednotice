#!/bin/sh
# Called by Postfix (pipe) with one message on standard input: a bounce for BOUNCE_ADDRESS.
# Posts it to the application. Exit 75 (EX_TEMPFAIL) tells Postfix to keep the message and
# retry later, e.g. while the application restarts. URL and secret come from a curl config
# file written by the entrypoint.
curl -fsS --max-time 30 -o /dev/null -X POST -K /etc/forward-bounce.curl \
  -H 'Content-Type: message/rfc822' \
  --data-binary @- || exit 75
