# Security Policy

## Reporting

Please report suspected vulnerabilities privately to the maintainers before public disclosure.

## Data handling

- Browser-side processing is preferred for local file work.
- Worker jobs must run in ephemeral directories with bounded retention.
- File contents, secrets, and signed URLs must not be written to logs.
