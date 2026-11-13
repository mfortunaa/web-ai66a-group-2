# Issue #6 auth contract

All JSON endpoints below use `/api/auth`. Emails are trimmed and lowercased.

| Endpoint | Request | Success |
| --- | --- | --- |
| POST /register | `{"full_name":"An","email":"an@example.com","password":"password123"}` | 201 public user with `is_email_verified: false` and `verification_delivery: "sent"` or `"retry"` |
| POST /verify-email | `{"email":"an@example.com","code":"123456"}` | 200 `{"message":"Email verified. Please log in."}` |
| POST /resend-verification | `{"email":"an@example.com"}` | 200 generic message; 503 `delivery_failed` if an eligible account's delivery fails |
| POST /forgot-password | `{"email":"an@example.com"}` | 200 identical message for known/unknown accounts, including delivery failure |
| POST /reset-password | `{"token":"emailed-token","password":"newpassword123"}` | 200 `{"message":"Password updated. Please log in."}` |
| GET /me | Bearer token | 200 authenticated profile |
| PATCH /me | `{"full_name":"New Name"}` | 200 updated profile; extra fields such as `email` are rejected |

`POST /token` keeps OAuth2 form fields `username` and `password`. Wrong credentials return 401. Correct credentials for an unverified account return 403 `{"detail":{"code":"email_not_verified","action":"verify-email"}}`. Tokens contain an account version checked by `get_current_user`.

Passwords must contain at least eight characters and have no application-level maximum. New passwords are hashed with Argon2id; existing bcrypt hashes remain supported so current accounts can still sign in. The profile update endpoint can change `full_name` only; email cannot be edited.

429 responses contain `{"detail":{"code":"rate_limited","retry_after":60}}` and a `Retry-After` header, exposed through CORS. Invalid/expired/consumed challenges return 400 with code `invalid_challenge`. No response includes OTPs or reset tokens.

Defaults: OTP 5 minutes / 5 guesses, resend 60 seconds, verification requests 5 per email and 30 per IP per hour; OTP submissions 30 per IP per 15 minutes; recovery 5 per email and 30 per IP per hour; login 5 consecutive failures in 15 minutes then 15-minute block, plus 60 requests per IP per 15 minutes. Limits are persistent. Only the direct connection IP is used; run Uvicorn with `--no-proxy-headers`.
