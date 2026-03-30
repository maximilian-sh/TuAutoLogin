## TuAutoLogin

Auto-login helper for TUWEL and TISS via TU Wien IdP (Tampermonkey userscript).

### Requirements

-   Chrome/Edge/Firefox/Safari
-   Tampermonkey extension

### Install

1. Open Tampermonkey dashboard → Utilities → Import.
2. Choose `TuAutoLogin.user.js` from this folder and install.

### Configure credentials

-   Tampermonkey icon → TuAutoLogin → **"Set TU credentials"**: enter username and password.
-   Tampermonkey icon → TuAutoLogin → **"Set TOTP secret"**: enter your base32 TOTP secret (see below).
-   If credentials are empty, the script prompts the first time you hit the IdP login page and saves them.

### What it does

-   TUWEL (`/login/index.php`): clicks "TU Wien Login".
-   TISS: clicks "Login".
-   TU Wien IdP (`/core/loginuserpass`): fills `username`, `password`, and `totp`, then submits.
-   Password quality warning (`/tupwquality/badquality`): clicks Continue automatically.

### MFA / TOTP setup

TU Wien requires MFA for TUaccount since April 2026. The script supports automatic TOTP code generation.

**Setup:**

1. Go to the [TU Wien 2FA setup page](https://idp.zid.tuwien.ac.at) and set up a new authenticator.
2. When shown the QR code, also note the **base32 key** displayed below it (e.g. `7AG6F2...`).
3. Scan the QR code in Google Authenticator, Authy, or any other app as your backup.
4. In the Tampermonkey menu → **"Set TOTP secret"** → paste the same base32 key.
5. Use **"Test TOTP (show current code)"** to verify it matches your authenticator app.

**Behavior without a stored TOTP secret:**
The script fills username and password, then focuses the TOTP field — you enter the code from your authenticator app manually.

### Security

**Two Security Modes**: chosen on first use, switchable anytime via the Tampermonkey menu.

**Convenient Mode**: stores credentials encrypted in the browser — fully automatic login.
**Secure Mode**: nothing stored — manual entry every time, maximum security.

**Security Limitations:**

-   Convenient mode uses AES-GCM 256-bit encryption, but the key is derived from a fixed passphrase embedded in the script. A determined attacker with local browser access could still extract credentials.
-   Storing the TOTP secret reduces MFA to a second stored secret. It prevents remote attackers but not someone with direct access to your browser profile.
-   For maximum security, use Secure Mode and enter your TOTP manually.

### Permissions used

-   `GM_getValue`, `GM_setValue`: store credentials and TOTP secret.
-   `GM_registerMenuCommand`: menu for managing credentials and TOTP.

### Uninstall

Remove the userscript from the Tampermonkey dashboard.
