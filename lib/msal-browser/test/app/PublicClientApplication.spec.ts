import "mocha";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const expect = chai.expect;
import sinon from "sinon";
import { PublicClientApplication } from "../../src/app/PublicClientApplication";
import { TEST_CONFIG, TEST_URIS, TEST_HASHES, TEST_TOKENS, TEST_DATA_CLIENT_INFO, TEST_TOKEN_LIFETIMES, RANDOM_TEST_GUID, DEFAULT_OPENID_CONFIG_RESPONSE, testNavUrl, testLogoutUrl, TEST_STATE_VALUES, testNavUrlNoRequest } from "../utils/StringConstants";
import { ServerError, Constants, AccountInfo, TokenClaims, PromptValue, AuthenticationResult, AuthorizationCodeRequest, AuthorizationUrlRequest, AuthToken, PersistentCacheKeys, SilentFlowRequest, CacheSchemaType, TimeUtils, AuthorizationCodeClient, ResponseMode, SilentFlowClient, TrustedAuthority, EndSessionRequest, CloudDiscoveryMetadata, AccountEntity, ProtocolUtils, ServerTelemetryCacheValue, AuthenticationScheme, RefreshTokenClient } from "msal-common-ext";
import { BrowserUtils } from "../../src/utils/BrowserUtils";
import { BrowserConstants, TemporaryCacheKeys, ApiId } from "../../src/utils/BrowserConstants";
import { Base64Encode } from "../../src/encode/Base64Encode";
import { XhrClient } from "../../src/network/XhrClient";
import { BrowserAuthErrorMessage, BrowserAuthError } from "../../src/error/BrowserAuthError";
import { RedirectHandler } from "../../src/interaction_handler/RedirectHandler";
import { PopupHandler } from "../../src/interaction_handler/PopupHandler";
import { SilentHandler } from "../../src/interaction_handler/SilentHandler";
import { BrowserStorage } from "../../src/cache/BrowserStorage";
import { CryptoOps } from "../../src/crypto/CryptoOps";
import { DatabaseStorage } from "../../src/cache/DatabaseStorage";

describe("PublicClientApplication.ts Class Unit Tests", () => {
    const cacheConfig = {
        cacheLocation: BrowserConstants.CACHE_LOCATION_SESSION,
        storeAuthStateInCookie: false
    };

    let dbStorage = {};

    let pca: PublicClientApplication;
    beforeEach(() => {
        sinon.stub(TrustedAuthority, "IsInTrustedHostList").returns(true);
        const stubbedCloudDiscoveryMetadata: CloudDiscoveryMetadata = {
            preferred_cache: "login.windows.net",
            preferred_network: "login.microsoftonline.com",
            aliases: ["login.microsoftonline.com","login.windows.net","login.microsoft.com","sts.windows.net"]
        };
        sinon.stub(TrustedAuthority, "getTrustedHostList").returns(stubbedCloudDiscoveryMetadata.aliases);
        sinon.stub(TrustedAuthority, "getCloudDiscoveryMetadata").returns(stubbedCloudDiscoveryMetadata);
        sinon.stub(DatabaseStorage.prototype, "open").callsFake(async (): Promise<void> => {
            dbStorage = {};
        });
        pca = new PublicClientApplication({
            auth: {
                clientId: TEST_CONFIG.MSAL_CLIENT_ID
            }
        });
    });

    afterEach(() => {
        sinon.restore();
        window.location.hash = "";
        window.sessionStorage.clear();
        window.localStorage.clear();
    });

    describe("Constructor tests", () => {

        it("passes null check", (done) => {
            expect(pca).to.be.not.null;
            expect(pca instanceof PublicClientApplication).to.be.true;
            done();
        });

        it("handleRedirectPromise returns null if interaction is not in progress", async () => {
            sinon.stub(pca, <any>"interactionInProgress").returns(false);
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_ALTERNATE_REDIR_URI);
            expect(await pca.handleRedirectPromise()).to.be.null;
        });

        it("navigates and caches hash if navigateToLoginRequestUri is true and interaction type is redirect", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_ALTERNATE_REDIR_URI);
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                expect(noHistory).to.be.true;
                expect(urlNavigate).to.be.eq(TEST_URIS.TEST_ALTERNATE_REDIR_URI);
                done();
            });
            pca.handleRedirectPromise();
            expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`)).to.be.eq(null);
        });

        it("navigates to root and caches hash if navigateToLoginRequestUri is true", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                expect(noHistory).to.be.true;
                expect(urlNavigate).to.be.eq("https://localhost:8081/");
                expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`)).to.be.eq("https://localhost:8081/");
                done();
            });
            pca.handleRedirectPromise();
            expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`)).to.be.eq(null);
        });

        it("navigates to root and caches hash if navigateToLoginRequestUri is true and loginRequestUrl is 'null'", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, "null");
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                expect(noHistory).to.be.true;
                expect(urlNavigate).to.be.eq("https://localhost:8081/");
                expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`)).to.be.eq("https://localhost:8081/");
                done();
            });
            pca.handleRedirectPromise();
            expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`)).to.be.eq(null);
        });

        it("navigates and caches hash if navigateToLoginRequestUri is true and loginRequestUrl contains query string", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            const loginRequestUrl = window.location.href + "?testQueryString=1";
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, loginRequestUrl);
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                expect(noHistory).to.be.true;
                expect(urlNavigate).to.be.eq(loginRequestUrl);
                done();
            });
            pca.handleRedirectPromise();
            expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`)).to.be.eq(null);
        });

        it("navigates and caches hash if navigateToLoginRequestUri is true and loginRequestUrl contains query string and hash", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            const loginRequestUrl = window.location.href + "?testQueryString=1#testHash";
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, loginRequestUrl);
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                expect(noHistory).to.be.true;
                expect(urlNavigate).to.be.eq(loginRequestUrl);
                done();
            });
            pca.handleRedirectPromise();
            expect(window.sessionStorage.getItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`)).to.be.eq(null);
        });

        it("replaces custom hash if navigateToLoginRequestUri is true and loginRequestUrl contains custom hash", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            const loginRequestUrl = window.location.href + "#testHash";
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, loginRequestUrl);
            sinon.stub(PublicClientApplication.prototype, <any>"handleHash").callsFake((responseHash) => {
                expect(window.location.href).to.be.eq(loginRequestUrl);
                expect(responseHash).to.be.eq(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                done();
            });
            pca.handleRedirectPromise();
        });

        it("processes hash if navigateToLoginRequestUri is true and loginRequestUrl contains trailing slash", (done) => {
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            const loginRequestUrl = window.location.href.endsWith("/") ? window.location.href.slice(0, -1) : window.location.href + "/";
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, loginRequestUrl);
            sinon.stub(PublicClientApplication.prototype, <any>"handleHash").callsFake((responseHash) => {
                expect(responseHash).to.be.eq(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                done();
            });
            pca.handleRedirectPromise();
        });

        it("clears hash if navigateToLoginRequestUri is false and loginRequestUrl contains custom hash", (done) => {
            pca = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID,
                    navigateToLoginRequestUrl: false
                }
            });
            sinon.stub(pca, <any>"interactionInProgress").returns(true);
            const loginRequestUrl = window.location.href + "#testHash";
            window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
            window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, loginRequestUrl);
            sinon.stub(PublicClientApplication.prototype, <any>"handleHash").callsFake((responseHash) => {
                expect(window.location.href).to.not.contain("#testHash");
                expect(responseHash).to.be.eq(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                done();
            });
            pca.handleRedirectPromise();
        });
    });

    describe("Non-browser environment", () => {
        let oldWindow;

        beforeEach(() => {
            // @ts-ignore
            oldWindow = { ...global.window };
    
            // @ts-ignore
            global.window = undefined;
        });

        afterEach(() => {
            // @ts-ignore
            global.window = oldWindow;

            // @ts-ignore
            global.window.parent = oldWindow;
        });

        it("Constructor doesnt throw if window is undefined", () => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });
        });

        it("acquireTokenSilent throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.acquireTokenSilent({scopes: ["openid"], account: null})
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("ssoSilent throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.ssoSilent({})
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("acquireTokenPopup throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.acquireTokenPopup({scopes: ["openid"]}).catch((error) => {
                expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                done();
            });
        });

        it("acquireTokenRedirect throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.acquireTokenRedirect({scopes: ["openid"]})
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("loginPopup throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.loginPopup({scopes: ["openid"]})
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("loginRedirect throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.loginRedirect({scopes: ["openid"]})
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("logout throws", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.logout()
                .catch(error => {
                    expect(error.errorCode).to.equal(BrowserAuthErrorMessage.notInBrowserEnvironment.code);
                    done();
                });
        });

        it("getAllAccounts returns empty array", () => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            const accounts = instance.getAllAccounts();
            expect(accounts).to.deep.equal([]);
        });

        it("getAccountByUsername returns null", () => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            const account = instance.getAccountByUsername("example@test.com");
            expect(account).to.equal(null);
        });

        it("handleRedirectPromise returns null", (done) => {
            const instance = new PublicClientApplication({
                auth: {
                    clientId: TEST_CONFIG.MSAL_CLIENT_ID
                }
            });

            instance.handleRedirectPromise().then(result => {
                expect(result).to.be.null;
                done();
            });
        });
    });

    describe("Redirect Flow Unit tests", () => {

        describe("handleRedirectPromise()", () => {
            it("does nothing if no hash is detected", (done) => {	
                pca.handleRedirectPromise().then(() => {
                    expect(window.localStorage.length).to.be.eq(0);	
                    expect(window.sessionStorage.length).to.be.eq(0);	
                    done();
                });		
            });

            it("gets hash from cache and processes response", async () => {
                const b64Encode = new Base64Encode();
                const stateString = TEST_STATE_VALUES.TEST_STATE;
                const browserCrypto = new CryptoOps();
                const stateId = ProtocolUtils.parseRequestState(browserCrypto, stateString).libraryState.id;

                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_REDIR_URI);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_STATE}.${stateId}`, TEST_STATE_VALUES.TEST_STATE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`, TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.NONCE_IDTOKEN}.${stateId}`, "123523");
                const testTokenReq: AuthorizationCodeRequest = {
                    redirectUri: `${TEST_URIS.DEFAULT_INSTANCE}/`,
                    code: "thisIsATestCode",
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    codeVerifier: TEST_CONFIG.TEST_VERIFIER,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    correlationId: RANDOM_TEST_GUID
                };
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_PARAMS}`, b64Encode.encode(JSON.stringify(testTokenReq)));
                const testServerTokenResponse = {
                    headers: null,
                    status: 200,
                    body: {
                        token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                        scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                        expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        access_token: TEST_TOKENS.ACCESS_TOKEN,
                        refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                        id_token: TEST_TOKENS.IDTOKEN_V2,
                        client_info: TEST_DATA_CLIENT_INFO.TEST_RAW_CLIENT_INFO
                    }
                };
                const testIdTokenClaims: TokenClaims = {
                    "ver": "2.0",
                    "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                    "name": "Abe Lincoln",
                    "preferred_username": "AbeLi@microsoft.com",
                    "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                    "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                    "nonce": "123523",
                };
                const testAccount: AccountInfo = {
                    homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                    environment: "login.windows.net",
                    tenantId: testIdTokenClaims.tid,
                    username: testIdTokenClaims.preferred_username
                };
                const testTokenResponse: AuthenticationResult = {
                    uniqueId: testIdTokenClaims.oid,
                    tenantId: testIdTokenClaims.tid,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    idToken: testServerTokenResponse.body.id_token,
                    idTokenClaims: testIdTokenClaims,
                    accessToken: testServerTokenResponse.body.access_token,
                    fromCache: false,
                    expiresOn: new Date(Date.now() + (testServerTokenResponse.body.expires_in * 1000)),
                    account: testAccount,
                    tokenType: AuthenticationScheme.BEARER
                };
                sinon.stub(XhrClient.prototype, "sendGetRequestAsync").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
                sinon.stub(XhrClient.prototype, "sendPostRequestAsync").resolves(testServerTokenResponse);
                pca = new PublicClientApplication({
                    auth: {
                        clientId: TEST_CONFIG.MSAL_CLIENT_ID
                    }
                });

                const tokenResponse = await pca.handleRedirectPromise();
                expect(tokenResponse.uniqueId).to.be.eq(testTokenResponse.uniqueId);
                expect(tokenResponse.tenantId).to.be.eq(testTokenResponse.tenantId);
                expect(tokenResponse.scopes).to.be.deep.eq(testTokenResponse.scopes);
                expect(tokenResponse.idToken).to.be.eq(testTokenResponse.idToken);
                expect(tokenResponse.idTokenClaims).to.be.contain(testTokenResponse.idTokenClaims);
                expect(tokenResponse.accessToken).to.be.eq(testTokenResponse.accessToken);
                expect(testTokenResponse.expiresOn.getMilliseconds() >= tokenResponse.expiresOn.getMilliseconds()).to.be.true;
                expect(window.sessionStorage.length).to.be.eq(4);
            });

            it("gets hash from cache and processes error", (done) => {
                const testAuthCodeRequest: AuthorizationCodeRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["scope1", "scope2"],
                    code: ""
                };
                
                const stateString = TEST_STATE_VALUES.TEST_STATE;
                const browserCrypto = new CryptoOps();
                const stateId = ProtocolUtils.parseRequestState(browserCrypto, stateString).libraryState.id;

                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_PARAMS}`, browserCrypto.base64Encode(JSON.stringify(testAuthCodeRequest)));
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_REDIR_URI);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_STATE}.${stateId}`, TEST_STATE_VALUES.TEST_STATE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.URL_HASH}`, TEST_HASHES.TEST_ERROR_HASH);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                
                pca = new PublicClientApplication({
                    auth: {
                        clientId: TEST_CONFIG.MSAL_CLIENT_ID
                    }
                });

                pca.handleRedirectPromise().catch((err) => {
                    expect(err instanceof ServerError).to.be.true;
                    done();
                });
            });

            it("processes hash if navigateToLoginRequestUri is false and request origin is the same", async () => {
                const b64Encode = new Base64Encode();
                const stateString = TEST_STATE_VALUES.TEST_STATE;
                const browserCrypto = new CryptoOps();
                const stateId = ProtocolUtils.parseRequestState(browserCrypto, stateString).libraryState.id;

                window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_REDIR_URI);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_STATE}.${stateId}`, TEST_STATE_VALUES.TEST_STATE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.NONCE_IDTOKEN}.${stateId}`, "123523");

                const testTokenReq: AuthorizationCodeRequest = {
                    redirectUri: `${TEST_URIS.DEFAULT_INSTANCE}/`,
                    code: "thisIsATestCode",
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    codeVerifier: TEST_CONFIG.TEST_VERIFIER,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    correlationId: RANDOM_TEST_GUID
                };

                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_PARAMS}`, b64Encode.encode(JSON.stringify(testTokenReq)));
                const testServerTokenResponse = {
                    headers: null,
                    status: 200,
                    body: {
                        token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                        scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                        expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        access_token: TEST_TOKENS.ACCESS_TOKEN,
                        refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                        id_token: TEST_TOKENS.IDTOKEN_V2,
                        client_info: TEST_DATA_CLIENT_INFO.TEST_RAW_CLIENT_INFO
                    }
                };

                const testIdTokenClaims: TokenClaims = {
                    "ver": "2.0",
                    "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                    "name": "Abe Lincoln",
                    "preferred_username": "AbeLi@microsoft.com",
                    "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                    "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                    "nonce": "123523",
                };

                const testAccount: AccountInfo = {
                    homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                    environment: "login.windows.net",
                    tenantId: testIdTokenClaims.tid,
                    username: testIdTokenClaims.preferred_username
                };

                const testTokenResponse: AuthenticationResult = {
                    uniqueId: testIdTokenClaims.oid,
                    tenantId: testIdTokenClaims.tid,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    idToken: testServerTokenResponse.body.id_token,
                    idTokenClaims: testIdTokenClaims,
                    accessToken: testServerTokenResponse.body.access_token,
                    fromCache: false,
                    expiresOn: new Date(Date.now() + (testServerTokenResponse.body.expires_in * 1000)),
                    account: testAccount,
                    tokenType: AuthenticationScheme.BEARER
                };

                sinon.stub(XhrClient.prototype, "sendGetRequestAsync").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
                sinon.stub(XhrClient.prototype, "sendPostRequestAsync").resolves(testServerTokenResponse);
                pca = new PublicClientApplication({
                    auth: {
                        clientId: TEST_CONFIG.MSAL_CLIENT_ID,
                        navigateToLoginRequestUrl: false
                    }
                });

                const tokenResponse = await pca.handleRedirectPromise();
                expect(tokenResponse.uniqueId).to.be.eq(testTokenResponse.uniqueId);
                expect(tokenResponse.tenantId).to.be.eq(testTokenResponse.tenantId);
                expect(tokenResponse.scopes).to.be.deep.eq(testTokenResponse.scopes);
                expect(tokenResponse.idToken).to.be.eq(testTokenResponse.idToken);
                expect(tokenResponse.idTokenClaims).to.be.contain(testTokenResponse.idTokenClaims);
                expect(tokenResponse.accessToken).to.be.eq(testTokenResponse.accessToken);
                expect(testTokenResponse.expiresOn.getMilliseconds() >= tokenResponse.expiresOn.getMilliseconds()).to.be.true;
                expect(window.sessionStorage.length).to.be.eq(4);
                expect(window.location.hash).to.be.empty;
            });

            it("processes hash if navigateToLoginRequestUri is false and request origin is different", async () => {
                const b64Encode = new Base64Encode();
                const stateString = TEST_STATE_VALUES.TEST_STATE;
                const browserCrypto = new CryptoOps();
                const stateId = ProtocolUtils.parseRequestState(browserCrypto, stateString).libraryState.id;

                window.location.hash = TEST_HASHES.TEST_SUCCESS_CODE_HASH;
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.ORIGIN_URI}`, TEST_URIS.TEST_ALTERNATE_REDIR_URI);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_STATE}.${stateId}`, TEST_STATE_VALUES.TEST_STATE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.NONCE_IDTOKEN}.${stateId}`, "123523");

                const testTokenReq: AuthorizationCodeRequest = {
                    redirectUri: `${TEST_URIS.DEFAULT_INSTANCE}/`,
                    code: "thisIsATestCode",
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    codeVerifier: TEST_CONFIG.TEST_VERIFIER,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    correlationId: RANDOM_TEST_GUID
                };

                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${TemporaryCacheKeys.REQUEST_PARAMS}`, b64Encode.encode(JSON.stringify(testTokenReq)));
                const testServerTokenResponse = {
                    headers: null,
                    status: 200,
                    body: {
                        token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                        scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                        expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                        access_token: TEST_TOKENS.ACCESS_TOKEN,
                        refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                        id_token: TEST_TOKENS.IDTOKEN_V2,
                        client_info: TEST_DATA_CLIENT_INFO.TEST_RAW_CLIENT_INFO
                    }
                };

                const testIdTokenClaims: TokenClaims = {
                    "ver": "2.0",
                    "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                    "name": "Abe Lincoln",
                    "preferred_username": "AbeLi@microsoft.com",
                    "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                    "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                    "nonce": "123523",
                };

                const testAccount: AccountInfo = {
                    homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                    environment: "login.windows.net",
                    tenantId: testIdTokenClaims.tid,
                    username: testIdTokenClaims.preferred_username
                };

                const testTokenResponse: AuthenticationResult = {
                    uniqueId: testIdTokenClaims.oid,
                    tenantId: testIdTokenClaims.tid,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    idToken: testServerTokenResponse.body.id_token,
                    idTokenClaims: testIdTokenClaims,
                    accessToken: testServerTokenResponse.body.access_token,
                    fromCache: false,
                    expiresOn: new Date(Date.now() + (testServerTokenResponse.body.expires_in * 1000)),
                    account: testAccount,
                    tokenType: AuthenticationScheme.BEARER
                };

                sinon.stub(XhrClient.prototype, "sendGetRequestAsync").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
                sinon.stub(XhrClient.prototype, "sendPostRequestAsync").resolves(testServerTokenResponse);
                pca = new PublicClientApplication({
                    auth: {
                        clientId: TEST_CONFIG.MSAL_CLIENT_ID,
                        navigateToLoginRequestUrl: false
                    }
                });

                const tokenResponse = await pca.handleRedirectPromise();
                expect(tokenResponse.uniqueId).to.be.eq(testTokenResponse.uniqueId);
                expect(tokenResponse.tenantId).to.be.eq(testTokenResponse.tenantId);
                expect(tokenResponse.scopes).to.be.deep.eq(testTokenResponse.scopes);
                expect(tokenResponse.idToken).to.be.eq(testTokenResponse.idToken);
                expect(tokenResponse.idTokenClaims).to.be.contain(testTokenResponse.idTokenClaims);
                expect(tokenResponse.accessToken).to.be.eq(testTokenResponse.accessToken);
                expect(testTokenResponse.expiresOn.getMilliseconds() >= tokenResponse.expiresOn.getMilliseconds()).to.be.true;
                expect(window.sessionStorage.length).to.be.eq(4);
                expect(window.location.hash).to.be.empty;
            });
        });

        describe("loginRedirect", () => {

            it("loginRedirect throws an error if interaction is currently in progress", async () => {
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                await expect(pca.loginRedirect(null)).to.be.rejectedWith(BrowserAuthErrorMessage.interactionInProgress.desc);
                await expect(pca.loginRedirect(null)).to.be.rejectedWith(BrowserAuthError);
            });

            it("Uses default request if no request provided", (done) => {
                sinon.stub(pca, "acquireTokenRedirect").callsFake((request) => {
                    expect(request.scopes).to.contain("openid");
                    expect(request.scopes).to.contain("profile");
                    done();
                    return null;
                });

                pca.loginRedirect();
            });

            it("loginRedirect navigates to created login url", (done) => {
                sinon.stub(RedirectHandler.prototype, "initiateAuthRequest").callsFake((navigateUrl): Window => {
                    expect(navigateUrl).to.be.eq(testNavUrl);
                    done();
                    return window;
                });
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                const loginRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["user.read"],
                    state: TEST_STATE_VALUES.USER_STATE
                };

                pca.loginRedirect(loginRequest);
            });

            it("loginRedirect navigates to created login url, with empty request", (done) => {
                sinon.stub(RedirectHandler.prototype, "initiateAuthRequest").callsFake((navigateUrl): Window => {
                    expect(navigateUrl.startsWith(testNavUrlNoRequest)).to.be.true;
                    done();
                    return window;
                });
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);

                pca.loginRedirect(null);
            });

            it("Updates cache entries correctly", async () => {
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [],
                    state: TEST_STATE_VALUES.USER_STATE
                };

                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });

                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });

                const browserCrypto = new CryptoOps();
                const browserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                await pca.loginRedirect(emptyRequest);
                expect(browserStorage.getItem(browserStorage.generateStateKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.deep.eq(TEST_STATE_VALUES.TEST_STATE);
                expect(browserStorage.getItem(browserStorage.generateNonceKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.eq(RANDOM_TEST_GUID);
                expect(browserStorage.getItem(browserStorage.generateAuthorityKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.eq(`${Constants.DEFAULT_AUTHORITY}`);
            });

            it("Caches token request correctly", async () => {
                const tokenRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [],
                    correlationId: RANDOM_TEST_GUID,
                    state: TEST_STATE_VALUES.USER_STATE
                };

                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });

                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });

                const browserCrypto = new CryptoOps();
                const browserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                await pca.loginRedirect(tokenRequest);
                const cachedRequest: AuthorizationCodeRequest = JSON.parse(browserCrypto.base64Decode(browserStorage.getItem(browserStorage.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS), CacheSchemaType.TEMPORARY) as string));
                expect(cachedRequest.scopes).to.be.deep.eq([]);
                expect(cachedRequest.codeVerifier).to.be.deep.eq(TEST_CONFIG.TEST_VERIFIER);
                expect(cachedRequest.authority).to.be.deep.eq(`${Constants.DEFAULT_AUTHORITY}`);
                expect(cachedRequest.correlationId).to.be.deep.eq(RANDOM_TEST_GUID);
            });

            it("Cleans cache before error is thrown", async () => {
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [],
                    state: TEST_STATE_VALUES.USER_STATE
                };

                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
				
                const testError = {
                    errorCode: "create_login_url_error",
                    errorMessage: "Error in creating a login url"
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").throws(testError);
                try {
                    await pca.loginRedirect(emptyRequest);
                } catch (e) {
                    // Test that error was cached for telemetry purposes and then thrown
                    expect(window.sessionStorage).to.be.length(1);
                    const failures = window.sessionStorage.getItem(`server-telemetry-${TEST_CONFIG.MSAL_CLIENT_ID}`);
                    const failureObj = JSON.parse(failures) as ServerTelemetryCacheValue;
                    expect(failureObj.failedRequests).to.be.length(2);
                    expect(failureObj.failedRequests[0]).to.eq(ApiId.acquireTokenRedirect);
                    expect(failureObj.errors[0]).to.eq(testError.errorCode);
                    expect(e).to.be.eq(testError);
                }
            });

            it("Uses adal token from cache if it is present.", async () => {
                const idTokenClaims: TokenClaims = {
                    "iss": "https://sts.windows.net/fa15d692-e9c7-4460-a743-29f2956fd429/",
                    "exp": 1536279024,
                    "name": "abeli",
                    "nonce": "123523",
                    "oid": "05833b6b-aa1d-42d4-9ec0-1b2bb9194438",
                    "sub": "5_J9rSss8-jvt_Icu6ueRNL8xXb8LF4Fsg_KooC2RJQ",
                    "tid": "fa15d692-e9c7-4460-a743-29f2956fd429",
                    "ver": "1.0",
                    "upn": "AbeLincoln@contoso.com"
                };
                sinon.stub(AuthToken, "extractTokenClaims").returns(idTokenClaims);
                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                browserStorage.setItem(PersistentCacheKeys.ADAL_ID_TOKEN, TEST_TOKENS.IDTOKEN_V1, CacheSchemaType.TEMPORARY);
                const loginUrlSpy = sinon.spy(AuthorizationCodeClient.prototype, "getAuthCodeUrl");
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [],
                    state: TEST_STATE_VALUES.USER_STATE
                };
                await pca.loginRedirect(emptyRequest);
                const validatedRequest: AuthorizationUrlRequest = {
                    ...emptyRequest,
                    scopes: [],
                    loginHint: idTokenClaims.upn,
                    state: TEST_STATE_VALUES.TEST_STATE,
                    correlationId: RANDOM_TEST_GUID,
                    nonce: RANDOM_TEST_GUID,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    responseMode: ResponseMode.FRAGMENT,
                    codeChallenge: TEST_CONFIG.TEST_CHALLENGE,
                    codeChallengeMethod: Constants.S256_CODE_CHALLENGE_METHOD
                };
                expect(loginUrlSpy.calledWith(validatedRequest)).to.be.true;
            });
	
            it("Does not use adal token from cache if it is present and SSO params have been given.", async () => {
                const idTokenClaims: TokenClaims = {
                    "iss": "https://sts.windows.net/fa15d692-e9c7-4460-a743-29f2956fd429/",
                    "exp": 1536279024,
                    "name": "abeli",
                    "nonce": "123523",
                    "oid": "05833b6b-aa1d-42d4-9ec0-1b2bb9194438",
                    "sub": "5_J9rSss8-jvt_Icu6ueRNL8xXb8LF4Fsg_KooC2RJQ",
                    "tid": "fa15d692-e9c7-4460-a743-29f2956fd429",
                    "ver": "1.0",
                    "upn": "AbeLincoln@contoso.com"
                };
                sinon.stub(AuthToken, "extractTokenClaims").returns(idTokenClaims);
                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                browserStorage.setItem(PersistentCacheKeys.ADAL_ID_TOKEN, TEST_TOKENS.IDTOKEN_V1, CacheSchemaType.TEMPORARY);
                const loginUrlSpy = sinon.spy(AuthorizationCodeClient.prototype, "getAuthCodeUrl");
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const loginRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [],
                    loginHint: "AbeLi@microsoft.com",
                    state: TEST_STATE_VALUES.USER_STATE
                };
                await pca.loginRedirect(loginRequest);
                const validatedRequest: AuthorizationUrlRequest = {
                    ...loginRequest,
                    scopes: [],
                    state: TEST_STATE_VALUES.TEST_STATE,
                    correlationId: RANDOM_TEST_GUID,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    nonce: RANDOM_TEST_GUID,
                    responseMode: ResponseMode.FRAGMENT,
                    codeChallenge: TEST_CONFIG.TEST_CHALLENGE,
                    codeChallengeMethod: Constants.S256_CODE_CHALLENGE_METHOD
                };
                expect(loginUrlSpy.calledWith(validatedRequest)).to.be.true;
            });
        });

        describe("acquireTokenRedirect", () => {

            it("acquireTokenRedirect throws an error if interaction is currently in progress", async () => {
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                await expect(pca.acquireTokenRedirect(null)).to.be.rejectedWith(BrowserAuthErrorMessage.interactionInProgress.desc);
                await expect(pca.acquireTokenRedirect(null)).to.be.rejectedWith(BrowserAuthError);
            });

            it("acquireTokenRedirect navigates to created login url", (done) => {
                sinon.stub(RedirectHandler.prototype, "initiateAuthRequest").callsFake((navigateUrl): Window => {
                    expect(navigateUrl).to.be.eq(testNavUrl);
                    done();
                    return window;
                });
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                const loginRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["user.read", "openid", "profile"],
                    state: TEST_STATE_VALUES.USER_STATE
                };
                pca.acquireTokenRedirect(loginRequest);
            });

            it("Updates cache entries correctly", async () => {
                const testScope = "testscope";
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [testScope],
                    state: TEST_STATE_VALUES.USER_STATE
                };
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const browserCrypto = new CryptoOps();
                const browserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                await pca.loginRedirect(emptyRequest);
                expect(browserStorage.getItem(browserStorage.generateStateKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.deep.eq(TEST_STATE_VALUES.TEST_STATE);
                expect(browserStorage.getItem(browserStorage.generateNonceKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.eq(RANDOM_TEST_GUID);
                expect(browserStorage.getItem(browserStorage.generateAuthorityKey(TEST_STATE_VALUES.TEST_STATE), CacheSchemaType.TEMPORARY)).to.be.eq(`${Constants.DEFAULT_AUTHORITY}`);
            });
	
            it("Caches token request correctly", async () => {
                const testScope = "testscope";
                const tokenRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [testScope],
                    correlationId: RANDOM_TEST_GUID,
                    state: TEST_STATE_VALUES.USER_STATE
                };
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const browserCrypto = new CryptoOps();
                const browserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                await pca.acquireTokenRedirect(tokenRequest);
                const cachedRequest: AuthorizationCodeRequest = JSON.parse(browserCrypto.base64Decode(browserStorage.getItem(browserStorage.generateCacheKey(TemporaryCacheKeys.REQUEST_PARAMS), CacheSchemaType.TEMPORARY) as string));
                expect(cachedRequest.scopes).to.be.deep.eq([testScope]);
                expect(cachedRequest.codeVerifier).to.be.deep.eq(TEST_CONFIG.TEST_VERIFIER);
                expect(cachedRequest.authority).to.be.deep.eq(`${Constants.DEFAULT_AUTHORITY}`);
                expect(cachedRequest.correlationId).to.be.deep.eq(RANDOM_TEST_GUID);
            });

            it("Cleans cache before error is thrown", async () => {
                const testScope = "testscope";
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [testScope]
                };
                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                
                const testError = {
                    errorCode: "create_login_url_error",
                    errorMessage: "Error in creating a login url"
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").throws(testError);
                try {
                    await pca.acquireTokenRedirect(emptyRequest);
                } catch (e) {
                    // Test that error was cached for telemetry purposes and then thrown
                    expect(window.sessionStorage).to.be.length(1);
                    const failures = window.sessionStorage.getItem(`server-telemetry-${TEST_CONFIG.MSAL_CLIENT_ID}`);
                    const failureObj = JSON.parse(failures) as ServerTelemetryCacheValue;
                    expect(failureObj.failedRequests).to.be.length(2);
                    expect(failureObj.failedRequests[0]).to.eq(ApiId.acquireTokenRedirect);
                    expect(failureObj.errors[0]).to.eq(testError.errorCode);
                    expect(e).to.be.eq(testError);
                }
            });

            it("Uses adal token from cache if it is present.", async () => {
                const testScope = "testscope";
                const idTokenClaims: TokenClaims = {
                    "iss": "https://sts.windows.net/fa15d692-e9c7-4460-a743-29f2956fd429/",
                    "exp": 1536279024,
                    "name": "abeli",
                    "nonce": "123523",
                    "oid": "05833b6b-aa1d-42d4-9ec0-1b2bb9194438",
                    "sub": "5_J9rSss8-jvt_Icu6ueRNL8xXb8LF4Fsg_KooC2RJQ",
                    "tid": "fa15d692-e9c7-4460-a743-29f2956fd429",
                    "ver": "1.0",
                    "upn": "AbeLincoln@contoso.com"
                };
                sinon.stub(AuthToken, "extractTokenClaims").returns(idTokenClaims);
                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                browserStorage.setItem(PersistentCacheKeys.ADAL_ID_TOKEN, TEST_TOKENS.IDTOKEN_V1, CacheSchemaType.TEMPORARY);
                const acquireTokenUrlSpy = sinon.spy(AuthorizationCodeClient.prototype, "getAuthCodeUrl");
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const emptyRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [testScope],
                    state: TEST_STATE_VALUES.USER_STATE
                };
                await pca.acquireTokenRedirect(emptyRequest);
                const validatedRequest: AuthorizationUrlRequest = {
                    ...emptyRequest,
                    scopes: [...emptyRequest.scopes],
                    loginHint: idTokenClaims.upn,
                    state: TEST_STATE_VALUES.TEST_STATE,
                    correlationId: RANDOM_TEST_GUID,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    nonce: RANDOM_TEST_GUID,
                    responseMode: ResponseMode.FRAGMENT,
                    codeChallenge: TEST_CONFIG.TEST_CHALLENGE,
                    codeChallengeMethod: Constants.S256_CODE_CHALLENGE_METHOD
                };
                expect(acquireTokenUrlSpy.calledWith(validatedRequest)).to.be.true;
            });
	
            it("Does not use adal token from cache if it is present and SSO params have been given.", async () => {
                const idTokenClaims: TokenClaims = {
                    "iss": "https://sts.windows.net/fa15d692-e9c7-4460-a743-29f2956fd429/",
                    "exp": 1536279024,
                    "name": "abeli",
                    "nonce": "123523",
                    "oid": "05833b6b-aa1d-42d4-9ec0-1b2bb9194438",
                    "sub": "5_J9rSss8-jvt_Icu6ueRNL8xXb8LF4Fsg_KooC2RJQ",
                    "tid": "fa15d692-e9c7-4460-a743-29f2956fd429",
                    "ver": "1.0",
                    "upn": "AbeLincoln@contoso.com"
                };
                sinon.stub(AuthToken, "extractTokenClaims").returns(idTokenClaims);
                const browserCrypto = new CryptoOps();
                const browserStorage: BrowserStorage = new BrowserStorage(TEST_CONFIG.MSAL_CLIENT_ID, cacheConfig, browserCrypto);
                browserStorage.setItem(PersistentCacheKeys.ADAL_ID_TOKEN, TEST_TOKENS.IDTOKEN_V1, CacheSchemaType.TEMPORARY);
                const acquireTokenUrlSpy = sinon.spy(AuthorizationCodeClient.prototype, "getAuthCodeUrl");
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                sinon.stub(TimeUtils, "nowSeconds").returns(TEST_STATE_VALUES.TEST_TIMESTAMP);
                sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory?: boolean) => {
                    expect(noHistory).to.be.undefined;
                    expect(urlNavigate).to.be.not.empty;
                });
                const testScope = "testscope";
                const loginRequest: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: [testScope],
                    loginHint: "AbeLi@microsoft.com",
                    state: TEST_STATE_VALUES.USER_STATE
                };
                await pca.acquireTokenRedirect(loginRequest);
                const validatedRequest: AuthorizationUrlRequest = {
                    ...loginRequest,
                    scopes: [...loginRequest.scopes],
                    state: TEST_STATE_VALUES.TEST_STATE,
                    correlationId: RANDOM_TEST_GUID,
                    authority: `${Constants.DEFAULT_AUTHORITY}`,
                    nonce: RANDOM_TEST_GUID,
                    responseMode: ResponseMode.FRAGMENT,
                    codeChallenge: TEST_CONFIG.TEST_CHALLENGE,
                    codeChallengeMethod: Constants.S256_CODE_CHALLENGE_METHOD
                };
                expect(acquireTokenUrlSpy.calledWith(validatedRequest)).to.be.true;
            });
        });
    });

    describe("Popup Flow Unit tests", () => {

        describe("loginPopup", () => {
            beforeEach(() => {
                sinon.stub(window, "open").returns(window);
            });

            afterEach(() => {
                sinon.restore();
            });

            it("throws error if interaction is in progress", async () => {
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                await expect(pca.loginPopup(null)).to.be.rejectedWith(BrowserAuthErrorMessage.interactionInProgress.desc);
                await expect(pca.loginPopup(null)).to.be.rejectedWith(BrowserAuthError);
            });

            it("Uses default request if no request provided", (done) => {
                sinon.stub(pca, "acquireTokenPopup").callsFake((request) => {
                    expect(request.scopes).to.contain("openid");
                    expect(request.scopes).to.contain("profile");
                    done();
                    return null;
                });

                pca.loginPopup();
            });

            it("resolves the response successfully", async () => {
                const testServerTokenResponse = {
                    token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                    scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                    expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                    ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                    access_token: TEST_TOKENS.ACCESS_TOKEN,
                    refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                    id_token: TEST_TOKENS.IDTOKEN_V2
                };
                const testIdTokenClaims: TokenClaims = {
                    "ver": "2.0",
                    "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                    "name": "Abe Lincoln",
                    "preferred_username": "AbeLi@microsoft.com",
                    "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                    "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                    "nonce": "123523",
                };
                const testAccount: AccountInfo = {
                    homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                    environment: "login.windows.net",
                    tenantId: testIdTokenClaims.tid,
                    username: testIdTokenClaims.preferred_username
                };
                const testTokenResponse: AuthenticationResult = {
                    uniqueId: testIdTokenClaims.oid,
                    tenantId: testIdTokenClaims.tid,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    idToken: testServerTokenResponse.id_token,
                    idTokenClaims: testIdTokenClaims,
                    accessToken: testServerTokenResponse.access_token,
                    fromCache: false,
                    expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                    account: testAccount,
                    tokenType: AuthenticationScheme.BEARER
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
                sinon.stub(PopupHandler.prototype, "initiateAuthRequest").callsFake((requestUrl: string): Window => {
                    expect(requestUrl).to.be.eq(testNavUrl);
                    return window;
                });
                sinon.stub(PopupHandler.prototype, "monitorPopupForHash").resolves(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                sinon.stub(PopupHandler.prototype, "handleCodeResponse").resolves(testTokenResponse);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                const tokenResp = await pca.loginPopup(null);
                expect(tokenResp).to.be.deep.eq(testTokenResponse);
            });

            it("catches error and cleans cache before rethrowing", async () => {
                const testError = {
                    errorCode: "create_login_url_error",
                    errorMessage: "Error in creating a login url"
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
                sinon.stub(PopupHandler.prototype, "initiateAuthRequest").throws(testError);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                try {
                    const tokenResp = await pca.loginPopup(null);
                } catch (e) {
                    // Test that error was cached for telemetry purposes and then thrown
                    expect(window.sessionStorage).to.be.length(1);
                    const failures = window.sessionStorage.getItem(`server-telemetry-${TEST_CONFIG.MSAL_CLIENT_ID}`);
                    const failureObj = JSON.parse(failures) as ServerTelemetryCacheValue;
                    expect(failureObj.failedRequests).to.be.length(2);
                    expect(failureObj.failedRequests[0]).to.eq(ApiId.acquireTokenPopup);
                    expect(failureObj.errors[0]).to.eq(testError.errorCode);
                    expect(e).to.be.eq(testError);
                }
            });
        });

        describe("acquireTokenPopup", () => {
            beforeEach(() => {
                sinon.stub(window, "open").returns(window);
            });

            afterEach(() => {
                window.localStorage.clear();
                window.sessionStorage.clear();
                sinon.restore();
            });

            it("throws error if interaction is in progress", async () => {
                window.sessionStorage.setItem(`${Constants.CACHE_PREFIX}.${TEST_CONFIG.MSAL_CLIENT_ID}.${BrowserConstants.INTERACTION_STATUS_KEY}`, BrowserConstants.INTERACTION_IN_PROGRESS_VALUE);
                await expect(pca.acquireTokenPopup({
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["scope"]
                })).rejectedWith(BrowserAuthErrorMessage.interactionInProgress.desc);
                await expect(pca.acquireTokenPopup({
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["scope"]
                })).rejectedWith(BrowserAuthError);
            });

            it("opens popup window before network request by default", async () => {
                const request: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["scope"],
                    loginHint: "AbeLi@microsoft.com",
                    state: TEST_STATE_VALUES.USER_STATE
                };

                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });

                const popupSpy = sinon.stub(PopupHandler, "openSizedPopup");
                
                try {
                    await pca.acquireTokenPopup(request);
                } catch(e) {}
                expect(popupSpy.getCall(0).args).to.be.length(0);
            });

            it("opens popups asynchronously if configured", async () => {
                pca = new PublicClientApplication({
                    auth: {
                        clientId: TEST_CONFIG.MSAL_CLIENT_ID
                    },
                    system: {
                        asyncPopups: true
                    }
                });

                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });

                const request: AuthorizationUrlRequest = {
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: ["scope"],
                    loginHint: "AbeLi@microsoft.com",
                    state: TEST_STATE_VALUES.USER_STATE
                };

                const popupSpy = sinon.stub(PopupHandler, "openSizedPopup");
                
                try {
                    await pca.acquireTokenPopup(request);
                } catch(e) {}
                expect(popupSpy.calledOnce).to.be.true;
                expect(popupSpy.getCall(0).args).to.be.length(1);
                expect(popupSpy.getCall(0).args[0].startsWith(TEST_URIS.TEST_AUTH_ENDPT)).to.be.true;
                expect(popupSpy.getCall(0).args[0]).to.include(`client_id=${encodeURIComponent(TEST_CONFIG.MSAL_CLIENT_ID)}`);
                expect(popupSpy.getCall(0).args[0]).to.include(`redirect_uri=${encodeURIComponent(request.redirectUri)}`);
                expect(popupSpy.getCall(0).args[0]).to.include(`login_hint=${encodeURIComponent(request.loginHint)}`);
            });

            it("resolves the response successfully", async () => {
                const testServerTokenResponse = {
                    token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                    scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                    expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                    ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                    access_token: TEST_TOKENS.ACCESS_TOKEN,
                    refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                    id_token: TEST_TOKENS.IDTOKEN_V2
                };
                const testIdTokenClaims: TokenClaims = {
                    "ver": "2.0",
                    "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                    "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                    "name": "Abe Lincoln",
                    "preferred_username": "AbeLi@microsoft.com",
                    "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                    "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                    "nonce": "123523",
                };
                const testAccount: AccountInfo = {
                    homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                    environment: "login.windows.net",
                    tenantId: testIdTokenClaims.tid,
                    username: testIdTokenClaims.preferred_username
                };
                const testTokenResponse: AuthenticationResult = {
                    uniqueId: testIdTokenClaims.oid,
                    tenantId: testIdTokenClaims.tid,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    idToken: testServerTokenResponse.id_token,
                    idTokenClaims: testIdTokenClaims,
                    accessToken: testServerTokenResponse.access_token,
                    fromCache: false,
                    expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                    account: testAccount,
                    tokenType: AuthenticationScheme.BEARER
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
                sinon.stub(PopupHandler.prototype, "initiateAuthRequest").callsFake((requestUrl: string): Window => {
                    expect(requestUrl).to.be.eq(testNavUrl);
                    return window;
                });
                sinon.stub(PopupHandler.prototype, "monitorPopupForHash").resolves(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
                sinon.stub(PopupHandler.prototype, "handleCodeResponse").resolves(testTokenResponse);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                const tokenResp = await pca.acquireTokenPopup({
                    redirectUri: TEST_URIS.TEST_REDIR_URI,
                    scopes: TEST_CONFIG.DEFAULT_SCOPES
                });
                expect(tokenResp).to.be.deep.eq(testTokenResponse);
            });

            it("catches error and cleans cache before rethrowing", async () => {
                const testError = {
                    errorCode: "create_login_url_error",
                    errorMessage: "Error in creating a login url"
                };
                sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
                sinon.stub(PopupHandler.prototype, "initiateAuthRequest").throws(testError);
                sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                    challenge: TEST_CONFIG.TEST_CHALLENGE,
                    verifier: TEST_CONFIG.TEST_VERIFIER
                });
                sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
                try {
                    const tokenResp = await pca.acquireTokenPopup({
                        redirectUri: TEST_URIS.TEST_REDIR_URI,
                        scopes: TEST_CONFIG.DEFAULT_SCOPES
                    });
                } catch (e) {
                    // Test that error was cached for telemetry purposes and then thrown
                    expect(window.sessionStorage).to.be.length(1);
                    const failures = window.sessionStorage.getItem(`server-telemetry-${TEST_CONFIG.MSAL_CLIENT_ID}`);
                    const failureObj = JSON.parse(failures) as ServerTelemetryCacheValue;
                    expect(failureObj.failedRequests).to.be.length(2);
                    expect(failureObj.failedRequests[0]).to.eq(ApiId.acquireTokenPopup);
                    expect(failureObj.errors[0]).to.eq(testError.errorCode);
                    expect(e).to.be.eq(testError);
                }
            });
        });
    });

    describe("ssoSilent() Tests", () => {

        it("throws error if loginHint or sid are empty", async () => {
            await expect(pca.ssoSilent({
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                scopes: [TEST_CONFIG.MSAL_CLIENT_ID]
            })).to.be.rejectedWith(BrowserAuthError);
            await expect(pca.ssoSilent({
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                scopes: [TEST_CONFIG.MSAL_CLIENT_ID]
            })).to.be.rejectedWith(BrowserAuthErrorMessage.silentSSOInsufficientInfoError.desc);
        });

        it("throws error if prompt is not set to 'none'", async () => {
            const req: AuthorizationUrlRequest = {
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                scopes: [TEST_CONFIG.MSAL_CLIENT_ID],
                prompt: PromptValue.SELECT_ACCOUNT,
                loginHint: "testLoginHint"
            };

            await expect(pca.ssoSilent(req)).to.be.rejectedWith(BrowserAuthError);
            await expect(pca.ssoSilent(req)).to.be.rejectedWith(BrowserAuthErrorMessage.silentPromptValueError.desc);
        });

        it("successfully returns a token response (login_hint)", async () => {
            const testServerTokenResponse = {
                token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                access_token: TEST_TOKENS.ACCESS_TOKEN,
                refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                id_token: TEST_TOKENS.IDTOKEN_V2
            };
            const testIdTokenClaims: TokenClaims = {
                "ver": "2.0",
                "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                "name": "Abe Lincoln",
                "preferred_username": "AbeLi@microsoft.com",
                "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                "nonce": "123523",
            };
            const testAccount: AccountInfo = {
                homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                environment: "login.windows.net",
                tenantId: testIdTokenClaims.tid,
                username: testIdTokenClaims.preferred_username
            };
            const testTokenResponse: AuthenticationResult = {
                uniqueId: testIdTokenClaims.oid,
                tenantId: testIdTokenClaims.tid,
                scopes: TEST_CONFIG.DEFAULT_SCOPES,
                idToken: testServerTokenResponse.id_token,
                idTokenClaims: testIdTokenClaims,
                accessToken: testServerTokenResponse.access_token,
                fromCache: false,
                expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                account: testAccount,
                tokenType: AuthenticationScheme.BEARER
            };
            sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
            const loadFrameSyncSpy = sinon.spy(SilentHandler.prototype, <any>"loadFrameSync");
            sinon.stub(SilentHandler.prototype, "monitorIframeForHash").resolves(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
            sinon.stub(SilentHandler.prototype, "handleCodeResponse").resolves(testTokenResponse);
            sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                challenge: TEST_CONFIG.TEST_CHALLENGE,
                verifier: TEST_CONFIG.TEST_VERIFIER
            });
            sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
            const tokenResp = await pca.ssoSilent({
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                loginHint: "testLoginHint"
            });
            expect(loadFrameSyncSpy.calledOnce).to.be.true;
            expect(tokenResp).to.be.deep.eq(testTokenResponse);
        });

        it("successfully returns a token response (sid)", async () => {
            const testServerTokenResponse = {
                token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                access_token: TEST_TOKENS.ACCESS_TOKEN,
                refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                id_token: TEST_TOKENS.IDTOKEN_V2
            };
            const testIdTokenClaims: TokenClaims = {
                "ver": "2.0",
                "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                "name": "Abe Lincoln",
                "preferred_username": "AbeLi@microsoft.com",
                "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                "nonce": "123523",
            };
            const testAccount: AccountInfo = {
                homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                environment: "login.windows.net",
                tenantId: testIdTokenClaims.tid,
                username: testIdTokenClaims.preferred_username
            };
            const testTokenResponse: AuthenticationResult = {
                uniqueId: testIdTokenClaims.oid,
                tenantId: testIdTokenClaims.tid,
                scopes: TEST_CONFIG.DEFAULT_SCOPES,
                idToken: testServerTokenResponse.id_token,
                idTokenClaims: testIdTokenClaims,
                accessToken: testServerTokenResponse.access_token,
                fromCache: false,
                expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                account: testAccount,
                tokenType: AuthenticationScheme.BEARER
            };
            sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
            const loadFrameSyncSpy = sinon.spy(SilentHandler.prototype, <any>"loadFrameSync");
            sinon.stub(SilentHandler.prototype, "monitorIframeForHash").resolves(TEST_HASHES.TEST_SUCCESS_CODE_HASH);
            sinon.stub(SilentHandler.prototype, "handleCodeResponse").resolves(testTokenResponse);
            sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                challenge: TEST_CONFIG.TEST_CHALLENGE,
                verifier: TEST_CONFIG.TEST_VERIFIER
            });
            sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
            const tokenResp = await pca.ssoSilent({
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                scopes: TEST_CONFIG.DEFAULT_SCOPES,
                sid: TEST_CONFIG.SID
            });
            expect(loadFrameSyncSpy.calledOnce).to.be.true;
            expect(tokenResp).to.be.deep.eq(testTokenResponse);
        });
    });

    describe("Acquire Token Silent (Iframe) Tests", () => {

        it("successfully renews token", async () => {
            const testServerTokenResponse = {
                token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                access_token: TEST_TOKENS.ACCESS_TOKEN,
                refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                id_token: TEST_TOKENS.IDTOKEN_V2
            };
            const testIdTokenClaims: TokenClaims = {
                "ver": "2.0",
                "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                "name": "Abe Lincoln",
                "preferred_username": "AbeLi@microsoft.com",
                "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                "nonce": "123523",
            };
            const testAccount: AccountInfo = {
                homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                environment: "login.windows.net",
                tenantId: testIdTokenClaims.tid,
                username: testIdTokenClaims.preferred_username
            };
            const testTokenResponse: AuthenticationResult = {
                uniqueId: testIdTokenClaims.oid,
                tenantId: testIdTokenClaims.tid,
                scopes: ["scope1"],
                idToken: testServerTokenResponse.id_token,
                idTokenClaims: testIdTokenClaims,
                accessToken: testServerTokenResponse.access_token,
                fromCache: false,
                expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                account: testAccount,
                tokenType: AuthenticationScheme.BEARER
            };
            sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
            const silentATStub = sinon.stub(RefreshTokenClient.prototype, <any>"acquireTokenByRefreshToken").resolves(testTokenResponse);
            const tokenRequest: SilentFlowRequest = {
                scopes: ["scope1"],
                account: testAccount
            };
            const expectedTokenRequest: SilentFlowRequest = {
                ...tokenRequest,
                scopes: ["scope1"],
                authority: `${Constants.DEFAULT_AUTHORITY}`,
                correlationId: RANDOM_TEST_GUID
            };
            const tokenResp = await pca.acquireTokenSilent({
                scopes: ["scope1"],
                account: testAccount
            });
            expect(silentATStub.calledWith(expectedTokenRequest)).to.be.true;
            expect(tokenResp).to.be.deep.eq(testTokenResponse);
        });

        it("throws error that SilentFlowClient.acquireToken() throws", async () => {
            const testError = {
                errorCode: "create_login_url_error",
                errorMessage: "Error in creating a login url"
            };
            const testAccount: AccountInfo = {
                homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                environment: "login.windows.net",
                tenantId: "testTenantId",
                username: "username@contoso.com"
            };
            sinon.stub(RefreshTokenClient.prototype, <any>"acquireTokenByRefreshToken").rejects(testError);
            try {
                const tokenResp = await pca.acquireTokenSilent({
                    scopes: TEST_CONFIG.DEFAULT_SCOPES,
                    account: testAccount
                });
            } catch (e) {
                // Test that error was cached for telemetry purposes and then thrown
                expect(window.sessionStorage).to.be.length(1);
                const failures = window.sessionStorage.getItem(`server-telemetry-${TEST_CONFIG.MSAL_CLIENT_ID}`);
                const failureObj = JSON.parse(failures) as ServerTelemetryCacheValue;
                expect(failureObj.failedRequests).to.be.length(2);
                expect(failureObj.failedRequests[0]).to.eq(ApiId.acquireTokenSilent_silentFlow);
                expect(failureObj.errors[0]).to.eq(testError.errorCode);
                expect(e).to.be.eq(testError);
            }
        });

        it("Falls back to silent handler if thrown error is a refresh token expired error", async () => {
            const invalidGrantError: ServerError = new ServerError("invalid_grant", "AADSTS700081: The refresh token has expired due to maximum lifetime. The token was issued on xxxxxxx and the maximum allowed lifetime for this application is 1.00:00:00.\r\nTrace ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxx\r\nCorrelation ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxx\r\nTimestamp: 2020-0x-0x XX:XX:XXZ");
            sinon.stub(RefreshTokenClient.prototype, <any>"acquireTokenByRefreshToken").rejects(invalidGrantError);
            const testServerTokenResponse = {
                token_type: TEST_CONFIG.TOKEN_TYPE_BEARER,
                scope: TEST_CONFIG.DEFAULT_SCOPES.join(" "),
                expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                ext_expires_in: TEST_TOKEN_LIFETIMES.DEFAULT_EXPIRES_IN,
                access_token: TEST_TOKENS.ACCESS_TOKEN,
                refresh_token: TEST_TOKENS.REFRESH_TOKEN,
                id_token: TEST_TOKENS.IDTOKEN_V2
            };
            const testIdTokenClaims: TokenClaims = {
                "ver": "2.0",
                "iss": "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
                "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
                "name": "Abe Lincoln",
                "preferred_username": "AbeLi@microsoft.com",
                "oid": "00000000-0000-0000-66f3-3332eca7ea81",
                "tid": "3338040d-6c67-4c5b-b112-36a304b66dad",
                "nonce": "123523",
            };
            const testAccount: AccountInfo = {
                homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
                environment: "login.windows.net",
                tenantId: testIdTokenClaims.tid,
                username: testIdTokenClaims.preferred_username
            };
            const testTokenResponse: AuthenticationResult = {
                uniqueId: testIdTokenClaims.oid,
                tenantId: testIdTokenClaims.tid,
                scopes: [...TEST_CONFIG.DEFAULT_SCOPES, "User.Read"],
                idToken: testServerTokenResponse.id_token,
                idTokenClaims: testIdTokenClaims,
                accessToken: testServerTokenResponse.access_token,
                fromCache: false,
                expiresOn: new Date(Date.now() + (testServerTokenResponse.expires_in * 1000)),
                account: testAccount,
                tokenType: AuthenticationScheme.BEARER
            };
            const createAcqTokenStub = sinon.stub(AuthorizationCodeClient.prototype, "getAuthCodeUrl").resolves(testNavUrl);
            const silentTokenHelperStub = sinon.stub(pca, <any>"silentTokenHelper").resolves(testTokenResponse);
            sinon.stub(CryptoOps.prototype, "generatePkceCodes").resolves({
                challenge: TEST_CONFIG.TEST_CHALLENGE,
                verifier: TEST_CONFIG.TEST_VERIFIER
            });
            sinon.stub(CryptoOps.prototype, "createNewGuid").returns(RANDOM_TEST_GUID);
            sinon.stub(ProtocolUtils, "setRequestState").returns(TEST_STATE_VALUES.TEST_STATE);
            const silentFlowRequest: SilentFlowRequest = {
                scopes: ["User.Read"],
                account: testAccount
            };
            const expectedRequest: AuthorizationUrlRequest = {
                ...silentFlowRequest,
                scopes: ["User.Read"],
                authority: `${Constants.DEFAULT_AUTHORITY}`,
                correlationId: RANDOM_TEST_GUID,
                prompt: "none",
                redirectUri: TEST_URIS.TEST_REDIR_URI,
                state: TEST_STATE_VALUES.TEST_STATE,
                nonce: RANDOM_TEST_GUID,
                responseMode: ResponseMode.FRAGMENT,
                codeChallenge: TEST_CONFIG.TEST_CHALLENGE,
                codeChallengeMethod: Constants.S256_CODE_CHALLENGE_METHOD
            };
            const tokenResp = await pca.acquireTokenSilent(silentFlowRequest);

            expect(tokenResp).to.be.deep.eq(testTokenResponse);
            expect(createAcqTokenStub.calledWith(expectedRequest)).to.be.true;
            expect(silentTokenHelperStub.calledWith(testNavUrl)).to.be.true;
        });
    });

    describe("logout", () => {

        it("passes logoutUri from authModule to window nav util", (done) => {
            const logoutUriSpy = sinon.stub(AuthorizationCodeClient.prototype, "getLogoutUri").returns(testLogoutUrl);
            sinon.stub(BrowserUtils, "navigateWindow").callsFake((urlNavigate: string, noHistory: boolean) => {
                expect(urlNavigate).to.be.eq(testLogoutUrl);
                expect(noHistory).to.be.undefined;
                done();
            });
            pca.logout();
            const validatedLogoutRequest: EndSessionRequest = {
                correlationId: RANDOM_TEST_GUID,
                authority: `${Constants.DEFAULT_AUTHORITY}`,
                postLogoutRedirectUri: TEST_URIS.TEST_REDIR_URI
            };
            expect(logoutUriSpy.calledWith(validatedLogoutRequest));
        });
    });

    describe("getAccount tests", () => {
        // Account 1
        const testAccountInfo1: AccountInfo = {
            homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
            environment: "login.windows.net",
            tenantId: TEST_DATA_CLIENT_INFO.TEST_UTID,
            username: "example@microsoft.com",
            name: "Abe Lincoln"
        };

        const testAccount1: AccountEntity = new AccountEntity();
        testAccount1.homeAccountId = testAccountInfo1.homeAccountId;
        testAccount1.environment = testAccountInfo1.environment;
        testAccount1.realm = testAccountInfo1.tenantId;
        testAccount1.username = testAccountInfo1.username;
        testAccount1.name = testAccountInfo1.name;
        testAccount1.authorityType = "MSSTS";
        testAccount1.clientInfo = TEST_DATA_CLIENT_INFO.TEST_CLIENT_INFO_B64ENCODED;

        // Account 2
        const testAccountInfo2: AccountInfo = {
            homeAccountId: "different-home-account-id",
            environment: "login.windows.net",
            tenantId: TEST_DATA_CLIENT_INFO.TEST_UTID,
            username: "anotherExample@microsoft.com",
            name: "Abe Lincoln"
        };

        const testAccount2: AccountEntity = new AccountEntity();
        testAccount2.homeAccountId = testAccountInfo2.homeAccountId;
        testAccount2.environment = testAccountInfo2.environment;
        testAccount2.realm = testAccountInfo2.tenantId;
        testAccount2.username = testAccountInfo2.username;
        testAccount2.name = testAccountInfo2.name;
        testAccount2.authorityType = "MSSTS";
        testAccount2.clientInfo = TEST_DATA_CLIENT_INFO.TEST_CLIENT_INFO_B64ENCODED;

        beforeEach(() => {
            const cacheKey1 = AccountEntity.generateAccountCacheKey(testAccountInfo1);
            window.sessionStorage.setItem(cacheKey1, JSON.stringify(testAccount1));

            const cacheKey2 = AccountEntity.generateAccountCacheKey(testAccountInfo2);
            window.sessionStorage.setItem(cacheKey2, JSON.stringify(testAccount2));
        });
        
        afterEach(() => {
            window.sessionStorage.clear();
        });

        it("getAllAccounts returns all signed in accounts", () => {
            const account = pca.getAllAccounts();
            expect(account).to.be.length(2);
        });

        it("getAllAccounts returns empty array if no accounts signed in", () => {
            window.sessionStorage.clear();
            const accounts = pca.getAllAccounts();
            expect(accounts).to.deep.eq([]);
        });

        it("getAccountByUsername returns account specified", () => {
            const account = pca.getAccountByUsername("example@microsoft.com");
            expect(account).to.deep.eq(testAccountInfo1);
        });

        it("getAccountByUsername returns account specified with case mismatch", () => {
            const account = pca.getAccountByUsername("Example@Microsoft.com");
            expect(account).to.deep.eq(testAccountInfo1);

            const account2 = pca.getAccountByUsername("anotherexample@microsoft.com");
            expect(account2).to.deep.eq(testAccountInfo2);
        });

        it("getAccountByUsername returns null if account doesn't exist", () => {
            const account = pca.getAccountByUsername("this-email-doesnt-exist@microsoft.com");
            expect(account).to.be.null;
        });

        it("getAccountByUsername returns null if passed username is null", () => {
            const account = pca.getAccountByUsername(null);
            expect(account).to.be.null;
        });

        it("getAccountByHomeId returns account specified", () => {
            const account = pca.getAccountByHomeId(TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID);
            expect(account).to.deep.eq(testAccountInfo1);
        });

        it("getAccountByHomeId returns null if passed id doesn't exist", () => {
            const account = pca.getAccountByHomeId("this-id-doesnt-exist");
            expect(account).to.be.null;
        });

        it("getAccountByHomeId returns null if passed id is null", () => {
            const account = pca.getAccountByHomeId(null);
            expect(account).to.be.null;
        });
    });
});
