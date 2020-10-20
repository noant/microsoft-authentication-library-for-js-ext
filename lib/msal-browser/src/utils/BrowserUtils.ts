/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { INetworkModule, UrlString } from "msal-common-ext";
import { FetchClient } from "../network/FetchClient";
import { XhrClient } from "../network/XhrClient";
import { BrowserAuthError } from "../error/BrowserAuthError";

/**
 * Utility class for browser specific functions
 */
export class BrowserUtils {

    // #region Window Navigation and URL management

    /**
     * Used to redirect the browser to the STS authorization endpoint
     * @param {string} urlNavigate - URL of the authorization endpoint
     * @param {boolean} noHistory - boolean flag, uses .replace() instead of .assign() if true
     */
    static navigateWindow(urlNavigate: string, noHistory?: boolean): void {
        if (noHistory) {
            window.location.replace(urlNavigate);
        } else {
            window.location.assign(urlNavigate);
        }
    }

    /**
     * Clears hash from window url.
     */
    static clearHash(): void {
        window.location.hash = "";
    }

    /**
     * Replaces current hash with hash from provided url
     */
    static replaceHash(url: string): void {
        const urlParts = url.split("#");
        urlParts.shift(); // Remove part before the hash
        
        window.location.hash = urlParts.length > 0 ? urlParts.join("#") : "";
    }

    /**
     * Returns boolean of whether the current window is in an iframe or not.
     */
    static isInIframe(): boolean {
        return window.parent !== window;
    }

    // #endregion

    /**
     * Returns current window URL as redirect uri
     */
    static getCurrentUri(): string {
        return window.location.href.split("?")[0].split("#")[0];
    }

    /**
     * Gets the homepage url for the current window location.
     */
    static getHomepage(): string {
        const currentUrl = new UrlString(window.location.href);
        const urlComponents = currentUrl.getUrlComponents();
        return `${urlComponents.Protocol}//${urlComponents.HostNameAndPort}/`;
    }

    /**
     * Returns best compatible network client object. 
     */
    static getBrowserNetworkClient(): INetworkModule {
        if (window.fetch) {
            return new FetchClient();
        } else {
            return new XhrClient();
        }
    }

    /**
     * Throws error if we have completed an auth and are 
     * attempting another auth request inside an iframe.
     */
    static blockReloadInHiddenIframes(): void {
        const isResponseHash = UrlString.hashContainsKnownProperties(window.location.hash);
        // return an error if called from the hidden iframe created by the msal js silent calls
        if (isResponseHash && BrowserUtils.isInIframe()) {
            throw BrowserAuthError.createBlockReloadInHiddenIframeError();
        }
    }

    /**
     * Throws error if token requests are made in non-browser environment
     * @param isBrowserEnvironment Flag indicating if environment is a browser.
     */
    static blockNonBrowserEnvironment(isBrowserEnvironment: boolean): void {
        if (!isBrowserEnvironment) {
            throw BrowserAuthError.createNonBrowserEnvironmentError();
        }
    }

    /**
     * Returns boolean of whether current browser is an Internet Explorer or Edge browser.
     */
    static detectIEOrEdge(): boolean {
        const ua = window.navigator.userAgent;
        const msie = ua.indexOf("MSIE ");
        const msie11 = ua.indexOf("Trident/");
        const msedge = ua.indexOf("Edge/");
        const isIE = msie > 0 || msie11 > 0;
        const isEdge = msedge > 0;
        return isIE || isEdge;
    }
}
