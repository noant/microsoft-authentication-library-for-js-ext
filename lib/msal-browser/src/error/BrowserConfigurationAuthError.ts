/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AuthError } from "msal-common-ext";

/**
 * BrowserAuthErrorMessage class containing string constants used by error codes and messages.
 */
export const BrowserConfigurationAuthErrorMessage = {
    redirectUriNotSet: {
        code: "redirect_uri_empty",
        desc: "A redirect URI is required for all calls, and none has been set."
    },
    postLogoutUriNotSet: {
        code: "post_logout_uri_empty",
        desc: "A post logout redirect has not been set."
    },
    storageNotSupportedError: {
        code: "storage_not_supported",
        desc: "Given storage configuration option was not supported."
    },
    noRedirectCallbacksSet: {
        code: "no_redirect_callbacks",
        desc: "No redirect callbacks have been set. Please call setRedirectCallbacks() with the appropriate function arguments before continuing. " +
            "More information is available here: https://github.com/AzureAD/microsoft-authentication-library-for-js/wiki/MSAL-basics."
    },
    invalidCallbackObject: {
        code: "invalid_callback_object",
        desc: "The object passed for the callback was invalid. " +
          "More information is available here: https://github.com/AzureAD/microsoft-authentication-library-for-js/wiki/MSAL-basics."
    },
};

/**
 * Browser library error class thrown by the MSAL.js library for SPAs
 */
export class BrowserConfigurationAuthError extends AuthError {

    constructor(errorCode: string, errorMessage?: string) {
        super(errorCode, errorMessage);
        this.name = "BrowserConfigurationAuthError";

        Object.setPrototypeOf(this, BrowserConfigurationAuthError.prototype);
    }

    /**
     * Creates an error thrown when the redirect uri is empty (not set by caller)
     */
    static createRedirectUriEmptyError(): BrowserConfigurationAuthError {
        return new BrowserConfigurationAuthError(BrowserConfigurationAuthErrorMessage.redirectUriNotSet.code,
            BrowserConfigurationAuthErrorMessage.redirectUriNotSet.desc);
    }

    /**
     * Creates an error thrown when the post-logout redirect uri is empty (not set by caller)
     */
    static createPostLogoutRedirectUriEmptyError(): BrowserConfigurationAuthError {
        return new BrowserConfigurationAuthError(BrowserConfigurationAuthErrorMessage.postLogoutUriNotSet.code,
            BrowserConfigurationAuthErrorMessage.postLogoutUriNotSet.desc);
    }

    /**
     * Creates error thrown when given storage location is not supported.
     * @param givenStorageLocation 
     */
    static createStorageNotSupportedError(givenStorageLocation: string): BrowserConfigurationAuthError {
        return new BrowserConfigurationAuthError(BrowserConfigurationAuthErrorMessage.storageNotSupportedError.code, `${BrowserConfigurationAuthErrorMessage.storageNotSupportedError.desc} Given Location: ${givenStorageLocation}`);
    }

    /**
     * Creates error thrown when callback object is invalid.
     * @param callbackObject 
     */
    static createInvalidCallbackObjectError(callbackObject: object): BrowserConfigurationAuthError {
        return new BrowserConfigurationAuthError(BrowserConfigurationAuthErrorMessage.invalidCallbackObject.code,
            `${BrowserConfigurationAuthErrorMessage.invalidCallbackObject.desc} Given value for callback function: ${callbackObject}`);
    }

    /**
     * Creates error thrown when redirect callbacks are not set before calling loginRedirect() or acquireTokenRedirect().
     */
    static createRedirectCallbacksNotSetError(): BrowserConfigurationAuthError {
        return new BrowserConfigurationAuthError(BrowserConfigurationAuthErrorMessage.noRedirectCallbacksSet.code, 
            BrowserConfigurationAuthErrorMessage.noRedirectCallbacksSet.desc);
    }
}
