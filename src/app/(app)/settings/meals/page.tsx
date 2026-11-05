import { redirect } from "next/navigation";

// Gerichte werden jetzt im Essen-Bereich verwaltet.
export default function MealsSettingsPage() {
  redirect("/meals?view=gerichte");
}
