# StylePro Manager — Authentication setup

## Implemented in the application

- Existing users sign in with their email address and password.
- The legacy `admin` username alias is retained only as a convenience and resolves to `VITE_ADMIN_EMAIL`.
- Public account creation has been removed from the application interface and the sign-up call has been removed from the client.
- The sign-in screen includes a password-reset email request.
- Password recovery is handled through Supabase Auth and the user chooses a new password after opening the recovery link.
- Existing authenticated sessions continue to be restored by the existing application session listener.

## Required Supabase Dashboard configuration

These are dashboard settings, not database migrations. Apply them deliberately to the correct Supabase project:

1. Open **Authentication → Settings / User Signups** and disable new user signups. This is required because hiding registration in the frontend alone does not disable the Supabase sign-up API.
2. Configure the project email/SMTP provider so password recovery emails can be delivered reliably.
3. In **Authentication → URL Configuration**, set the production application URL as the Site URL.
4. Add every legitimate app origin to the Redirect URLs allow-list, including the production URL and the exact local development URL/port used by the team.
5. Test password recovery with a non-admin test account before relying on it for production access.

The application requests password recovery with `redirectTo: window.location.origin`. Supabase must allow that origin.

## Important authorization boundary

- `VITE_ADMIN_EMAIL` only supports the legacy `admin` sign-in alias. It does **not** grant an administrator role.
- Administrator privileges must be assigned and checked by trusted server-side/database authorization (for example, verified role membership and Row Level Security policies).
- Never put a Supabase `service_role` key, database password, or other privileged secret in a `VITE_*` or `EXPO_PUBLIC_*` variable.
- Do not apply unverified RLS migrations. Inspect the live schema, existing policies, data integrity, and take a backup first.

## Verification checklist

- [ ] Existing user can sign in with email and password.
- [ ] Invalid credentials are rejected.
- [ ] No public registration control is shown in the app.
- [ ] Password-reset email is delivered.
- [ ] Recovery link returns to the app and opens the new-password form.
- [ ] New password is accepted and old password no longer works.
- [ ] An ordinary user cannot access another store's data (must be tested against real RLS policies).
- [ ] Admin privileges are based on trusted role assignment, not the email alias.

A successful frontend sign-in does not by itself prove that store isolation or role authorization is secure.
