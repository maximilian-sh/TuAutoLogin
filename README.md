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

**Two Security Modes**: The script offers a choice between convenience and security on first use.

**Convenient Mode** (Default):

-   Stores credentials in browser for automatic login
-   Faster user experience - no manual input required
-   Passwords obfuscated but not truly secure
-   Protection against casual storage inspection only

**Secure Mode**:

-   No credentials stored anywhere
-   Manual password entry required each time
-   Maximum security - nothing stored in browser
-   Slower but completely secure

**Security Limitations**:

-   Convenient mode: While encrypted, determined attackers with browser access could still extract credentials
-   This is inherent to any client-side auto-login solution
-   For maximum security, use Secure Mode or a dedicated password manager
-   You can switch between modes anytime via the Tampermonkey menu

### Permissions used

-   `GM_getValue`, `GM_setValue`: store credentials.
-   `GM_registerMenuCommand`: quick menu for setting/clearing credentials.

### Notes

-   Script works only when TUaccount 2FA is disabled.
-   Keep cookies enabled; IdP may show a cookie warning if disabled.

### Uninstall

-   Remove the userscript from Tampermonkey dashboard.
