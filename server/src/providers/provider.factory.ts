import { ICloudProvider } from './provider.interface';
import { GoogleDriveProvider } from './google.provider';
import { AppError } from '../utils/AppError';

export class ProviderFactory {
  static getProvider(providerName: string): ICloudProvider {
    switch (providerName) {
      case 'google-drive':
        return new GoogleDriveProvider();
      // Add future providers here
      // case 'onedrive':
      //   return new OneDriveProvider();
      default:
        throw new AppError(`Provider ${providerName} is not supported`, 400);
    }
  }
}
