# TuAutoLogin

Stop typing your TU Wien password and MFA code every time TUWEL or TISS logs you out.

TuAutoLogin is a small userscript that signs you in to **TUWEL** and **TISS** automatically through the TU Wien login page (IdP), including the 6-digit MFA code.

## What it does

-   **TUWEL**: on the login page it clicks "TU Wien Login" for you.
-   **TISS**: it clicks "Login" for you.
-   **TU Wien login page**: it fills in your username, password and MFA code, then signs you in.
-   **"Weak password" warning page**: it clicks Continue for you.

A plain loading screen covers the login page while this happens, so you only see TUWEL or TISS again once you're signed in.

## Installation

You need a browser with the [Tampermonkey](https://www.tampermonkey.net/) extension (Chrome, Edge, Firefox, Safari, Brave, ...).

1. Install Tampermonkey from your browser's extension store.
2. **Chrome / Edge / Brave only:** open the extension details for Tampermonkey (`chrome://extensions` → Tampermonkey → Details) and turn on **"Allow User Scripts"**. Without this, userscripts don't run.
3. Open this link: **[Install TuAutoLogin](https://raw.githubusercontent.com/maximilian-sh/TuAutoLogin/main/TuAutoLogin.user.js)**. Tampermonkey shows an install page; click **Install**.

Tampermonkey checks for updates on its own, so you'll get new versions without doing anything.

## First login

Go to [TUWEL](https://tuwel.tuwien.ac.at) or [TISS](https://tiss.tuwien.ac.at) and log in as usual. The first time you reach the TU Wien login page, the script asks for your **username** and **password** once and stores them in your browser.

From then on it fills them in automatically. For the MFA code you have two options:

### Option A: fully automatic (recommended)

The script generates the MFA code itself, just like your authenticator app does. For that it needs the **secret key** of your authenticator, which is shown when you set up MFA.

1. Go to the [TU Wien MFA settings](https://idp.zid.tuwien.ac.at) and set up a new authenticator.
2. Under the QR code you'll see a text key (letters A–Z and digits 2–7, e.g. `7AG6F2...`). Copy it.
3. Also scan the QR code with your usual authenticator app (Google Authenticator, Authy, 2FAS, ...), so you still have the code on your phone.
4. Click the Tampermonkey icon → **TuAutoLogin** → **Set TOTP secret** and paste the key.
5. Click **Test TOTP (show current code)** and check that the code matches the one in your app.

> If you already set up MFA earlier and didn't keep the key, you have to set up a new authenticator to see it again.

### Option B: type the code yourself

If you don't store the key, the script fills in username and password and puts the cursor in the MFA field. Type the code from your app; the form submits as soon as all 6 digits are entered.

## Settings menu

Click the Tampermonkey icon → **TuAutoLogin**:

| Menu item                      | What it does                                              |
| ------------------------------ | --------------------------------------------------------- |
| Set TU credentials             | Change your stored username or password                   |
| Clear TU credentials           | Delete the stored username and password                   |
| Set / Update TOTP secret       | Store or change the MFA key                               |
| Clear TOTP secret              | Delete the MFA key (you then type the code yourself)      |
| Test TOTP (show current code)  | Shows the current code so you can compare it with your app |

## Troubleshooting

-   **Nothing happens at all**: check that the script is enabled in Tampermonkey and, in Chrome-based browsers, that "Allow User Scripts" is on (see Installation).
-   **Login fails / the login page keeps coming back**: the script retries twice (waiting for a fresh MFA code each time) and then stops so your account doesn't get locked. Usually your password changed: use **Set TU credentials** to update it.
-   **MFA code is wrong**: compare with **Test TOTP**. If the codes differ, the stored key is wrong; set it again. If they match but login still fails, check that your computer's clock is set automatically.
-   **Changed your TU password**: update it via **Set TU credentials**.

## Security & privacy

Your username, password and MFA key are stored in your browser (Tampermonkey storage). They are obfuscated, not securely encrypted, and are only ever entered into the TU Wien login form. Don't use the script on shared computers.

## Uninstall

Tampermonkey dashboard → TuAutoLogin → delete. This also removes the stored credentials and MFA key.

## Disclaimer

This is an unofficial student project and not affiliated with TU Wien. Use at your own risk.

Bug reports and suggestions: [GitHub Issues](https://github.com/maximilian-sh/TuAutoLogin/issues).

## License

[MIT](LICENSE)
