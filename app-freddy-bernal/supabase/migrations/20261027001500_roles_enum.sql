-- Hillary, 27/10/2026: two new team roles, Director de política and Director del IVT. Only the values are added
-- here; they are used from the next file on (Postgres refuses a new enum value inside the transaction that adds it).
alter type public.app_role add value if not exists 'politics' after 'dispatch';
alter type public.app_role add value if not exists 'ivt' after 'politics';
