import type { CategoryOption } from '@/lib/data/common';
import { Select } from './field';

export function CategorySelect({ categories, ...props }: { categories: CategoryOption[] } & React.ComponentProps<typeof Select>) {
  const groups = [...new Set(categories.map((c) => c.group))];
  return (
    <Select {...props}>
      <option value="">Sin categoría</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {categories.filter((c) => c.group === g).map((c) => (
            <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
