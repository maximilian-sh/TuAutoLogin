// ==UserScript==
// @name         TuAutoLogin
// @namespace    https://tuwien.ac.at/
// @version      1.7.0
// @description  Auto-login helper for TUWEL/TISS via TU Wien IdP. Stores credentials encrypted in the browser, with optional TOTP auto-fill for MFA.
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
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";

    const STORAGE_KEYS = {
        username: "TuAutoLogin.username",
        password: "TuAutoLogin.password",
        totpSecret: "TuAutoLogin.totpSecret",
    };

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

    // Returns stored credentials, prompting for (and saving) any that are missing
    async function ensureCredentials() {
        let username = GM_getValue(STORAGE_KEYS.username, "");
        const encryptedPassword = GM_getValue(STORAGE_KEYS.password, "");
        let password = encryptedPassword ? await decryptText(encryptedPassword) : "";
        if (username && password) return { username, password };

        username ||= window.prompt("Enter TU Wien username") || "";
        if (!username) return { username: "", password: "" };
        password ||= window.prompt("Enter TU Wien password") || "";
        if (!password) return { username: "", password: "" };

        GM_setValue(STORAGE_KEYS.username, username);
        GM_setValue(STORAGE_KEYS.password, await encryptText(password));
        return { username, password };
    }

    function registerMenu() {
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
    }

    // Resolves as soon as the element is parsed (we run at document-start, so this beats
    // DOMContentLoaded, which waits for the page's deferred scripts). Resolves null if the
    // element is still missing once the DOM is complete.
    function waitForElement(selector) {
        return new Promise(resolve => {
            const existing = document.querySelector(selector);
            if (existing || document.readyState !== "loading") return resolve(existing);
            const done = el => {
                obs.disconnect();
                document.removeEventListener("DOMContentLoaded", onReady);
                resolve(el);
            };
            const onReady = () => done(document.querySelector(selector));
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) done(el);
            });
            obs.observe(document, { childList: true, subtree: true });
            document.addEventListener("DOMContentLoaded", onReady);
        });
    }

    // If the IdP shows the login form again shortly after our submit, the login failed
    // (wrong password / rejected TOTP / IdP hiccup). Retry a few times, then stop so we
    // don't loop and risk an account lock.
    const SUBMIT_GUARD_KEY = "TuAutoLogin.lastSubmit";
    const SUBMIT_GUARD_MS = 60000; // covers a retry waiting up to 30s for a fresh TOTP code
    const MAX_RETRIES = 2;

    function getSubmitState() {
        try {
            const state = JSON.parse(sessionStorage.getItem(SUBMIT_GUARD_KEY) || "{}");
            if (Date.now() - (state.at || 0) < SUBMIT_GUARD_MS) return state;
        } catch {}
        return { count: 0 };
    }

    // TOTP codes are single-use, so retrying within the same 30s step would be rejected again
    async function generateFreshTOTP(secret) {
        const { totpStep } = getSubmitState();
        if (totpStep !== undefined) {
            const msUntilNext = (totpStep + 1) * 30000 - Date.now();
            if (msUntilNext > 0) await new Promise(r => setTimeout(r, msUntilNext + 500));
        }
        return generateTOTP(secret);
    }

    function submitForm() {
        try {
            sessionStorage.setItem(SUBMIT_GUARD_KEY, JSON.stringify({
                at: Date.now(),
                count: getSubmitState().count + 1,
                totpStep: Math.floor(Date.now() / 30000),
            }));
        } catch {}
        const btn = document.querySelector("#samlloginbutton");
        if (btn) btn.click();
        else document.querySelector("form#f")?.submit();
    }

    async function onTUWEL() {
        const btn = await waitForElement('a.login-identityprovider-btn[href*="auth/saml2/login.php"]');
        if (btn) location.replace(btn.href);
    }

    async function onTISS() {
        const link = await waitForElement('a.toolLogin[href="/admin/authentifizierung"]');
        if (link) location.replace(link.href);
    }

    async function onIdPLogin() {
        // The submit button comes after all inputs, so once it's parsed the form is complete
        await waitForElement("#samlloginbutton");
        const userInput = document.querySelector("#username");
        const passInput = document.querySelector("#password");
        if (!userInput || !passInput) return;

        const totpInput = document.querySelector("#totp");

        const attempts = getSubmitState().count;
        if (attempts > MAX_RETRIES) {
            console.warn(`[TuAutoLogin] Login failed ${attempts} times, not retrying.`);
            userInput.value ||= GM_getValue(STORAGE_KEYS.username, "");
            passInput.focus();
            return;
        }
        if (attempts) console.warn(`[TuAutoLogin] Login failed, retrying (${attempts}/${MAX_RETRIES}).`);

        const { username, password } = await ensureCredentials();
        if (!username || !password) return;
        userInput.value = username;
        passInput.value = password;

        const secret = totpInput ? await getStoredTotpSecret() : "";
        if (totpInput && !secret) {
            // No stored secret: let the user type the code and submit once it's complete
            totpInput.focus();
            totpInput.addEventListener("input", () => {
                if (/^\d{6}$/.test(totpInput.value.trim())) submitForm();
            });
            return;
        }

        createLoadingScreen(attempts ? "Retrying sign-in..." : undefined);
        if (totpInput) totpInput.value = await generateFreshTOTP(secret);
        submitForm();
    }

    async function onIdPBadQuality() {
        await waitForElement("body");
        createLoadingScreen("Updating password security...");
        await new Promise(r => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", r) : r());
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
