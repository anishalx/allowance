import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/notify';

export function GET() {
  return NextResponse.redirect(`${appUrl()}/dashboard?link=cancelled`);
}
