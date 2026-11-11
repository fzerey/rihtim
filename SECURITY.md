# Security Policy

## Supported versions

Security fixes go into the latest release. Please update to it before reporting.

| Version | Supported |
| ------- | --------- |
| [Latest release](https://github.com/fzerey/rihtim/releases/latest) | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub instead:

1. Go to the [Security tab](https://github.com/fzerey/rihtim/security) of this repository.
2. Click **Report a vulnerability**.
3. Fill in the form. Only the maintainers can see it.

Helpful details to include:

- the Rihtim version, and whether you use the web UI or the desktop app
- your OS and how Docker runs (Docker Desktop, Linux engine, WSL distro, remote context)
- steps to reproduce, or a proof of concept
- what an attacker can do with it

Reports are handled on a best-effort basis by the maintainers. You will get a reply
in the advisory once the report has been looked at, and you will be credited in the
fix's advisory unless you prefer otherwise.

## Scope and security model

Rihtim gives whoever can reach it **full control over the connected Docker engines**
(create containers, mount host paths, run commands). It is designed as a local,
single-user tool:

- The API listens on `127.0.0.1` by default and has no login of its own.
- The desktop app starts the API and web server on the loopback interface only.

Things we consider vulnerabilities, for example:

- another website or a remote host being able to drive the API (CORS, DNS rebinding,
  CSRF, request smuggling)
- reading or writing files outside the allowed folders through API parameters
- leaking registry credentials or TLS keys stored in `~/.rihtim`
- code execution in the desktop app from content shown in the UI (logs, image
  metadata, container names)

Not vulnerabilities on their own:

- anything that requires changing `HOST` to expose the API on a network you do not
  trust: putting an authenticating reverse proxy in front of it is up to you
- actions that Docker itself allows to anyone with access to the Docker socket
