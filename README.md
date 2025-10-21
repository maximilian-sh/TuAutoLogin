## TuAutoLogin

Auto-login helper for TUWEL and TISS via TU Wien IdP (Tampermonkey userscript).

### Requirements

-   Chrome/Edge/Firefox/Safari
-   Tampermonkey extension

### Install

1. Open Tampermonkey dashboard → Utilities → Import.
2. Choose `TuAutoLogin.user.js` from this folder and install.

### Configure credentials

-   Tampermonkey icon → TuAutoLogin → Menu → "Set TU credentials".
-   Enter username and password. You can clear them later via the same menu.
-   If credentials are empty, the script prompts the first time you hit the IdP login page and saves them.

### What it does

-   TUWEL (`https://tuwel.tuwien.ac.at/login/index.php`): clicks "TU Wien Login".
-   TISS (`https://tiss.tuwien.ac.at`): clicks "Login".
-   TU Wien IdP (`/core/loginuserpass`): fills `username` and `password`, submits.
-   Password quality warning (`/tupwquality/badquality`): clicks Continue when shown.

### Security

**Password Protection**: Passwords are encrypted before being stored in Tampermonkey storage to prevent casual inspection of stored credentials.

**Security Limitations**:

-   While this provides protection against casual browsing of storage, a determined attacker with browser access could still extract credentials
-   This is inherent to any client-side auto-login solution - the encryption key must be derivable by the script
-   For maximum security, consider using a dedicated password manager instead of storing credentials in browser storage
-   The script automatically migrates existing plaintext passwords to encrypted storage on first run

### Permissions used

-   `GM_getValue`, `GM_setValue`: store credentials.
-   `GM_registerMenuCommand`: quick menu for setting/clearing credentials.

### Notes

-   Script works only when TUaccount 2FA is disabled.
-   Keep cookies enabled; IdP may show a cookie warning if disabled.

### Uninstall

-   Remove the userscript from Tampermonkey dashboard.
