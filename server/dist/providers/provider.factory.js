"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFactory = void 0;
const google_provider_1 = require("./google.provider");
const onedrive_provider_1 = require("./onedrive.provider");
const dropbox_provider_1 = require("./dropbox.provider");
const AppError_1 = require("../utils/AppError");
class ProviderFactory {
    static getProvider(providerName) {
        switch (providerName) {
            case 'google-drive':
                return new google_provider_1.GoogleDriveProvider();
            case 'onedrive':
                return new onedrive_provider_1.OneDriveProvider();
            case 'dropbox':
                return new dropbox_provider_1.DropboxProvider();
            default:
                throw new AppError_1.AppError(`Provider ${providerName} is not supported`, 400);
        }
    }
}
exports.ProviderFactory = ProviderFactory;
