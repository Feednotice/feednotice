#!/bin/sh
# Configures Postfix from the environment, then runs it in the foreground.
set -eu

: "${MTA_HOSTNAME:?MTA_HOSTNAME is required (e.g. s1.example.org)}"
: "${BOUNCE_ADDRESS:?BOUNCE_ADDRESS is required (e.g. feedback@mail.example.org)}"
: "${POSTMASTER_FORWARD:?POSTMASTER_FORWARD is required (a mailbox read by a human)}"
: "${WEBHOOK_SECRET:?WEBHOOK_SECRET is required}"
APP_URL="${APP_URL:-http://app:8080}"
TRUSTED_NETWORKS="${MTA_TRUSTED_NETWORKS:-172.30.0.0/24}"
INET_PROTOCOLS="${MTA_INET_PROTOCOLS:-ipv4}"
LOG_DAYS="${MTA_LOG_DAYS:-14}"
MAIL_DOMAIN="${BOUNCE_ADDRESS#*@}"

# --- main.cf ------------------------------------------------------------------------------
postconf -e \
  "compatibility_level = 3.6" \
  "myhostname = $MTA_HOSTNAME" \
  "mydomain = $MAIL_DOMAIN" \
  "myorigin = \$mydomain" \
  "smtpd_banner = \$myhostname ESMTP" \
  "inet_interfaces = all" \
  "inet_protocols = $INET_PROTOCOLS" \
  "mynetworks = 127.0.0.0/8 $TRUSTED_NETWORKS" \
  "maillog_file = /var/log/postfix/mail.log" \
  "mydestination =" \
  "local_transport = error:local delivery is disabled" \
  "alias_maps =" \
  "alias_database =" \
  "relay_domains = $MAIL_DOMAIN" \
  "relay_recipient_maps = inline:{ $BOUNCE_ADDRESS=ok, postmaster@$MAIL_DOMAIN=ok, abuse@$MAIL_DOMAIN=ok }" \
  "virtual_alias_maps = inline:{ postmaster@$MAIL_DOMAIN=$POSTMASTER_FORWARD, abuse@$MAIL_DOMAIN=$POSTMASTER_FORWARD }" \
  "transport_maps = inline:{ $BOUNCE_ADDRESS=bounce-to-app: }" \
  "disable_vrfy_command = yes" \
  "smtpd_helo_required = yes" \
  "message_size_limit = 10240000" \
  "maximal_queue_lifetime = 2d" \
  "bounce_queue_lifetime = 1d" \
  "default_destination_concurrency_limit = 5" \
  "smtp_tls_security_level = may" \
  "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt" \
  "smtp_tls_loglevel = 1" \
  "smtpd_tls_security_level = may" \
  "smtpd_tls_cert_file = /etc/postfix/tls/cert.pem" \
  "smtpd_tls_key_file = /etc/postfix/tls/key.pem"

# --- master.cf ----------------------------------------------------------------------------
# Port 25, open to the Internet: never relays, whoever connects (Docker may present outside
# clients with an internal address). Only mail for relay_domains (the bounce address) is taken.
postconf -P "smtp/inet/smtpd_relay_restrictions=reject_unauth_destination"
# A bounce is small: larger messages are refused at the door, never queued.
postconf -P "smtp/inet/message_size_limit=1048576"
# Port 2525, internal network only (not published): submission by the application.
postconf -M "2525/inet=2525 inet n - n - - smtpd"
postconf -P \
  "2525/inet/syslog_name=postfix/app" \
  "2525/inet/smtpd_client_restrictions=permit_mynetworks,reject" \
  "2525/inet/smtpd_relay_restrictions=permit_mynetworks,reject" \
  "2525/inet/smtpd_tls_security_level=none"
# Bounces go to the application.
postconf -M "bounce-to-app/unix=bounce-to-app unix - n n - 4 pipe flags=R user=nobody argv=/usr/local/bin/forward-bounce"

# Opportunistic TLS for incoming mail: a self-signed certificate is enough for MTA-to-MTA.
if [ ! -f /etc/postfix/tls/cert.pem ]; then
  mkdir -p /etc/postfix/tls
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=$MTA_HOSTNAME" \
    -keyout /etc/postfix/tls/key.pem -out /etc/postfix/tls/cert.pem 2>/dev/null
  chmod 600 /etc/postfix/tls/key.pem
fi

# curl configuration for the bounce hook, readable only by the pipe's user: the secret never
# appears on a command line. Values are quoted for curl (backslashes and quotes escaped).
quote() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
{
  printf 'url = "%s/hooks/bounce"\n' "$(quote "$APP_URL")"
  printf 'header = "Authorization: Bearer %s"\n' "$(quote "$WEBHOOK_SECRET")"
} > /etc/forward-bounce.curl
chown nobody /etc/forward-bounce.curl
chmod 400 /etc/forward-bounce.curl

# The mail log holds recipient addresses (personal data): rotated every night, and rotated files
# older than MTA_LOG_DAYS are deleted. Read it with `maillog` (all days) or tail the file.
mkdir -p /var/log/postfix
printf '17 0 * * * /usr/local/bin/rotate-maillog %s\n' "$LOG_DAYS" > /etc/crontabs/root
crond -b -l 8

postfix check
exec postfix start-fg
