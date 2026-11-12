"use client";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useShortcutStore } from "@/lib/store/shortcutStore";
import { useKeymap } from "@/lib/shortcuts/useShortcuts";
import { SHORTCUT_ACTIONS, SHORTCUT_GROUPS } from "@/lib/shortcuts/keymap";
import Kbd from "./Kbd";

/** Übersicht aller Tastatur-Shortcuts, geöffnet mit "?" (Standard). */
export default function ShortcutHelpDialog() {
  const { isHelpOpen, setHelpOpen } = useShortcutStore();
  const keymap = useKeymap();

  return (
    <Dialog open={isHelpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tastatur-Shortcuts</DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            Gelten nicht, während du in ein Feld tippst. <Kbd combo="Escape" className="align-middle" />{" "}
            schließt Dialoge.
          </DialogPrimitive.Description>
        </DialogHeader>

        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {group}
              </h3>
              <ul className="divide-y divide-[var(--border)]">
                {SHORTCUT_ACTIONS.filter((a) => a.group === group).map((action) => {
                  const combo = keymap[action.id];
                  return (
                    <li key={action.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span>{action.label}</span>
                      {combo ? (
                        <Kbd combo={combo} />
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">aus</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <Link
          href="/settings/shortcuts"
          onClick={() => setHelpOpen(false)}
          className="text-sm font-medium text-[var(--primary)] hover:underline"
        >
          Shortcuts anpassen
        </Link>
      </DialogContent>
    </Dialog>
  );
}
