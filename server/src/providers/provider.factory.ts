import { ICloudProvider } from './provider.interface';
import { GoogleDriveProvider } from './google.provider';
import { OneDriveProvider } from './onedrive.provider';
import { DropboxProvider } from './dropbox.provider';
import { AppError } from '../utils/AppError';

export class ProviderFactory {
  static getProvider(providerName: string): ICloudProvider {
    switch (providerName) {
      case 'google-drive':
        return new GoogleDriveProvider();
      case 'onedrive':
        return new OneDriveProvider();
      case 'dropbox':
        return new DropboxProvider();
      default:
        throw new AppError(`Provider ${providerName} is not supported`, 400);
    }
  }
}
