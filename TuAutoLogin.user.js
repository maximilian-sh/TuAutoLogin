// ==UserScript==
// @name         TuAutoLogin
// @namespace    https://tuwien.ac.at/
// @version      1.0.0
// @description  Auto-login helper for TUWEL/TISS via TU Wien IdP. Stores creds in Tampermonkey. Prompts if missing.
// @author       Maximilian Kallina
// @match        https://tuwel.tuwien.ac.at/login/index.php*
// @match        https://tiss.tuwien.ac.at/*
// @match        https://idp.zid.tuwien.ac.at/simplesaml/module.php/core/loginuserpass*
// @match        https://idp.zid.tuwien.ac.at/simplesaml/module.php/tupwquality/badquality*
// @icon         https://tuwel.tuwien.ac.at/pluginfile.php/2/theme_boost_union/favicon/64x64/1759205872/tuwel_favicon.png
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

    function getStoredCredentials() {
        const username = GM_getValue(STORAGE_KEYS.username, "");
        const password = GM_getValue(STORAGE_KEYS.password, "");
        return { username, password };
    }

    async function ensureCredentials() {
        let { username, password } = getStoredCredentials();
        if (!username) {
            username = window.prompt("Enter TU Wien username");
            if (username) GM_setValue(STORAGE_KEYS.username, username);
        }
        if (!password) {
            password = window.prompt("Enter TU Wien password");
            if (password) GM_setValue(STORAGE_KEYS.password, password);
        }
        return { username: GM_getValue(STORAGE_KEYS.username, ""), password: GM_getValue(STORAGE_KEYS.password, "") };
    }

    function registerMenu() {
        GM_registerMenuCommand("Set TU credentials", async () => {
            const u = window.prompt("Set TU Wien username", GM_getValue(STORAGE_KEYS.username, ""));
            if (typeof u === "string") GM_setValue(STORAGE_KEYS.username, u);
            const p = window.prompt("Set TU Wien password", GM_getValue(STORAGE_KEYS.password, ""));
            if (typeof p === "string") GM_setValue(STORAGE_KEYS.password, p);
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

    registerMenu();
    route();
})();
