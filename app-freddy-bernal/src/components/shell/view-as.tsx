'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABEL, TEAM_ROLES, type Role } from '@/lib/roles';
import { setViewAs } from '@/lib/actions/view-as';

// Admin-only: the six team roles. Changes which menus are shown, never what can be read or changed.
export function ViewAs({ current }: { current: Role | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="label-caps hidden xl:inline">Ver como</span>
      <select
        aria-label="Ver como"
        disabled={pending}
        value={current ?? ''}
        onChange={(e) =>
          start(async () => {
            await setViewAs(e.target.value || null);
            router.refresh();
          })
        }
        className="min-h-9 rounded-[var(--radius-control)] border border-border bg-surface px-2 text-sm"
      >
        <option value="">Mi vista</option>
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
