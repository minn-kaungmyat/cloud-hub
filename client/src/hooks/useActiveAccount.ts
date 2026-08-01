import { useSearchParams } from 'react-router-dom';
import { useCloudAccounts } from './useCloudAccounts';

export const useActiveAccount = (): string => {
  const [searchParams] = useSearchParams();
  const { data: accounts = [] } = useCloudAccounts();
  
  const accountParam = searchParams.get('account');
  
  if (accountParam) {
    return accountParam;
  }
  
  if (accounts.length > 0) {
    return accounts[0].id;
  }
  
  return '';
};
