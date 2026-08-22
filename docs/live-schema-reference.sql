-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.families (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  calendar_start_hour smallint NOT NULL DEFAULT 0,
  calendar_end_hour smallint NOT NULL DEFAULT 24,
  CONSTRAINT families_pkey PRIMARY KEY (id)
);
CREATE TABLE public.family_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  family_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1'::text,
  cannot_be_alone boolean NOT NULL DEFAULT false,
  is_guardian boolean NOT NULL DEFAULT false,
  user_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT family_members_pkey PRIMARY KEY (id),
  CONSTRAINT family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
  CONSTRAINT family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.vehicles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  family_id uuid NOT NULL,
  name text NOT NULL,
  icon_emoji text NOT NULL DEFAULT '🚗'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id)
);
CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  family_id uuid NOT NULL,
  title text NOT NULL,
  notes text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  travel_before_min integer NOT NULL DEFAULT 0,
  travel_after_min integer NOT NULL DEFAULT 0,
  vehicle_id uuid,
  owner_id uuid,
  is_all_family boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  recurrence_parent_id uuid,
  exception_date date,
  is_deleted boolean NOT NULL DEFAULT false,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_event boolean NOT NULL DEFAULT false,
  is_all_day boolean NOT NULL DEFAULT false,
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
  CONSTRAINT appointments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id),
  CONSTRAINT appointments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.family_members(id),
  CONSTRAINT appointments_recurrence_parent_id_fkey FOREIGN KEY (recurrence_parent_id) REFERENCES public.appointments(id)
);
CREATE TABLE public.appointment_participants (
  appointment_id uuid NOT NULL,
  member_id uuid NOT NULL,
  is_supervisor boolean NOT NULL DEFAULT false,
  CONSTRAINT appointment_participants_pkey PRIMARY KEY (appointment_id, member_id),
  CONSTRAINT appointment_participants_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),
  CONSTRAINT appointment_participants_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id)
);
CREATE TABLE public.recipes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  category text,
  CONSTRAINT recipes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.meal_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type = ANY (ARRAY['lunch'::text, 'dinner'::text])),
  recipe_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meal_plans_pkey PRIMARY KEY (id),
  CONSTRAINT meal_plans_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
  CONSTRAINT meal_plans_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.keep_alive (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  update text NOT NULL,
  CONSTRAINT keep_alive_pkey PRIMARY KEY (id)
);
CREATE TABLE public.meals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  date date NOT NULL,
  lunch text,
  dinner text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meals_pkey PRIMARY KEY (id),
  CONSTRAINT meals_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id)
);
CREATE TABLE public.family_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  created_by uuid,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  used_at timestamp with time zone,
  used_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT family_invites_pkey PRIMARY KEY (id),
  CONSTRAINT family_invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
  CONSTRAINT family_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT family_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id)
);

ALTER TABLE appointment_participants ADD CONSTRAINT appointment_participants_pkey PRIMARY KEY (appointment_id, member_id);
ALTER TABLE appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE families ADD CONSTRAINT families_pkey PRIMARY KEY (id);
ALTER TABLE family_invites ADD CONSTRAINT family_invites_pkey PRIMARY KEY (id);
ALTER TABLE family_members ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);
ALTER TABLE keep_alive ADD CONSTRAINT keep_alive_pkey PRIMARY KEY (id);
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_pkey PRIMARY KEY (id);
ALTER TABLE meals ADD CONSTRAINT meals_pkey PRIMARY KEY (id);
ALTER TABLE recipes ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);
ALTER TABLE vehicles ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);
ALTER TABLE family_invites ADD CONSTRAINT family_invites_code_key UNIQUE (code);
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_family_id_date_meal_type_key UNIQUE (family_id, date, meal_type);
ALTER TABLE meals ADD CONSTRAINT meals_family_id_date_key UNIQUE (family_id, date);
ALTER TABLE appointments ADD CONSTRAINT valid_times CHECK ((end_time > start_time));
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_meal_type_check CHECK ((meal_type = ANY (ARRAY['lunch'::text, 'dinner'::text])));
ALTER TABLE appointment_participants ADD CONSTRAINT appointment_participants_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
ALTER TABLE appointment_participants ADD CONSTRAINT appointment_participants_member_id_fkey FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD CONSTRAINT appointments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES family_members(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD CONSTRAINT appointments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD CONSTRAINT appointments_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD CONSTRAINT appointments_recurrence_parent_id_fkey FOREIGN KEY (recurrence_parent_id) REFERENCES appointments(id) ON DELETE CASCADE;
ALTER TABLE family_invites ADD CONSTRAINT family_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);
ALTER TABLE family_invites ADD CONSTRAINT family_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE family_invites ADD CONSTRAINT family_invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE family_members ADD CONSTRAINT family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE family_members ADD CONSTRAINT family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE meals ADD CONSTRAINT meals_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
