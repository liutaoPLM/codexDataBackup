# Tab Capability: browserAuth

Sign into websites by obtaining credentials and securely filling sign-in forms. Signing in has two parts: request credentials with `requestCredentials`, then enter them with `fillCredentials`. Ask the user for any additional information or action needed to complete sign-in.

## Sign-in preferences

When choosing a sign-in method:

1. Use the sign-in method the user explicitly requested, if available and supported.
2. Otherwise, prefer a method supported by evidence of a prior sign-in to this website.
3. Ask the user which method to use only when the choice remains ambiguous.

Passkeys are not supported. Use another sign-in method if available.

For Google verification, prefer an existing phone OTP method; otherwise, use device approval if available. Do not ask the user to choose when the selection is clear.

## API

These methods are on the object returned by `tab.capabilities.get("browserAuth")`, named `auth` in the examples.

`auth.requestCredentials(request)` returns `{ status: "ready", handle }` or a terminal status. It derives the origin from the tab and never returns secret values. Pass the opaque handle to `auth.fillCredentials({ handle, fields, submit })` to enter the credentials.

Use numeric element indices from a fresh `tab.ax.get("state")` result. Each field is `{ element_index, label }`, where `label` is one of `username`, `email`, `phone`, `password`, `otp`, or `other`. Labels describe field roles, never credential values.

Provide `submit: { element_index }` to click that control after filling. If `submit` is omitted, the flow attempts Enter on the last filled field.

### Username and password

`auth.requestCredentials({ type: "username_password", usernameType: "email" })` requests an email and password together. Use `usernameType: "phone"` for a phone number, or `"username"` for a username or other account identifier. Use this only when a password is needed; otherwise, use known information or ask the user in chat for the needed information and enter it with regular browser APIs.

Fill either or both fields, choosing the identifier label that matches the page. Use `other` for a generic account identifier requested with `usernameType: "username"`. Reuse the handle across steps when the site asks for the identifier and password separately.

```js
const credentials = await auth.requestCredentials({ type: "username_password", usernameType: "email" });
nodeRepl.write(credentials);
if (credentials.status === "ready") {
  nodeRepl.write(await auth.fillCredentials({
    handle: credentials.handle,
    fields: [
      { element_index: 12, label: "email" },
      { element_index: 13, label: "password" },
    ],
    submit: { element_index: 14 },
  }));
}
```

### One-time code

Enter codes provided by the user using regular browser APIs.

Use `auth.requestCredentials({ type: "otp", otpHandle })` when a connected mailbox provides an opaque handle for a redacted code. For `[otp-handle:VALUE]`, pass `VALUE` as `otpHandle`, not the code itself. Fill one whole-code input with `{ element_index, label: "otp" }`, or list separate character inputs in code order, each labeled `otp`.

### Results

Use a handle from a `ready` request. Respect `declined` and `cancelled`; for `unavailable` or `expired`, ask the user for the action needed to continue.

Reuse an existing credential handle from context for the intended account and website. If the browser or page needs recovery, return to the previously visited sign-in page, inspect it, and fill using the same handle with fresh element indices. Request credentials only when no suitable handle is available or it has expired.

After filling, inspect the page to confirm that sign-in advanced. Refresh the AX state and choose current element indices after `locator_invalid`. Inspect the current page before retrying other failures; `unknown` is not proof that the fill failed.
