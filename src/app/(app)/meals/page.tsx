import MealsView from "@/components/meals/MealsView";

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <MealsView initialTab={view === "gerichte" ? "gerichte" : "plan"} />;
}
