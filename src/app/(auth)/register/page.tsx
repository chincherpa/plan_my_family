"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [myName, setMyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // 1. Sign up
    console.log("[Register] 1. signUp →", email);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    console.log("[Register] signUp result — user:", authData.user?.id, "session:", !!authData.session, "error:", authError);

    if (authError || !authData.user) {
      setError(authError?.message ?? "Registrierung fehlgeschlagen");
      setLoading(false);
      return;
    }

    // If email confirmation is required, signUp returns no session → sign in explicitly
    if (!authData.session) {
      console.log("[Register] Keine Session nach signUp → versuche signIn");
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      console.log("[Register] signIn result — session:", !!signInData.session, "error:", signInError);
      if (signInError) {
        setError("Bitte bestätige deine E-Mail und melde dich danach an.");
        setLoading(false);
        return;
      }
    }

    // Check active session before DB writes
    const { data: { session } } = await supabase.auth.getSession();
    console.log("[Register] 2. aktive Session vor DB-Insert:", !!session, "uid:", session?.user?.id);

    // 2. Create family (UUID client-side — kein .select() nötig, da SELECT-Policy den neuen User noch nicht kennt)
    const familyId = crypto.randomUUID();
    console.log("[Register] 3. families.insert →", familyName || "Meine Familie", "id:", familyId);
    const { error: familyError } = await supabase
      .from("families")
      .insert({ id: familyId, name: familyName || "Meine Familie" });
    console.log("[Register] families.insert error:", familyError);

    if (familyError) {
      setError("Familie konnte nicht erstellt werden");
      setLoading(false);
      return;
    }
    const family = { id: familyId };

    // 3. Create first family member (the user themselves)
    console.log("[Register] 4. family_members.insert → family:", family.id, "user:", authData.user.id);
    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: family.id,
      name: myName || email.split("@")[0],
      color: "#3b82f6",
      is_guardian: true,
      user_id: authData.user.id,
      sort_order: 0,
    });
    console.log("[Register] family_members.insert error:", memberError);

    if (memberError) {
      setError("Familienmitglied konnte nicht erstellt werden");
      setLoading(false);
      return;
    }

    router.push("/calendar");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--primary)] text-white">
            <Calendar className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold">Familie anlegen</h1>
          <p className="text-[var(--muted-foreground)] text-sm">Erstelle dein Familienkonto</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="familyName">Familienname</Label>
            <Input
              id="familyName"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Familie Müller"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="myName">Dein Name</Label>
            <Input
              id="myName"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="z.B. Mama"
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
            {loading ? "Wird erstellt..." : "Familie erstellen"}
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--muted-foreground)]">
          Bereits registriert?{" "}
          <a href="/login" className="text-[var(--primary)] hover:underline">
            Anmelden
          </a>
        </p>
      </div>
    </div>
  );
}
