import { StoreView } from '@/components/mall/store-view';
import { storeBySlug } from '@/lib/mall/catalog';

export const metadata = { title: 'FreshCart Groceries' };

export default function FreshCartPage() {
  return <StoreView store={storeBySlug('freshcart')!} />;
}
