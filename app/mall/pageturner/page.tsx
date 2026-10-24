import { StoreView } from '@/components/mall/store-view';
import { storeBySlug } from '@/lib/mall/catalog';

export const metadata = { title: 'PageTurner Books' };

export default function PageTurnerPage() {
  return <StoreView store={storeBySlug('pageturner')!} />;
}
