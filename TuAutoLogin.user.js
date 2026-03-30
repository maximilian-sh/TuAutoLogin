// ==UserScript==
// @name         TuAutoLogin
// @namespace    https://tuwien.ac.at/
// @version      1.5.0
// @description  Auto-login helper for TUWEL/TISS via TU Wien IdP. Supports convenient (encrypted storage) and secure (manual input) modes, with optional TOTP auto-fill for MFA.
// @author       Maximilian Kallina
// @match        https://tuwel.tuwien.ac.at/*
// @match        https://tiss.tuwien.ac.at/*
// @match        https://idp.zid.tuwien.ac.at/simplesaml/*
// @icon         https://tuwel.tuwien.ac.at/pluginfile.php/2/theme_boost_union/favicon/64x64/1759205872/tuwel_favicon.png
// @homepageURL  https://github.com/maximilian-sh/TuAutoLogin
// @updateURL    https://raw.githubusercontent.com/maximilian-sh/TuAutoLogin/main/TuAutoLogin.user.js
// @downloadURL  https://raw.githubusercontent.com/maximilian-sh/TuAutoLogin/main/TuAutoLogin.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const STORAGE_KEYS = {
        username: "TuAutoLogin.username",
        password: "TuAutoLogin.password",
        securityMode: "TuAutoLogin.securityMode",
        totpSecret: "TuAutoLogin.totpSecret",
    };

    let hasTriedAutoSubmit = false;

    // Derive AES-GCM key once per page load (PBKDF2 is expensive)
    let _keyPromise = null;
    function getKey() {
        if (!_keyPromise) {
            const encoder = new TextEncoder();
            _keyPromise = crypto.subtle.importKey(
                "raw",
                encoder.encode("TuAutoLogin-KeyMaterial-2024"),
                { name: "PBKDF2" },
                false,
                ["deriveBits", "deriveKey"]
            ).then(keyMaterial => crypto.subtle.deriveKey(
                {
                    name: "PBKDF2",
                    salt: encoder.encode("TuAutoLogin-Salt"),
                    iterations: 100000,
                    hash: "SHA-256",
                },
                keyMaterial,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            ));
        }
        return _keyPromise;
    }

    async function encryptText(text) {
        const key = await getKey();
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
        return btoa(JSON.stringify({ iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) }));
    }

    async function decryptText(encryptedData) {
        try {
            const key = await getKey();
            const { iv, ciphertext } = JSON.parse(atob(encryptedData));
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: new Uint8Array(iv) },
                key,
                new Uint8Array(ciphertext)
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            return encryptedData; // fallback for plaintext values
        }
    }

    // TOTP (RFC 6238 / RFC 4226)
    function base32Decode(base32) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        const clean = base32.toUpperCase().replace(/[\s=]/g, "");
        let bits = 0, value = 0;
        const output = [];
        for (const char of clean) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            value = (value << 5) | idx;
            bits += 5;
            if (bits >= 8) {
                output.push((value >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return new Uint8Array(output);
    }

    async function generateTOTP(secret) {
        const keyBytes = base32Decode(secret);
        const timeStep = Math.floor(Date.now() / 1000 / 30);

        const timeBuffer = new ArrayBuffer(8);
        new DataView(timeBuffer).setUint32(4, timeStep, false);

        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyBytes,
            { name: "HMAC", hash: "SHA-1" },
            false,
            ["sign"]
        );
        const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, timeBuffer));

        const offset = sig[19] & 0xf;
        const code = (
            ((sig[offset]     & 0x7f) << 24) |
            ((sig[offset + 1] & 0xff) << 16) |
            ((sig[offset + 2] & 0xff) << 8)  |
             (sig[offset + 3] & 0xff)
        ) % 1_000_000;

        return code.toString().padStart(6, "0");
    }

    async function getStoredTotpSecret() {
        const encrypted = GM_getValue(STORAGE_KEYS.totpSecret, "");
        return encrypted ? decryptText(encrypted) : "";
    }

    async function saveTotpSecret(secret) {
        GM_setValue(STORAGE_KEYS.totpSecret, secret ? await encryptText(secret) : "");
    }

    function getSecurityMode() {
        return GM_getValue(STORAGE_KEYS.securityMode, "");
    }

    function setSecurityMode(mode) {
        GM_setValue(STORAGE_KEYS.securityMode, mode);
    }

    async function getStoredCredentials() {
        if (getSecurityMode() !== "convenient") return { username: "", password: "" };
        const username = GM_getValue(STORAGE_KEYS.username, "");
        const encryptedPassword = GM_getValue(STORAGE_KEYS.password, "");
        const password = encryptedPassword ? await decryptText(encryptedPassword) : "";
        return { username, password };
    }

    async function ensureCredentials() {
        if (!getSecurityMode()) {
            const choice = window.confirm(
                "TuAutoLogin Security Choice\n\n" +
                "OK = CONVENIENT MODE\n" +
                "   Stores credentials in browser — fast automatic login\n\n" +
                "CANCEL = SECURE MODE\n" +
                "   No credentials stored — enter password each time"
            );
            setSecurityMode(choice ? "convenient" : "secure");
            if (!choice) return { username: "", password: "" };
        }

        if (getSecurityMode() === "secure") return { username: "", password: "" };

        let { username, password } = await getStoredCredentials();

        if (!username) {
            username = window.prompt("Enter TU Wien username");
            if (!username) return { username: "", password: "" };
        }
        if (!password) {
            password = window.prompt("Enter TU Wien password");
            if (!password) return { username: "", password: "" };
        }

        GM_setValue(STORAGE_KEYS.username, username);
        GM_setValue(STORAGE_KEYS.password, await encryptText(password));

        return { username, password };
    }

    function registerMenu() {
        const currentMode = getSecurityMode();
        const hasCredentials = GM_getValue(STORAGE_KEYS.username, "") || GM_getValue(STORAGE_KEYS.password, "");
        const hasTotpSecret = !!GM_getValue(STORAGE_KEYS.totpSecret, "");

        GM_registerMenuCommand("Set TU credentials", async () => {
            const u = window.prompt("TU Wien username", GM_getValue(STORAGE_KEYS.username, ""));
            if (typeof u === "string") GM_setValue(STORAGE_KEYS.username, u);

            const currentPassword = GM_getValue(STORAGE_KEYS.password, "")
                ? await decryptText(GM_getValue(STORAGE_KEYS.password, ""))
                : "";
            const p = window.prompt("TU Wien password", currentPassword);
            if (typeof p === "string") GM_setValue(STORAGE_KEYS.password, await encryptText(p));

            alert("Saved.");
        });

        if (hasCredentials) {
            GM_registerMenuCommand("Clear TU credentials", () => {
                GM_setValue(STORAGE_KEYS.username, "");
                GM_setValue(STORAGE_KEYS.password, "");
                alert("Cleared.");
            });
        }

        GM_registerMenuCommand(hasTotpSecret ? "Update TOTP secret" : "Set TOTP secret", async () => {
            const current = hasTotpSecret ? await getStoredTotpSecret() : "";
            const secret = window.prompt("TOTP secret (base32, from authenticator app setup):", current);
            if (secret === null) return;
            await saveTotpSecret(secret.trim());
            alert(secret.trim() ? "TOTP secret saved." : "TOTP secret cleared.");
        });

        if (hasTotpSecret) {
            GM_registerMenuCommand("Clear TOTP secret", async () => {
                await saveTotpSecret("");
                alert("TOTP secret cleared.");
            });
            GM_registerMenuCommand("Test TOTP (show current code)", async () => {
                try {
                    const code = await generateTOTP(await getStoredTotpSecret());
                    alert(`Current TOTP code: ${code}\n(valid for up to 30 seconds)`);
                } catch {
                    alert("Failed to generate TOTP code. Check that your secret is correct.");
                }
            });
        }

        if (currentMode === "convenient") {
            GM_registerMenuCommand("Switch to Secure Mode", () => {
                setSecurityMode("secure");
                GM_setValue(STORAGE_KEYS.username, "");
                GM_setValue(STORAGE_KEYS.password, "");
                alert("Switched to Secure Mode. Stored credentials have been cleared.");
            });
        } else if (currentMode === "secure") {
            GM_registerMenuCommand("Switch to Convenient Mode", () => {
                setSecurityMode("convenient");
                alert("Switched to Convenient Mode. Credentials will be stored in browser.");
            });
        }
    }

    function waitForSelector(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { obs.disconnect(); resolve(el); }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            if (timeoutMs > 0) {
                setTimeout(() => { obs.disconnect(); reject(new Error("Timeout: " + selector)); }, timeoutMs);
            }
        });
    }

    function submitForm() {
        const btn = document.querySelector("#samlloginbutton");
        if (btn) btn.click();
        else document.querySelector("form#f")?.submit();
    }

    function onTUWEL() {
        document.querySelector(".eupopup-buttons .eupopup-button_1")?.click();
        document.querySelector('a.login-identityprovider-btn[href*="auth/saml2/login.php"]')?.click();
    }

    function onTISS() {
        document.querySelector('a.toolLogin[href="/admin/authentifizierung"]')?.click();
    }

    async function onIdPLogin() {
        const userInput = await waitForSelector("#username").catch(() => null);
        const passInput = document.querySelector("#password");
        if (!userInput || !passInput) return;

        const totpInput = document.querySelector("#totp");

        if (getSecurityMode() === "convenient") {
            const storedUsername = GM_getValue(STORAGE_KEYS.username, "");
            const storedPassword = GM_getValue(STORAGE_KEYS.password, "");

            if (storedUsername && storedPassword) {
                createLoadingScreen();
                userInput.value = storedUsername;
                passInput.value = await decryptText(storedPassword);

                if (totpInput) {
                    const secret = await getStoredTotpSecret();
                    if (secret) {
                        totpInput.value = await generateTOTP(secret);
                    } else {
                        document.getElementById("tuautologin-loading")?.remove();
                        document.body.style.overflow = "";
                        totpInput.focus();
                        return;
                    }
                }

                submitForm();
                return;
            }
        }

        const creds = await ensureCredentials();
        if (creds.username && creds.password) {
            userInput.value = creds.username;
            passInput.value = creds.password;

            if (totpInput) {
                const secret = await getStoredTotpSecret();
                if (secret) {
                    totpInput.value = await generateTOTP(secret);
                } else {
                    totpInput.focus();
                    return;
                }
            }

            submitForm();
            return;
        }

        // Secure mode: auto-submit once all fields are filled by the user
        if (!hasTriedAutoSubmit) {
            hasTriedAutoSubmit = true;
            const handle = () => {
                setTimeout(tryAutoSubmit, 200);
                document.removeEventListener("click", handle);
                document.removeEventListener("keydown", handle);
                document.removeEventListener("keyup", handle);
            };
            document.addEventListener("click", handle);
            document.addEventListener("keydown", handle);
            document.addEventListener("keyup", handle);
        }
    }

    function tryAutoSubmit() {
        const userInput = document.querySelector("#username");
        const passInput = document.querySelector("#password");
        const totpInput = document.querySelector("#totp");
        if (!userInput?.value || !passInput?.value) return;
        if (totpInput && !totpInput.value) return;
        submitForm();
    }

    async function onIdPBadQuality() {
        createLoadingScreen("Updating password security...");
        const form = document.querySelector('body#tupwquality\\:badQuality form[name="f"]');
        if (!form) return;
        (form.querySelector('button[type="submit"], .btn[type="submit"]') ?? form).click?.() ?? form.submit();
    }

    function createLoadingScreen(message = "Signing in...") {
        document.body.style.overflow = "hidden";

        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const fg = dark ? "#ffffff" : "#000000";
        const bg = dark ? "#000000" : "#ffffff";

        const style = document.createElement("style");
        style.textContent = `@keyframes tulogin-spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);

        const overlay = document.createElement("div");
        overlay.id = "tuautologin-loading";
        overlay.style.cssText = `
            position:fixed;inset:0;background:${bg};display:flex;flex-direction:column;
            justify-content:center;align-items:center;z-index:999999;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        `;

        const spinner = document.createElement("div");
        spinner.style.cssText = `
            width:32px;height:32px;border-radius:50%;margin:0 auto 24px;
            border:2px solid ${fg}1a;border-top-color:${fg};
            animation:tulogin-spin 0.8s linear infinite;
        `;

        const msg = document.createElement("div");
        msg.textContent = message;
        msg.style.cssText = `font-size:17px;font-weight:600;letter-spacing:-0.2px;color:${fg};margin-bottom:8px;`;

        const sub = document.createElement("div");
        sub.textContent = "Please wait...";
        sub.style.cssText = `font-size:15px;opacity:0.6;color:${fg};`;

        overlay.append(spinner, msg, sub);
        document.body.appendChild(overlay);
    }

    function route() {
        const href = location.href;
        if (href.startsWith("https://tuwel.tuwien.ac.at/")) {
            if (href.includes("/login/index.php")) onTUWEL();
            return;
        }
        if (href.startsWith("https://tiss.tuwien.ac.at/")) return onTISS();
        if (href.startsWith("https://idp.zid.tuwien.ac.at/simplesaml/module.php/core/loginuserpass")) return onIdPLogin();
        if (href.startsWith("https://idp.zid.tuwien.ac.at/simplesaml/module.php/tupwquality/badquality")) return onIdPBadQuality();
    }

    registerMenu();
    route();
})();
