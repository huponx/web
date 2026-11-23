#!/bin/sh
# Runs before nginx starts (docker-entrypoint.d). Writes the security headers to /tmp/headers.conf.
# connect-src allows the gateway origin only: it is taken from API_BASE of /config.js, the same
# value the app uses, so the CSP and the app cannot disagree and one image serves every environment.
set -eu

cfg=/usr/share/nginx/html/config.js
api="$(sed -n 's/.*API_BASE[^"]*"\([^"]*\)".*/\1/p' "${cfg}" | head -n 1)"
origin="$(printf '%s' "${api}" | sed -En 's#^(https?://[^/]+).*#\1#p')"

if [ -z "${origin}" ]; then
  echo "40-headers.sh: API_BASE (an http(s) URL) not found in ${cfg}" >&2
  exit 1
fi
case "${origin}" in
  *[!A-Za-z0-9.:/-]*)
    echo "40-headers.sh: API_BASE has unexpected characters: ${origin}" >&2
    exit 1
    ;;
esac

# media-src: the dict app plays the pronunciations straight from the dictionary sources (the hosts of
# DICTIONARY_AUDIO_HOSTS of the dictionary service); no other app plays audio.
media="'self' https://api.dictionaryapi.dev https://upload.wikimedia.org https://ssl.gstatic.com"

csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src ${media}; font-src 'self'; connect-src 'self' ${origin}; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"

cat > /tmp/headers.conf <<H
add_header Content-Security-Policy "${csp}" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
H
echo "40-headers.sh: connect-src ${origin}"
