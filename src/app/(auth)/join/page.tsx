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
