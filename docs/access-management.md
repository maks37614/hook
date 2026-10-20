# H00K account access

Registration is open and requires no invitation or activation code. Users can
sign up with Google or their email and password. After authentication, **all
features are available indefinitely**. There is no trial, expiry, or paid access
gate.

The `/api/access/status` endpoint is kept for compatibility with existing
clients and reports `hasFullAccess: true`, `fullAccessUntil: null`, and
`status: "free"` (or `"admin"` for administrators).

Former trial and code records may still exist in `access.json`. They are
ignored, so accounts that previously expired become active again. Do not remove
the data directory; authentication sessions and account data must persist.

The old `/api/access/redeem` and `/api/access/admin/codes` routes have been
retired. No access-code issuance UI is provided. The optional internal
administrator bootstrap remains available for operational use, independently of
account access. Regular authenticated API routes still require a valid session.
