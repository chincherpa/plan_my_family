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
