# Security policy

## Supported versions

Only the latest code on the **`main`** branch is supported. There are no
long-term support branches and no versioned releases yet.

## Reporting a vulnerability

Please **do not open a public issue** for a security vulnerability.

Report it privately with GitHub's vulnerability reporting:

1. Open the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Fill in the form with a description of the problem and, if possible, the
   steps to reproduce it.

Reports are read as time allows; you will get an answer through the same
private channel.

## Scope

PagePace parses untrusted PDF files, so anything that lets an attacker harm a
user or a machine **through a PDF** is in scope, including:

- a malicious PDF that crashes, hangs or makes the extractor consume
  unbounded memory or CPU;
- path traversal or file writes outside the expected directories;
- code execution, sandbox escapes or data exfiltration through extraction.

Out of scope: denial of service that only requires running the full test
suite or the evaluation corpus on the reviewer's own machine, and issues in
third-party dependencies that are already reported upstream.

## Security notes for contributors

- Never commit secrets, tokens or private corpus paths — see
  `CONTRIBUTING.md`.
- Dependency additions are reviewed for license and attack surface
  (`docs/extractor/DECISIONS.md`, ADR-006).
