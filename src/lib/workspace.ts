import { db } from "@/db";
import { events, registrations } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function getWorkspace() {
  let [event] = await db.select().from(events).orderBy(asc(events.id)).limit(1);

  if (!event) {
    const start = new Date();
    start.setDate(start.getDate() + 28);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(18, 0, 0, 0);
    const deadline = new Date(start);
    deadline.setDate(deadline.getDate() - 5);
    deadline.setHours(23, 59, 0, 0);

    [event] = await db.insert(events).values({
      title: "The Future of Creative Work",
      subtitle: "Ideas meet people. Possibilities begin.",
      description: "A day for curious minds, bold ideas, and the people shaping what comes next. Join inspiring talks, honest conversations, and meaningful connections with a community of creative thinkers.",
      category: "Conference",
      organizer: "The Gatherly Team",
      venue: "The Glasshouse",
      location: "New York, NY",
      startAt: start,
      endAt: end,
      deadlineAt: deadline,
      capacity: 150,
      imageUrl: "https://images.pexels.com/photos/29708258/pexels-photo-29708258.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1600&q=85",
    }).returning();

    const people = [
      ["Olivia Rhye", "olivia.rhye@example.com", "Product Designer", "Layers", false, true],
      ["Phoenix Baker", "phoenix.baker@example.com", "Creative Director", "Sisyphus", false, true],
      ["Lana Steiner", "lana.steiner@example.com", "Brand Strategist", "Catalog", false, false],
      ["Demi Wilkinson", "demi.wilkinson@example.com", "UX Researcher", "Quotient", false, true],
      ["Candice Wu", "candice.wu@example.com", "Founder", "Circooles", false, false],
      ["Natali Craig", "natali.craig@example.com", "Visual Artist", "Untitled", false, false],
      ["Alex Rivera", "alex.rivera@example.com", "Keynote Speaker", "Studio North", true, false],
      ["Jordan Lee", "jordan.lee@example.com", "Guest Speaker", "Common Ground", true, false],
    ] as const;
    await db.insert(registrations).values(people.map(([fullName, email, role, company, isGuest, checkedIn], index) => ({
      eventId: event.id,
      fullName, email, role, company, isGuest,
      ticketCode: `GTH-DEMO-${String(index + 1).padStart(4, "0")}`,
      checkedInAt: checkedIn ? new Date() : null,
    })));
  }

  const attendees = await db.select().from(registrations).where(eq(registrations.eventId, event.id)).orderBy(asc(registrations.id));
  return { event, registrations: attendees };
}
