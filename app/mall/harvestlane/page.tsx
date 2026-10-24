import { StoreView } from '@/components/mall/store-view';
import { storeBySlug } from '@/lib/mall/catalog';

export const metadata = { title: 'Harvest Lane Market' };

export default function HarvestLanePage() {
  return <StoreView store={storeBySlug('harvestlane')!} />;
}
