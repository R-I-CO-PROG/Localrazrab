import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import system from '@/data/logic/system.json';
import prompts from '@/data/logic/prompts.json';
import type { LogicDataResponse } from '@/lib/logic/types';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const payload: LogicDataResponse = {
    system: system as LogicDataResponse['system'],
    prompts: prompts as LogicDataResponse['prompts'],
  };

  return NextResponse.json(payload);
}
