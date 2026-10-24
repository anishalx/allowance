import { DealsView } from '@/components/mall/deals-view';
import { storeBySlug } from '@/lib/mall/catalog';

export const metadata = { title: "This week's deals · FreshCart" };

export default function FreshCartDealsPage() {
  return <DealsView store={storeBySlug('freshcart')!} />;
}
