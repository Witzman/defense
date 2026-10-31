#!/usr/bin/env python3
"""Refuse the attribution trailer and the over-long commit message.

Reads `git log --format=%B%x00 <range>` on stdin. A standalone copy of two
rules from the Chronist toolkit: the CI container has the product repo and
nothing else, and a shared library would cost more to ship than these lines.
"""

import re
import sys

SUBJECT_MAX = 72
MESSAGE_MAX = 800

ATTRIBUTION = re.compile(
    r"^[ \t]*(Co-Authored-By:|Co-authored-by:|Claude-Session:)"
    r"|Generated with \[Claude Code\]|\U0001F916 Generated with", re.M)
GENERATED = re.compile(r"^(Merge |Revert |fixup! |squash! )")
COMMENT = re.compile(r"^#(\s|$)")


def offences(message):
    body = "\n".join(l for l in message.split("\n")
                      if not COMMENT.match(l)).strip()
    if not body or GENERATED.match(body):
        return []
    found = []
    if ATTRIBUTION.search(message):
        found.append("attribution trailer")
    subject = body.split("\n", 1)[0]
    if len(subject) > SUBJECT_MAX:
        found.append("subject is %d characters, limit %d"
                     % (len(subject), SUBJECT_MAX))
    if len(body) > MESSAGE_MAX:
        found.append("message is %d characters, limit %d"
                     % (len(body), MESSAGE_MAX))
    return found


def main():
    bad = 0
    for message in sys.stdin.read().split("\0"):
        message = message.strip()
        if not message:
            continue
        for offence in offences(message):
            print("REFUSED: %s\n  in: %s"
                  % (offence, message.split("\n")[0]), file=sys.stderr)
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
