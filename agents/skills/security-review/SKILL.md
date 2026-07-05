---
name: security-review
description: OWASP-lens security review checklist for code changes. Use before committing, during PR review, or when auditing a feature touching auth, secrets, user input, data access, or external APIs.
---

# Security Review Checklist

## Secrets & Credentials
- [ ] No hardcoded secrets, API keys, passwords, or tokens
- [ ] `.env` files in `.gitignore` — never committed
- [ ] Secrets loaded from environment variables, not config files
- [ ] No secrets in logs or error messages

## Injection
- [ ] SQL queries use parameterized statements (never string concatenation)
- [ ] NoSQL queries sanitized — no `$where` with user input
- [ ] Shell commands don't include user input directly — use argument arrays
- [ ] Template strings that render HTML escape user content

## Authentication & Authorization
- [ ] Every authenticated route checks the session/token
- [ ] Authorization checks are server-side (not just UI-hidden)
- [ ] Tokens have expiration set
- [ ] Password hashing uses bcrypt/argon2 (never MD5/SHA1)
- [ ] No auth logic client-side only

## SSRF (Server-Side Request Forgery)
- [ ] User-supplied URLs are validated against an allowlist
- [ ] Internal network addresses (`169.254.x.x`, `10.x.x.x`, `127.x.x.x`) blocked
- [ ] Redirects don't blindly follow to user-supplied URLs

## Output Encoding
- [ ] User content rendered in HTML/templates is escaped
- [ ] Content Security Policy headers set

## CORS
- [ ] `Access-Control-Allow-Origin` not set to `*` in production
- [ ] CORS allowed origins are explicitly listed

## Dependencies
- [ ] No known CVEs in direct dependencies (`npm audit`, `pip-audit`)
- [ ] Dependencies pinned to specific versions in production

## Input Validation
- [ ] All user inputs validated server-side (not just client-side)
- [ ] File uploads: type checked, size limited, stored outside webroot
- [ ] Pagination limits enforced server-side (no unbounded queries)

## Data Access
- [ ] Users can only access their own data (no IDOR)
- [ ] Sensitive fields omitted from API responses (passwords, internal IDs)
- [ ] Bulk endpoints rate-limited
