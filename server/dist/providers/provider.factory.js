"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFactory = void 0;
const google_provider_1 = require("./google.provider");
const AppError_1 = require("../utils/AppError");
class ProviderFactory {
    static getProvider(providerName) {
        switch (providerName) {
            case 'google-drive':
                return new google_provider_1.GoogleDriveProvider();
            // Add future providers here
            // case 'onedrive':
            //   return new OneDriveProvider();
            default:
                throw new AppError_1.AppError(`Provider ${providerName} is not supported`, 400);
        }
    }
}
exports.ProviderFactory = ProviderFactory;
