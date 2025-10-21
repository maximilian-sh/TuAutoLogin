// ==UserScript==
// @name         TuAutoLogin
// @namespace    https://tuwien.ac.at/
// @version      1.1.0
// @description  Auto-login helper for TUWEL/TISS via TU Wien IdP. Stores creds encrypted in Tampermonkey. Prompts if missing.
// @author       Maximilian Kallina
// @match        https://tuwel.tuwien.ac.at/login/index.php*
// @match        https://tiss.tuwien.ac.at/*
// @match        https://idp.zid.tuwien.ac.at/simplesaml/module.php/core/loginuserpass*
// @match        https://idp.zid.tuwien.ac.at/simplesaml/module.php/tupwquality/badquality*
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
    };

    // Encryption utilities
    async function deriveKey() {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode("TuAutoLogin-KeyMaterial-2024"),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return crypto.subtle.deriveKey(
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
        );
    }

    async function encryptText(text, key) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoder.encode(text));

        const result = {
            iv: Array.from(iv),
            ciphertext: Array.from(new Uint8Array(encrypted)),
        };

        return btoa(JSON.stringify(result));
    }

    async function decryptText(encryptedData, key) {
        try {
            const data = JSON.parse(atob(encryptedData));
            const iv = new Uint8Array(data.iv);
            const ciphertext = new Uint8Array(data.ciphertext);

            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            // If decryption fails, assume it's plaintext (migration case)
            return encryptedData;
        }
    }

    // Migration function to encrypt existing plaintext passwords
    async function migratePlaintextPassword() {
        const storedPassword = GM_getValue(STORAGE_KEYS.password, "");
        if (!storedPassword) return;

        // Check if password is already encrypted (contains JSON structure)
        try {
            JSON.parse(atob(storedPassword));
            // If we get here, it's already encrypted
            return;
        } catch (error) {
            // Not encrypted, proceed with migration
        }

        try {
            const key = await deriveKey();
            const encryptedPassword = await encryptText(storedPassword, key);
            GM_setValue(STORAGE_KEYS.password, encryptedPassword);
            console.log("TuAutoLogin: Migrated plaintext password to encrypted storage");
        } catch (error) {
            console.error("TuAutoLogin: Failed to migrate password to encrypted storage:", error);
        }
    }

    async function getStoredCredentials() {
        const username = GM_getValue(STORAGE_KEYS.username, "");
        const encryptedPassword = GM_getValue(STORAGE_KEYS.password, "");

        let password = "";
        if (encryptedPassword) {
            try {
                const key = await deriveKey();
                password = await decryptText(encryptedPassword, key);
            } catch (error) {
                console.warn("Failed to decrypt password, treating as plaintext:", error);
                password = encryptedPassword; // Fallback for migration
            }
        }

        return { username, password };
    }

    async function ensureCredentials() {
        let { username, password } = await getStoredCredentials();
        if (!username) {
            username = window.prompt("Enter TU Wien username");
            if (username) GM_setValue(STORAGE_KEYS.username, username);
        }
        if (!password) {
            password = window.prompt("Enter TU Wien password");
            if (password) {
                try {
                    const key = await deriveKey();
                    const encryptedPassword = await encryptText(password, key);
                    GM_setValue(STORAGE_KEYS.password, encryptedPassword);
                } catch (error) {
                    console.error("Failed to encrypt password:", error);
                    // Fallback to plaintext storage if encryption fails
                    GM_setValue(STORAGE_KEYS.password, password);
                }
            }
        }
        return await getStoredCredentials();
    }

    function registerMenu() {
        GM_registerMenuCommand("Set TU credentials", async () => {
            const u = window.prompt("Set TU Wien username", GM_getValue(STORAGE_KEYS.username, ""));
            if (typeof u === "string") GM_setValue(STORAGE_KEYS.username, u);

            // Get current password for display (decrypt if needed)
            let currentPassword = "";
            const storedPassword = GM_getValue(STORAGE_KEYS.password, "");
            if (storedPassword) {
                try {
                    const key = await deriveKey();
                    currentPassword = await decryptText(storedPassword, key);
                } catch (error) {
                    currentPassword = storedPassword; // Fallback for plaintext
                }
            }

            const p = window.prompt("Set TU Wien password", currentPassword);
            if (typeof p === "string") {
                try {
                    const key = await deriveKey();
                    const encryptedPassword = await encryptText(p, key);
                    GM_setValue(STORAGE_KEYS.password, encryptedPassword);
                } catch (error) {
                    console.error("Failed to encrypt password:", error);
                    GM_setValue(STORAGE_KEYS.password, p); // Fallback to plaintext
                }
            }
            alert("Saved.");
        });
        GM_registerMenuCommand("Clear TU credentials", () => {
            GM_setValue(STORAGE_KEYS.username, "");
            GM_setValue(STORAGE_KEYS.password, "");
            alert("Cleared.");
        });
    }

    function waitForSelector(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            if (timeoutMs > 0) {
                setTimeout(() => {
                    obs.disconnect();
                    reject(new Error("Timeout waiting for " + selector));
                }, timeoutMs);
            }
        });
    }

    async function onTUWEL() {
        const cookieContinue = document.querySelector(".eupopup-buttons .eupopup-button_1");
        if (cookieContinue) {
            cookieContinue.click();
        }
        const link = document.querySelector('a.login-identityprovider-btn[href*="auth/saml2/login.php"]');
        if (link) link.click();
    }

    async function onTISS() {
        const loginLink = document.querySelector('a.toolLogin[href="/admin/authentifizierung"]');
        if (loginLink) loginLink.click();
    }

    async function onIdPLogin() {
        const creds = await ensureCredentials();
        if (!creds.username || !creds.password) return;
        const userInput = await waitForSelector("#username").catch(() => null);
        const passInput = document.querySelector("#password");
        if (!userInput || !passInput) return;
        userInput.value = creds.username;
        passInput.value = creds.password;
        const submitBtn = document.querySelector("#samlloginbutton");
        if (submitBtn) submitBtn.click();
        else {
            const form = document.querySelector("form#f");
            if (form) form.submit();
        }
    }

    async function onIdPBadQuality() {
        // Auto-continue on password quality warning page if shown
        const form = document.querySelector('body#tupwquality\\:badQuality form[name="f"]');
        if (!form) return;
        const button = form.querySelector('button[type="submit"], .btn[type="submit"]');
        if (button) button.click();
        else form.submit();
    }

    function route() {
        const href = location.href;
        if (href.startsWith("https://tuwel.tuwien.ac.at/login/index.php")) return onTUWEL();
        if (href.startsWith("https://tiss.tuwien.ac.at/")) return onTISS();
        if (href.startsWith("https://idp.zid.tuwien.ac.at/simplesaml/module.php/core/loginuserpass")) return onIdPLogin();
        if (href.startsWith("https://idp.zid.tuwien.ac.at/simplesaml/module.php/tupwquality/badquality")) return onIdPBadQuality();
    }

    // Initialize and migrate if needed
    (async () => {
        await migratePlaintextPassword();
        registerMenu();
        route();
    })();
})();
