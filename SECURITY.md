# Security

FeedNotice reads URLs supplied by anyone, sends email in its operator's name and holds
subscribers' addresses: security reports are welcome and handled first.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead: the **Security**
tab of this repository, then **Report a vulnerability**. Include what you found, how to
reproduce it, and what an attacker could do with it.

You will get an answer within a week. Once a fix is released, the advisory is published, and
you are credited unless you prefer not to be.

## Supported versions

Fixes go into the latest release. Operators should keep up with releases (Dependabot keeps the
dependencies current; `docker compose pull` gets the new images).

## In scope

The code in this repository and the Docker images built from it: for example SSRF or denial of
service through a feed, a way to subscribe or unsubscribe someone else, to read or infer an
address, to forge a bounce, or to use the service to send unwanted email. A given deployment's
own configuration is its operator's responsibility.
