alter table public.envelopes
add column categories text[] not null default array['Outros']::text[];

update public.envelopes
set categories = array[category]
where cardinality(categories) = 0;
