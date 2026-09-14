-- مطبخنا: multi-tenant household schema. Run with `supabase db push`.
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.household_role as enum ('owner', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete restrict,
  invite_code text not null unique default upper(encode(gen_random_bytes(8), 'hex')) check (invite_code ~ '^[A-F0-9]{16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 60),
  is_favorite boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references public.dishes(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  quantity_text text not null default '' check (char_length(quantity_text) <= 80),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_date date not null,
  dish_id uuid not null references public.dishes(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (household_id, plan_date)
);

create index household_members_user_id_idx on public.household_members(user_id);
create index dishes_household_id_idx on public.dishes(household_id);
create index ingredients_dish_position_idx on public.ingredients(dish_id, position);
create index shopping_lists_household_id_idx on public.shopping_lists(household_id);
create index shopping_items_list_id_idx on public.shopping_items(shopping_list_id);
create index meal_plan_household_date_idx on public.meal_plan(household_id, plan_date);

create or replace function private.set_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger households_updated_at before update on public.households for each row execute function private.set_updated_at();
create trigger dishes_updated_at before update on public.dishes for each row execute function private.set_updated_at();
create trigger shopping_lists_updated_at before update on public.shopping_lists for each row execute function private.set_updated_at();
create trigger shopping_items_updated_at before update on public.shopping_items for each row execute function private.set_updated_at();

-- Data ownership cannot be moved between households or authors by a client update.
create or replace function private.prevent_ownership_change() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.household_id is distinct from old.household_id or new.created_by is distinct from old.created_by then
    raise exception 'Ownership fields are immutable';
  end if;
  return new;
end;
$$;
create trigger dishes_immutable_owner before update on public.dishes for each row execute function private.prevent_ownership_change();
create trigger lists_immutable_owner before update on public.shopping_lists for each row execute function private.prevent_ownership_change();

create or replace function private.is_household_member(target_household_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = target_household_id and m.user_id = (select auth.uid()));
$$;
create or replace function private.is_household_owner(target_household_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = target_household_id and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid), private.is_household_owner(uuid) to authenticated;

-- Auth trigger deliberately runs only inside the database and creates no public write path.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), '')) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Atomic household creation and invitation join prevent client-forged roles/memberships.
create or replace function public.create_household(household_name text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare created public.households;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.households (name, owner_id) values (trim(household_name), auth.uid()) returning * into created;
  insert into public.household_members (household_id, user_id, role) values (created.id, auth.uid(), 'owner');
  return created;
end;
$$;
create or replace function public.join_household_by_code(raw_code text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare target public.households;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target from public.households where invite_code = upper(trim(raw_code));
  if target.id is null then raise exception 'Invalid invite code'; end if;
  insert into public.household_members (household_id, user_id, role) values (target.id, auth.uid(), 'member') on conflict (household_id, user_id) do nothing;
  return target;
end;
$$;
revoke all on function public.create_household(text), public.join_household_by_code(text) from public;
grant execute on function public.create_household(text), public.join_household_by_code(text) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.households, public.household_members, public.dishes, public.ingredients, public.shopping_lists, public.shopping_items, public.meal_plan to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.dishes enable row level security;
alter table public.ingredients enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_plan enable row level security;

create policy "profiles: own select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: own update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "households: members select" on public.households for select to authenticated using ((select private.is_household_member(id)));
create policy "households: owner update" on public.households for update to authenticated using ((select private.is_household_owner(id))) with check ((select private.is_household_owner(id)));
create policy "members: household select" on public.household_members for select to authenticated using ((select private.is_household_member(household_id)));
create policy "dishes: members select" on public.dishes for select to authenticated using ((select private.is_household_member(household_id)));
create policy "dishes: members insert" on public.dishes for insert to authenticated with check ((select private.is_household_member(household_id)) and (select auth.uid()) = created_by);
create policy "dishes: members update" on public.dishes for update to authenticated using ((select private.is_household_member(household_id))) with check ((select private.is_household_member(household_id)));
create policy "dishes: members delete" on public.dishes for delete to authenticated using ((select private.is_household_member(household_id)));
create policy "ingredients: members select" on public.ingredients for select to authenticated using (exists (select 1 from public.dishes d where d.id = dish_id and (select private.is_household_member(d.household_id))));
create policy "ingredients: members insert" on public.ingredients for insert to authenticated with check (exists (select 1 from public.dishes d where d.id = dish_id and (select private.is_household_member(d.household_id))));
create policy "ingredients: members update" on public.ingredients for update to authenticated using (exists (select 1 from public.dishes d where d.id = dish_id and (select private.is_household_member(d.household_id)))) with check (exists (select 1 from public.dishes d where d.id = dish_id and (select private.is_household_member(d.household_id))));
create policy "ingredients: members delete" on public.ingredients for delete to authenticated using (exists (select 1 from public.dishes d where d.id = dish_id and (select private.is_household_member(d.household_id))));
create policy "lists: members select" on public.shopping_lists for select to authenticated using ((select private.is_household_member(household_id)));
create policy "lists: members insert" on public.shopping_lists for insert to authenticated with check ((select private.is_household_member(household_id)) and (select auth.uid()) = created_by);
create policy "lists: members update" on public.shopping_lists for update to authenticated using ((select private.is_household_member(household_id))) with check ((select private.is_household_member(household_id)));
create policy "lists: members delete" on public.shopping_lists for delete to authenticated using ((select private.is_household_member(household_id)));
create policy "items: members all" on public.shopping_items for all to authenticated using (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and (select private.is_household_member(l.household_id)))) with check (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and (select private.is_household_member(l.household_id))));
create policy "plans: members all" on public.meal_plan for all to authenticated using ((select private.is_household_member(household_id))) with check ((select private.is_household_member(household_id)) and (select auth.uid()) = created_by);
