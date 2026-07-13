# Registration Code Rate Limit Design

## Goal

Prevent automated registration-code requests from exhausting the email provider quota without blocking normal registrations.

## Policy

- A normalized email address may receive one registration code every 60 seconds.
- A normalized email address may receive at most five codes in a rolling one-hour window.
- The server returns HTTP 429 with the generic message `请稍后再试` when either limit applies.
- Existing registered users, login sessions, and existing verification records are unchanged.

## Architecture

Add a small Prisma model that stores only the normalized email identifier and request timestamp. The registration-code route checks the latest matching request and the matching-request count in the last hour before creating a verification code or calling Resend. The request is recorded in the same database transaction as the verification record update, so a successful send path cannot be bypassed by a browser refresh or server restart.

## Privacy And Retention

The model stores the normalized email address because the route must rate-limit that exact address. It stores no verification code and no IP address. Old records are pruned during the send flow after they are outside the one-hour enforcement window.

## Testing

Tests will verify that a first request is accepted, a second request within 60 seconds is rejected, the sixth request in one hour is rejected, and a request after the window is accepted. Existing registration and code-verification tests remain unchanged.
