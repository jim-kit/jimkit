# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for a security problem. Use the repository's **Security** tab, **Report a vulnerability**,
which opens a private conversation with the maintainers, or write to jimkit@thejimmy.dev. Include what you found, how to reproduce it and the version.
You'll get an acknowledgement within a few days and a fix or a plan within a few weeks. Credit is given if you want it.

Particularly interesting: anything that lets a visitor outside the configured network be treated as trusted, read another
visitor's files, read server files through a converter, escape an engine's working directory, or bypass the same-origin check.

## Supported versions

Until 1.0, only the latest release gets fixes.

## What counts

See [docs/security.md](docs/security.md) for the threat model, what is hardened and what is deliberately out of scope (for example:
addons are trusted code, and Jimkit does not defend against a malicious administrator).
