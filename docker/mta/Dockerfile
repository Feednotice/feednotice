# Send-only Postfix. It relays what the application submits (port 2525, internal network only)
# and accepts from the Internet mail for a single address: the bounce address, whose messages
# are posted to the application. Nothing else is accepted, nothing is stored.
FROM alpine:3.22

RUN apk add --no-cache postfix ca-certificates curl openssl tzdata

COPY entrypoint.sh /usr/local/bin/entrypoint
COPY forward-bounce.sh /usr/local/bin/forward-bounce
COPY rotate-maillog.sh /usr/local/bin/rotate-maillog
COPY maillog.sh /usr/local/bin/maillog
RUN chmod 755 /usr/local/bin/entrypoint /usr/local/bin/forward-bounce /usr/local/bin/rotate-maillog /usr/local/bin/maillog

EXPOSE 25 2525
ENTRYPOINT ["/usr/local/bin/entrypoint"]
