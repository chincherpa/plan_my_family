# Invite-Funktion für Familienmitglieder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Familienmitglied kann einen Einladungslink erzeugen, über den ein neuer Auth-User sich registriert und dabei automatisch als verknüpftes Mitglied (`family_members.user_id` gesetzt) zur bestehenden Familie hinzugefügt wird — statt aktuell jeder neue User zwingend seine eigene neue Familie zu gründen.

**Architecture:** Neue Tabelle `family_invites` (Code, Ablauf, Einmal-Nutzung) plus zwei `SECURITY DEFINER`-Postgres-Funktionen (`check_invite_valid`, `accept_invite`), die als einzige kontrollierte Einstiegspunkte für Fremd-Familien-Beitritt dienen. Die bestehende `members_insert`-RLS-Policy wird gleichzeitig verschärft, weil sie aktuell jedem eingeloggten User erlaubt, sich per bekannter `family_id` selbst in eine beliebige Familie einzutragen. UI-seitig: ein "Einladen"-Dialog in den Mitglieder-Einstellungen sowie eine neue `/join`-Seite, die den Registrierungs-Flow für eingeladene User abbildet.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + Auth + RLS), Zustand, TypeScript. Kein automatisiertes Test-Framework im Projekt vorhanden — Verifikation erfolgt per SQL-Check gegen die Supabase-Instanz und manuell im Browser (`pnpm dev`), passend zum bestehenden Projekt-Workflow.

## Global Constraints

- Supabase-Projekt: `gciyahpatcawiyhbwvkq` ("family planner Project"), erreichbar über die Supabase-MCP-Tools in dieser Session.
- Migration-Dateien folgen bestehender Nummerierung in `supabase/migrations/` (zuletzt `004_calendar_hours.sql`) → neue Datei `005_family_invites.sql`.
- `src/lib/supabase/types.ts` ist manuell gepflegt (kein `supabase gen types`) — Änderungen dort von Hand, im Stil der bestehenden Table-Definitionen.
- Alle UI-Texte auf Deutsch, konsistent mit bestehenden Screens (`register/page.tsx`, `MembersSettings.tsx`).
- Farbwahl für per Invite erstellte Mitglieder: zufällig aus `PRESET_COLORS`, da vor dem Beitritt (RLS) nicht abfragbar ist, welche Farben in der Zielfamilie bereits vergeben sind. Nach dem Beitritt über den bestehenden "Mitglied bearbeiten"-Dialog änderbar.
- Per Invite erstellte Mitglieder erhalten `is_guardian: false` (Standard der Spalte) — kann danach über den bestehenden Bearbeiten-Dialog von einem Guardian umgestellt werden.

---

### Task 1: Datenbank-Migration — `family_invites` Tabelle, RLS, RPC-Funktionen, Security-Fix

**Files:**
- Create: `supabase/migrations/005_family_invites.sql`

**Interfaces:**
- Produces: Tabelle `public.family_invites(id, family_id, code, created_by, expires_at, used_at, used_by, created_at)`; RPC `check_invite_valid(invite_code text) returns boolean`; RPC `accept_invite(invite_code text, member_name text, member_color text) returns family_members` (Single-Row-Objekt, kein Array — `returns family_members`, nicht `setof`); verschärfte `members_insert`-Policy auf `family_members`.

- [ ] **Step 1: Migration-SQL-Datei schreiben**

```sql
-- supabase/migrations/005_family_invites.sql

-- 1. Tabelle
create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table family_invites enable row level security;

create policy invites_select on family_invites
  for select using (family_id in (select get_my_family_ids()));

create policy invites_insert on family_invites
  for insert with check (family_id in (select get_my_family_ids()));

create policy invites_update on family_invites
  for update using (family_id in (select get_my_family_ids()));

-- 2. Public check (kein Login nötig, keine Details preisgeben)
create or replace function check_invite_valid(invite_code text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from family_invites
    where code = invite_code and used_at is null and expires_at > now()
  );
$$;
grant execute on function check_invite_valid(text) to anon, authenticated;

-- 3. Invite annehmen (atomar, race-condition-sicher via FOR UPDATE)
create or replace function accept_invite(invite_code text, member_name text, member_color text)
returns family_members
language plpgsql security definer set search_path = public as $$
declare
  inv family_invites%rowtype;
  new_member family_members%rowtype;
begin
  select * into inv from family_invites
    where code = invite_code and used_at is null and expires_at > now()
    for update;

  if not found then
    raise exception 'invite_invalid';
  end if;

  insert into family_members (family_id, name, color, user_id, sort_order)
  values (
    inv.family_id, member_name, member_color, auth.uid(),
    (select coalesce(max(sort_order) + 1, 0) from family_members where family_id = inv.family_id)
  )
  returning * into new_member;

  update family_invites set used_at = now(), used_by = auth.uid() where id = inv.id;

  return new_member;
end;
$$;
grant execute on function accept_invite(text, text, text) to authenticated;

-- 4. Security-Fix: members_insert verschärfen
-- Vorher erlaubte "(user_id = auth.uid())" ohne family_id-Einschränkung jedem
-- eingeloggten User, sich per bekannter family_id in eine beliebige fremde
-- Familie einzutragen. Self-Insert bleibt nur noch beim Bootstrap einer
-- brandneuen, leeren Familie erlaubt (Registrierungs-Flow); Beitritt zu einer
-- bestehenden Familie läuft ab jetzt ausschließlich über accept_invite().
drop policy members_insert on family_members;

create policy members_insert on family_members
  for insert with check (
    (
      user_id = auth.uid()
      and not exists (
        select 1 from family_members fm where fm.family_id = family_members.family_id
      )
    )
    or family_id in (select get_my_family_ids())
  );
```

- [ ] **Step 2: Migration auf Supabase-Projekt anwenden**

Über das Supabase-MCP-Tool `apply_migration` mit `project_id: "gciyahpatcawiyhbwvkq"`, `name: "family_invites"` und dem SQL-Inhalt aus Step 1 anwenden (kein lokal gelinktes CLI-Projekt vorhanden — `supabase/config.toml` existiert nicht, bisherige Migrationen 002–004 wurden ebenso remote angewendet).

- [ ] **Step 3: Verifikation per SQL**

Über das Supabase-MCP-Tool `execute_sql` mit `project_id: "gciyahpatcawiyhbwvkq"`:

```sql
select policyname, cmd from pg_policies where tablename = 'family_invites' order by policyname;
```
Erwartet: 3 Zeilen (`invites_select`, `invites_insert`, `invites_update`).

```sql
select with_check from pg_policies where tablename = 'family_members' and policyname = 'members_insert';
```
Erwartet: enthält `not exists` — bestätigt, dass die alte Policy ersetzt wurde.

```sql
select check_invite_valid('does-not-exist');
```
Erwartet: `false`.

```sql
select accept_invite('does-not-exist', 'Test', '#000000');
```
Erwartet: Fehler `invite_invalid` (kein neuer `family_members`-Eintrag).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_family_invites.sql
git commit -m "feat: add family_invites table, invite RPCs, tighten members_insert RLS"
```

---

### Task 2: TypeScript-Typen für `family_invites` und die RPC-Funktionen

**Files:**
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Consumes: Spalten von `public.family_invites` und Signaturen von `check_invite_valid`/`accept_invite` aus Task 1.
- Produces: `Database["public"]["Tables"]["family_invites"]`, `Database["public"]["Functions"]`, Export `FamilyInvite`.

- [ ] **Step 1: `family_invites`-Tabellen-Typ einfügen**

In `src/lib/supabase/types.ts` nach dem Block `appointment_participants: { ... },` (vor der schließenden `};` von `Tables`) einfügen:

```typescript
      family_invites: {
        Row: {
          id: string;
          family_id: string;
          code: string;
          created_by: string | null;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          code: string;
          created_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          code?: string;
          created_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 2: `Functions`-Typ von `Record<string, never>` auf konkrete RPCs umstellen**

Ersetze in `src/lib/supabase/types.ts`:
```typescript
    Functions: Record<string, never>;
```
mit:
```typescript
    Functions: {
      check_invite_valid: {
        Args: { invite_code: string };
        Returns: boolean;
      };
      accept_invite: {
        Args: { invite_code: string; member_name: string; member_color: string };
        Returns: Database["public"]["Tables"]["family_members"]["Row"];
      };
    };
```

- [ ] **Step 3: Convenience-Type exportieren**

Nach `export type AppointmentParticipant = Database["public"]["Tables"]["appointment_participants"]["Row"];` einfügen:
```typescript
export type FamilyInvite = Database["public"]["Tables"]["family_invites"]["Row"];
```

- [ ] **Step 4: TypeScript-Compile-Check**

Run: `cd d:/Projects/plan_my_family && npx tsc --noEmit`
Erwartet: keine neuen Fehler in `src/lib/supabase/types.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add TypeScript types for family_invites table and invite RPCs"
```

---

### Task 3: Gemeinsame `PRESET_COLORS`-Konstante

**Files:**
- Create: `src/lib/constants.ts`
- Modify: `src/components/settings/MembersSettings.tsx:34-37`

**Interfaces:**
- Produces: `PRESET_COLORS: string[]` (8 Hex-Farben), exportiert aus `@/lib/constants`.

- [ ] **Step 1: Konstante extrahieren**

`src/lib/constants.ts` neu anlegen:
```typescript
export const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];
```

- [ ] **Step 2: `MembersSettings.tsx` auf den Import umstellen**

In `src/components/settings/MembersSettings.tsx` die lokale Definition (Zeilen 34-37):
```typescript
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];
```
ersetzen durch einen Import direkt unter den bestehenden `@/lib/...`-Imports (z.B. nach `import type { FamilyMember } from "@/lib/supabase/types";`):
```typescript
import { PRESET_COLORS } from "@/lib/constants";
```

- [ ] **Step 3: Compile-Check**

Run: `cd d:/Projects/plan_my_family && npx tsc --noEmit`
Erwartet: keine Fehler, insbesondere kein doppeltes `PRESET_COLORS`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/constants.ts src/components/settings/MembersSettings.tsx
git commit -m "refactor: extract PRESET_COLORS into shared constants module"
```

---

### Task 4: Invite-Erstellung — `InviteDialog` + Einbindung in `MembersSettings`

**Files:**
- Create: `src/components/settings/InviteDialog.tsx`
- Modify: `src/components/settings/MembersSettings.tsx`

**Interfaces:**
- Consumes: `FamilyInvite` Type (Task 2), Tabelle `family_invites` (Task 1), bestehende UI-Primitives `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` aus `@/components/ui/dialog`, `Button` aus `@/components/ui/button`.
- Produces: `export default function InviteDialog({ familyId, open, onOpenChange }: { familyId: string; open: boolean; onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: `InviteDialog.tsx` schreiben**

```typescript
"use client";
import { useEffect, useState } from "react";
import { Copy, Check, Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FamilyInvite } from "@/lib/supabase/types";

function generateCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export default function InviteDialog({
  familyId,
  open,
  onOpenChange,
}: {
  familyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadInvites();
  }, [open]);

  async function loadInvites() {
    const supabase = createClient();
    const { data } = await supabase
      .from("family_invites")
      .select("*")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (data) setInvites(data as FamilyInvite[]);
  }

  async function handleCreate() {
    setLoading(true);
    const supabase = createClient();
    let code = generateCode();
    let { error } = await supabase.from("family_invites").insert({ family_id: familyId, code });

    if (error) {
      // Unique-Constraint-Kollision (sehr selten bei 8 Zeichen) — einmal neu versuchen
      code = generateCode();
      ({ error } = await supabase.from("family_invites").insert({ family_id: familyId, code }));
    }

    if (!error) await loadInvites();
    setLoading(false);
  }

  async function handleRevoke(id: string) {
    const supabase = createClient();
    await supabase
      .from("family_invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", id);
    await loadInvites();
  }

  async function handleCopy(code: string, id: string) {
    const link = `${window.location.origin}/join?code=${code}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mitglied einladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Erstelle einen Link und teile ihn mit der Person, die du einladen möchtest.
            Der Link ist 7 Tage gültig und einmalig nutzbar.
          </p>

          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? "Erstelle..." : "Neuen Einladungslink erstellen"}
          </Button>

          {invites.length > 0 && (
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-2 p-2 rounded-md border border-[var(--border)] bg-[var(--card)]"
                >
                  <code className="flex-1 text-xs truncate">
                    {`${window.location.origin}/join?code=${invite.code}`}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => handleCopy(invite.code, invite.id)}>
                    {copiedId === invite.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(invite.id)}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: In `MembersSettings.tsx` einbinden**

Import-Zeile ergänzen (nach `import { Plus, Pencil, Trash2, ChevronLeft, GripVertical } from "lucide-react";`):
```typescript
import { UserPlus } from "lucide-react";
```
und nach `import type { FamilyMember } from "@/lib/supabase/types";`:
```typescript
import InviteDialog from "./InviteDialog";
```

Im Component-Body von `MembersSettings`, nach der bestehenden Zeile `const [dialogOpen, setDialogOpen] = useState(false);`, neuen State ergänzen:
```typescript
const [inviteOpen, setInviteOpen] = useState(false);
```

Den bestehenden "Mitglied hinzufügen"-Button (aktuell):
```tsx
      <Button onClick={openCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        Mitglied hinzufügen
      </Button>
```
ersetzen durch:
```tsx
      <div className="flex gap-2">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Mitglied hinzufügen
        </Button>
        <Button onClick={() => setInviteOpen(true)} variant="outline" className="gap-2" disabled={!family}>
          <UserPlus className="w-4 h-4" />
          Einladen
        </Button>
      </div>
```

Direkt vor dem schließenden `</div>` der Komponente (nach dem bestehenden `<Dialog>...</Dialog>`-Block für Mitglied bearbeiten/erstellen) einfügen:
```tsx
      {family && (
        <InviteDialog familyId={family.id} open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
```

- [ ] **Step 3: Manuelle Verifikation im Browser**

Run: `cd d:/Projects/plan_my_family && pnpm dev`
- `/settings/members` öffnen, eingeloggt mit bestehendem Test-Account
- "Einladen" klicken → Dialog öffnet sich
- "Neuen Einladungslink erstellen" klicken → Link erscheint in der Liste
- Kopier-Button klicken → Zwischenablage enthält `http://localhost:3000/join?code=...` (Häkchen-Icon erscheint kurz)
- "Widerrufen" klicken → Eintrag verschwindet aus der Liste
- Erneut per SQL prüfen (`execute_sql`, `project_id: "gciyahpatcawiyhbwvkq"`): `select code, expires_at, used_at from family_invites order by created_at desc limit 5;` — bestätigt, dass Zeilen angelegt wurden und der widerrufene Eintrag ein `expires_at` in der Vergangenheit hat

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/InviteDialog.tsx src/components/settings/MembersSettings.tsx
git commit -m "feat: add invite link creation UI to family members settings"
```

---

### Task 5: Invite-Annahme — `/join`-Seite + Middleware-Freigabe

**Files:**
- Create: `src/app/(auth)/join/page.tsx`
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `PRESET_COLORS` (Task 3), RPC-Typen `check_invite_valid`/`accept_invite` (Task 2), `FamilyMember` Type aus `@/lib/supabase/types`.
- Produces: Route `/join?code=XXXX`.

- [ ] **Step 1: `proxy.ts` anpassen — `/join` von der Auth-Weiterleitung ausnehmen**

Aktuell in `src/proxy.ts`:
```typescript
  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/calendar";
    return NextResponse.redirect(url);
  }
```
Ersetzen durch (neue Variable `isJoinPage`, die von **beiden** Redirect-Zweigen ausgenommen wird — nicht eingeloggte User dürfen `/join` sehen, eingeloggte User werden dort nicht automatisch zu `/calendar` weitergeleitet, weil die Seite selbst entscheidet, ob der User bereits Mitglied ist):
```typescript
  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");
  const isJoinPage = request.nextUrl.pathname.startsWith("/join");

  if (!user && !isAuthPage && !isJoinPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/calendar";
    return NextResponse.redirect(url);
  }
```

- [ ] **Step 2: `/join`-Seite schreiben**

`src/app/(auth)/join/page.tsx` neu anlegen:
```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";
import { PRESET_COLORS } from "@/lib/constants";
import type { FamilyMember } from "@/lib/supabase/types";

type CheckState = "checking" | "valid" | "invalid";
type UserState = "checking" | "anonymous" | "already_member" | "ready_to_join";

function randomPresetColor(): string {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
}

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [checkState, setCheckState] = useState<CheckState>("checking");
  const [userState, setUserState] = useState<UserState>("checking");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      if (!code) {
        setCheckState("invalid");
        return;
      }
      const supabase = createClient();

      const { data: isValid } = await supabase.rpc("check_invite_valid", { invite_code: code });
      setCheckState(isValid ? "valid" : "invalid");
      if (!isValid) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUserState("anonymous");
        return;
      }

      const { data: existingMember } = await supabase
        .from("family_members")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      setUserState(existingMember ? "already_member" : "ready_to_join");
    }
    init();
  }, [code]);

  async function acceptInvite(memberName: string): Promise<boolean> {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("accept_invite", {
      invite_code: code,
      member_name: memberName,
      member_color: randomPresetColor(),
    });
    const member = data as FamilyMember | null;

    if (rpcError || !member) {
      setError("Dieser Einladungslink wurde bereits verwendet oder ist abgelaufen.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (userState !== "ready_to_join") return;
    async function autoJoin() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const ok = await acceptInvite(user.email?.split("@")[0] ?? "Mitglied");
      if (ok) {
        router.push("/calendar");
        router.refresh();
      }
    }
    autoJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userState]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError || !authData.user) {
      setError(authError?.message ?? "Registrierung fehlgeschlagen");
      setLoading(false);
      return;
    }

    if (!authData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Bitte bestätige deine E-Mail und öffne diesen Link danach erneut.");
        setLoading(false);
        return;
      }
    }

    const ok = await acceptInvite(name || email.split("@")[0]);
    setLoading(false);
    if (ok) {
      router.push("/calendar");
      router.refresh();
    }
  }

  if (checkState === "checking" || userState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <p className="text-[var(--muted-foreground)]">Lädt...</p>
      </div>
    );
  }

  if (checkState === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold">Ungültiger Einladungslink</h1>
          <p className="text-[var(--muted-foreground)] text-sm">
            Dieser Link ist ungültig oder abgelaufen. Bitte frage nach einem neuen Einladungslink.
          </p>
          <a href="/login" className="text-[var(--primary)] hover:underline text-sm">
            Zur Anmeldung
          </a>
        </div>
      </div>
    );
  }

  if (userState === "already_member") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold">Du bist bereits Mitglied einer Familie</h1>
          <p className="text-[var(--muted-foreground)] text-sm">
            Ein Konto kann aktuell nur einer Familie angehören.
          </p>
          <a href="/calendar" className="text-[var(--primary)] hover:underline text-sm">
            Zum Kalender
          </a>
        </div>
      </div>
    );
  }

  if (userState === "ready_to_join") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <p className="text-[var(--muted-foreground)]">Familie wird beigetreten...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--primary)] text-white">
            <Calendar className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold">Familie beitreten</h1>
          <p className="text-[var(--muted-foreground)] text-sm">Du wurdest zu einer Familie eingeladen</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Dein Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Papa"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="familie@beispiel.de"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Tritt bei..." : "Familie beitreten"}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Compile-Check**

Run: `cd d:/Projects/plan_my_family && npx tsc --noEmit`
Erwartet: keine Fehler.

- [ ] **Step 4: End-to-End-Verifikation im Browser**

Run: `cd d:/Projects/plan_my_family && pnpm dev`

1. Im normalen Browser-Fenster (eingeloggter Test-Account): `/settings/members` → "Einladen" → Link kopieren, Code aus dem Link merken (z.B. `abc12345`)
2. Neues Inkognito-Fenster öffnen, `http://localhost:3000/join?code=abc12345` aufrufen
   - Erwartet: Formular "Familie beitreten" erscheint (kein Redirect zu `/login`)
3. Formular mit neuer Test-E-Mail/Passwort/Name ausfüllen, absenden
   - Erwartet: Redirect zu `/calendar`, Kalender zeigt Termine/Mitglieder der eingeladenen Familie
4. Per SQL prüfen (`execute_sql`, `project_id: "gciyahpatcawiyhbwvkq"`): `select id, family_id, user_id, name from family_members order by created_at desc limit 3;` — neuer Eintrag mit gesetztem `user_id` und korrekter `family_id`
   - `select used_at, used_by from family_invites where code = 'abc12345';` — `used_at`/`used_by` gesetzt
5. Denselben Link (`/join?code=abc12345`) erneut in einem weiteren Inkognito-Fenster öffnen
   - Erwartet: "Ungültiger Einladungslink" (Code bereits verbraucht)
6. Im ursprünglichen eingeloggten Fenster (andere Familie) einen frischen Invite-Link derselben Familie öffnen, während man selbst bereits Mitglied ist
   - Erwartet: "Du bist bereits Mitglied einer Familie"

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/join/page.tsx src/proxy.ts
git commit -m "feat: add /join page for accepting family invites"
```

---

## Spec Coverage Check

- Datenmodell `family_invites` → Task 1 ✅
- `check_invite_valid` / `accept_invite` RPCs → Task 1 ✅
- Security-Fix `members_insert` → Task 1 ✅
- Invite erstellen (UI in MembersSettings) → Task 4 ✅
- Invite annehmen (`/join`-Seite, inkl. Middleware-Freigabe) → Task 5 ✅
- Fehlerfälle (ungültiger Code, bereits Mitglied) → Task 5 ✅
- Migration-Datei `005_family_invites.sql` → Task 1 ✅
