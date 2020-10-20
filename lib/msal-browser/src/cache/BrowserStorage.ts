/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Constants, PersistentCacheKeys, StringUtils, AuthorizationCodeRequest, ICrypto, CacheSchemaType, AccountEntity, IdTokenEntity, CredentialType, AccessTokenEntity, RefreshTokenEntity, AppMetadataEntity, CacheManager, CredentialEntity, ServerTelemetryEntity, ThrottlingEntity, ProtocolUtils } from "msal-common-ext";
import { CacheOptions } from "../config/Configuration";
import { CryptoOps } from "../crypto/CryptoOps";
import { BrowserAuthError } from "../error/BrowserAuthError";
import { BrowserConfigurationAuthError } from "../error/BrowserConfigurationAuthError";
import { BrowserConstants, TemporaryCacheKeys } from "../utils/BrowserConstants";

// Cookie life calculation (hours * minutes * seconds * ms)
const COOKIE_LIFE_MULTIPLIER = 24 * 60 * 60 * 1000;

/**
 * This class implements the cache storage interface for MSAL through browser local or session storage.
 * Cookies are only used if storeAuthStateInCookie is true, and are only used for
 * parameters such as state and nonce, generally.
 */
export class BrowserStorage extends CacheManager {

    // Cache configuration, either set by user or default values.
    private cacheConfig: CacheOptions;
    // Window storage object (either local or sessionStorage)
    private windowStorage: Storage;
    // Client id of application. Used in cache keys to partition cache correctly in the case of multiple instances of MSAL.
    private clientId: string;
    private cryptoImpl: CryptoOps;

    constructor(clientId: string, cacheConfig: CacheOptions, cryptoImpl: CryptoOps) {
        super();
        // Validate cache location
        this.validateWindowStorage(cacheConfig.cacheLocation);

        this.cacheConfig = cacheConfig;
        this.windowStorage = window[this.cacheConfig.cacheLocation];
        this.clientId = clientId;
        this.cryptoImpl = cryptoImpl;

        // Migrate any cache entries from older versions of MSAL.
        this.migrateCacheEntries();
    }

    /**
     * Validates the the given cache location string is an expected value:
     * - localStorage
     * - sessionStorage (default)
     * Also validates if given cacheLocation is supported on the browser.
     * @param cacheLocation
     */
    private validateWindowStorage(cacheLocation: string): void {
        if (cacheLocation !== BrowserConstants.CACHE_LOCATION_LOCAL && cacheLocation !== BrowserConstants.CACHE_LOCATION_SESSION) {
            throw BrowserConfigurationAuthError.createStorageNotSupportedError(cacheLocation);
        }

        const storageSupported = !!window[cacheLocation];
        if (!storageSupported) {
            throw BrowserConfigurationAuthError.createStorageNotSupportedError(cacheLocation);
        }
    }

    /**
     * Migrate all old cache entries to new schema. No rollback supported.
     * @param storeAuthStateInCookie
     */
    private migrateCacheEntries(): void {
        const idTokenKey = `${Constants.CACHE_PREFIX}.${PersistentCacheKeys.ID_TOKEN}`;
        const clientInfoKey = `${Constants.CACHE_PREFIX}.${PersistentCacheKeys.CLIENT_INFO}`;
        const errorKey = `${Constants.CACHE_PREFIX}.${PersistentCacheKeys.ERROR}`;
        const errorDescKey = `${Constants.CACHE_PREFIX}.${PersistentCacheKeys.ERROR_DESC}`;

        const idTokenValue = this.windowStorage.getItem(idTokenKey);
        const clientInfoValue = this.windowStorage.getItem(clientInfoKey);
        const errorValue = this.windowStorage.getItem(errorKey);
        const errorDescValue = this.windowStorage.getItem(errorDescKey);

        const values = [idTokenValue, clientInfoValue, errorValue, errorDescValue];
        const keysToMigrate = [PersistentCacheKeys.ID_TOKEN, PersistentCacheKeys.CLIENT_INFO, PersistentCacheKeys.ERROR, PersistentCacheKeys.ERROR_DESC];

        keysToMigrate.forEach((cacheKey, index) => this.migrateCacheEntry(cacheKey, values[index]));
    }

    /**
     * Utility function to help with migration.
     * @param newKey
     * @param value
     * @param storeAuthStateInCookie
     */
    private migrateCacheEntry(newKey: string, value: string): void {
        if (value) {
            this.setItem(this.generateCacheKey(newKey), value, CacheSchemaType.TEMPORARY);
        }
    }

    /**
     * Parses key as JSON object, JSON.parse() will throw an error.
     * @param key
     */
    private validateObjectKey(key: string): void {
        JSON.parse(key);
    }

    /**
     * Sets the cache item with the key and value given.
     * Stores in cookie if storeAuthStateInCookie is set to true.
     * This can cause cookie overflow if used incorrectly.
     * @param key
     * @param value
     */
    setItem(key: string, value: string | object, type: string): void {
        // save the cacheItem
        switch (type) {
            case CacheSchemaType.ACCOUNT:
            case CacheSchemaType.CREDENTIAL:
            case CacheSchemaType.APP_METADATA:
            case CacheSchemaType.THROTTLING:
                this.windowStorage.setItem(key, JSON.stringify(value));
                break;
            case CacheSchemaType.TEMPORARY: {
                const stringVal = value as string;
                this.windowStorage.setItem(key, stringVal);
                if (this.cacheConfig.storeAuthStateInCookie) {
                    this.setItemCookie(key, stringVal);
                }
                break;
            }
            case CacheSchemaType.TELEMETRY: {
                this.windowStorage.setItem(key, JSON.stringify(value));
                break;
            }
            default: {
                throw BrowserAuthError.createInvalidCacheTypeError();
            }
        }
    }

    /**
     * Gets cache item with given key.
     * Will retrieve frm cookies if storeAuthStateInCookie is set to true.
     * @param key
     */
    getItem(key: string, type: string): string | object {
        const value = this.windowStorage.getItem(key);
        if (StringUtils.isEmpty(value)) {
            return null;
        }
        switch (type) {
            case CacheSchemaType.ACCOUNT: {
                const account = new AccountEntity();
                return (CacheManager.toObject(account, JSON.parse(value)) as AccountEntity);
            }
            case CacheSchemaType.CREDENTIAL: {
                const credentialType = CredentialEntity.getCredentialType(key);
                switch (credentialType) {
                    case CredentialType.ID_TOKEN: {
                        const idTokenEntity: IdTokenEntity = new IdTokenEntity();
                        return (CacheManager.toObject(idTokenEntity, JSON.parse(value)) as IdTokenEntity);
                    }
                    case CredentialType.ACCESS_TOKEN: {
                        const accessTokenEntity: AccessTokenEntity = new AccessTokenEntity();
                        return (CacheManager.toObject(accessTokenEntity, JSON.parse(value)) as AccessTokenEntity);
                    }
                    case CredentialType.REFRESH_TOKEN: {
                        const refreshTokenEntity: RefreshTokenEntity = new RefreshTokenEntity();
                        return (CacheManager.toObject(refreshTokenEntity, JSON.parse(value)) as RefreshTokenEntity);
                    }
                }
            }
            case CacheSchemaType.APP_METADATA: {
                return (JSON.parse(value) as AppMetadataEntity);
            }
            case CacheSchemaType.THROTTLING: {
                return (JSON.parse(value) as ThrottlingEntity);
            }
            case CacheSchemaType.TEMPORARY: {
                const itemCookie = this.getItemCookie(key);
                if (this.cacheConfig.storeAuthStateInCookie) {
                    return itemCookie;
                }
                return value;
            }
            case CacheSchemaType.TELEMETRY: {
                const serverTelemetryEntity: ServerTelemetryEntity = new ServerTelemetryEntity();
                return (CacheManager.toObject(serverTelemetryEntity, JSON.parse(value)) as ServerTelemetryEntity);
            }
            default: {
                throw BrowserAuthError.createInvalidCacheTypeError();
            }
        }
    }

    /**
     * Removes the cache item with the given key.
     * Will also clear the cookie item if storeAuthStateInCookie is set to true.
     * @param key
     */
    removeItem(key: string): boolean {
        this.windowStorage.removeItem(key);
        if (this.cacheConfig.storeAuthStateInCookie) {
            this.clearItemCookie(key);
        }
        return true;
    }

    /**
     * Checks whether key is in cache.
     * @param key
     */
    containsKey(key: string): boolean {
        return this.windowStorage.hasOwnProperty(key);
    }

    /**
     * Gets all keys in window.
     */
    getKeys(): string[] {
        return Object.keys(this.windowStorage);
    }

    /**
     * Clears all cache entries created by MSAL (except tokens).
     */
    clear(): void {
        this.removeAllAccounts();
        this.removeAppMetadata();
        let key: string;
        for (key in this.windowStorage) {
            // Check if key contains msal prefix; For now, we are clearing all the cache items created by MSAL.js
            if (this.windowStorage.hasOwnProperty(key) && ((key.indexOf(Constants.CACHE_PREFIX) !== -1) || (key.indexOf(this.clientId) !== -1))) {
                this.removeItem(key);
            }
        }
    }

    /**
     * Add value to cookies
     * @param cookieName
     * @param cookieValue
     * @param expires
     */
    setItemCookie(cookieName: string, cookieValue: string, expires?: number): void {
        let cookieStr = `${encodeURIComponent(cookieName)}=${encodeURIComponent(cookieValue)};path=/;`;
        if (expires) {
            const expireTime = this.getCookieExpirationTime(expires);
            cookieStr += `expires=${expireTime};`;
        }

        document.cookie = cookieStr;
    }

    /**
     * Get one item by key from cookies
     * @param cookieName
     */
    getItemCookie(cookieName: string): string {
        const name = `${encodeURIComponent(cookieName)}=`;
        const cookieList = document.cookie.split(";");
        for (let i = 0; i < cookieList.length; i++) {
            let cookie = cookieList[i];
            while (cookie.charAt(0) === " ") {
                cookie = cookie.substring(1);
            }
            if (cookie.indexOf(name) === 0) {
                return decodeURIComponent(cookie.substring(name.length, cookie.length));
            }
        }
        return "";
    }

    /**
     * Clear an item in the cookies by key
     * @param cookieName
     */
    clearItemCookie(cookieName: string): void {
        this.setItemCookie(cookieName, "", -1);
    }

    /**
     * Clear all msal cookies
     */
    clearMsalCookie(stateString?: string): void {
        const nonceKey = stateString ? this.generateNonceKey(stateString) : this.generateStateKey(TemporaryCacheKeys.NONCE_IDTOKEN);
        this.clearItemCookie(this.generateStateKey(stateString));
        this.clearItemCookie(nonceKey);
        this.clearItemCookie(this.generateCacheKey(TemporaryCacheKeys.ORIGIN_URI));
    }

    /**
     * Get cookie expiration time
     * @param cookieLifeDays
     */
    getCookieExpirationTime(cookieLifeDays: number): string {
        const today = new Date();
        const expr = new Date(today.getTime() + cookieLifeDays * COOKIE_LIFE_MULTIPLIER);
        return expr.toUTCString();
    }

    /**
     * Gets the cache object referenced by the browser
     */
    getCache(): object {
        return this.windowStorage;
    }

    /**
     * interface compat, we cannot overwrite browser cache; Functionality is supported by individual entities in browser
     */
    setCache(): void {
        // sets nothing
    }

    /**
     * Prepend msal.<client-id> to each key; Skip for any JSON object as Key (defined schemas do not need the key appended: AccessToken Keys or the upcoming schema)
     * @param key
     * @param addInstanceId
     */
    generateCacheKey(key: string): string {
        try {
            // Defined schemas do not need the key migrated
            this.validateObjectKey(key);
            return key;
        } catch (e) {
            if (StringUtils.startsWith(key, Constants.CACHE_PREFIX) || StringUtils.startsWith(key, PersistentCacheKeys.ADAL_ID_TOKEN)) {
                return key;
            }
            return `${Constants.CACHE_PREFIX}.${this.clientId}.${key}`;
        }
    }

    /**
     * Create authorityKey to cache authority
     * @param state
     */
    generateAuthorityKey(stateString: string): string {
        const {
            libraryState: {
                id: stateId
            }
        } = ProtocolUtils.parseRequestState(this.cryptoImpl, stateString);

        return this.generateCacheKey(`${TemporaryCacheKeys.AUTHORITY}.${stateId}`);
    }

    /**
     * Create Nonce key to cache nonce
     * @param state
     */
    generateNonceKey(stateString: string): string {
        const {
            libraryState: {
                id: stateId
            }
        } = ProtocolUtils.parseRequestState(this.cryptoImpl, stateString);

        return this.generateCacheKey(`${TemporaryCacheKeys.NONCE_IDTOKEN}.${stateId}`);
    }

    /**
     * Creates full cache key for the request state
     * @param stateString State string for the request
     */
    generateStateKey(stateString: string): string {
        // Use the library state id to key temp storage for uniqueness for multiple concurrent requests
        const {
            libraryState: {
                id: stateId
            }
        } = ProtocolUtils.parseRequestState(this.cryptoImpl, stateString);

        return this.generateCacheKey(`${TemporaryCacheKeys.REQUEST_STATE}.${stateId}`);
    }

    /**
     * Sets the cacheKey for and stores the authority information in cache
     * @param state
     * @param authority
     */
    setAuthorityCache(authority: string, state: string): void {
        // Cache authorityKey
        this.setItem(this.generateAuthorityKey(state), authority, CacheSchemaType.TEMPORARY);
    }

    /**
     * Gets the cached authority based on the cached state. Returns empty if no cached state found.
     */
    getCachedAuthority(cachedState: string): string {
        const state = this.getItem(this.generateStateKey(cachedState), CacheSchemaType.TEMPORARY) as string;
        if (!state) {
            return null;
        }
        return this.getItem(this.generateAuthorityKey(state), CacheSchemaType.TEMPORARY) as string;
    }

    /**
     * Updates account, authority, and state in cache
     * @param serverAuthenticationRequest
     * @param account
     */
    updateCacheEntries(state: string, nonce: string, authorityInstance: string): void {
        // Cache the request state
        this.setItem(this.generateStateKey(state), state, CacheSchemaType.TEMPORARY);

        // Cache the nonce
        this.setItem(this.generateNonceKey(state), nonce, CacheSchemaType.TEMPORARY);

        // Cache authorityKey
        this.setAuthorityCache(authorityInstance, state);
    }

    /**
     * Reset all temporary cache items
     * @param state
     */
    resetRequestCache(state: string): void {
        // check state and remove associated cache items
        this.getKeys().forEach(key => {
            if (!StringUtils.isEmpty(state) && key.indexOf(state) !== -1) {
                this.removeItem(key);
            }
        });

        // delete generic interactive request parameters
        if (state) {
            this.removeItem(this.generateStateKey(state));
            this.removeItem(this.generateNonceKey(state));
            this.removeItem(this.generateAuthorityKey(state));
        }
        this.removeItem(this.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS));
        this.removeItem(this.generateCacheKey(TemporaryCacheKeys.ORIGIN_URI));
        this.removeItem(this.generateCacheKey(TemporaryCacheKeys.URL_HASH));
    }

    cleanRequest(stateString?: string): void {
        // Interaction is completed - remove interaction status.
        this.removeItem(this.generateCacheKey(BrowserConstants.INTERACTION_STATUS_KEY));
        if (stateString) {
            const cachedState = this.getItem(this.generateStateKey(stateString), CacheSchemaType.TEMPORARY) as string;
            this.resetRequestCache(cachedState || "");
        }
    }

    cacheCodeRequest(authCodeRequest: AuthorizationCodeRequest, browserCrypto: ICrypto): void {
        this.setItem(this.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS), browserCrypto.base64Encode(JSON.stringify(authCodeRequest)), CacheSchemaType.TEMPORARY);
    }

    /**
     * Gets the token exchange parameters from the cache. Throws an error if nothing is found.
     */
    getCachedRequest(state: string, browserCrypto: ICrypto): AuthorizationCodeRequest {
        try {
            // Get token request from cache and parse as TokenExchangeParameters.
            const encodedTokenRequest = this.getItem(this.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS), CacheSchemaType.TEMPORARY) as string;
            const parsedRequest = JSON.parse(browserCrypto.base64Decode(encodedTokenRequest)) as AuthorizationCodeRequest;
            this.removeItem(this.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS));
            // Get cached authority and use if no authority is cached with request.
            if (StringUtils.isEmpty(parsedRequest.authority)) {
                const cachedAuthority: string = this.getItem(this.generateAuthorityKey(state), CacheSchemaType.TEMPORARY) as string;
                parsedRequest.authority = cachedAuthority;
            }
            return parsedRequest;
        } catch (err) {
            throw BrowserAuthError.createTokenRequestCacheError(err);
        }
    }
}
