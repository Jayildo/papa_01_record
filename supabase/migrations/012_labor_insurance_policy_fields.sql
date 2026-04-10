alter table public.labor_workers
  add column if not exists employment_duration_type text not null default 'under_1_month',
  add column if not exists workplace_type text not null default 'construction',
  add column if not exists monthly_hours numeric not null default 0;

alter table public.labor_workers
  drop constraint if exists labor_workers_employment_duration_type_check,
  add constraint labor_workers_employment_duration_type_check
    check (employment_duration_type in ('under_1_month', 'one_month_or_more'));

alter table public.labor_workers
  drop constraint if exists labor_workers_workplace_type_check,
  add constraint labor_workers_workplace_type_check
    check (workplace_type in ('construction', 'general'));
