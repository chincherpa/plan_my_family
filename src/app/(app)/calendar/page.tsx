import CalendarView from "@/components/calendar/CalendarView";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day } = await searchParams;
  return <CalendarView key={day ?? "today"} initialDay={day} />;
}
