import { db } from "@/db";
import { events, registrations } from "@/db/schema";
import { getWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function failure(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json(await getWorkspace());
  } catch (error) {
    console.error("Workspace GET failed", error);
    return failure("Could not load the workspace.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { event } = await getWorkspace();
    const body = await request.json();
    const title = String(body.title || "").trim();
    const subtitle = String(body.subtitle || "").trim();
    const description = String(body.description || "").trim();
    const category = String(body.category || "").trim();
    const organizer = String(body.organizer || "").trim();
    const venue = String(body.venue || "").trim();
    const location = String(body.location || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const capacity = Number(body.capacity);
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    const deadlineAt = new Date(body.deadlineAt);
    if (!title || !subtitle || !description || !category || !organizer || !venue || !location || !imageUrl) return failure("Please complete all event details.");
    if ([startAt, endAt, deadlineAt].some(date => Number.isNaN(date.getTime()))) return failure("Please enter valid event dates.");
    if (endAt <= startAt) return failure("The end time must be after the start time.");
    if (deadlineAt >= startAt) return failure("The registration deadline must be before the event starts.");
    if (!Number.isInteger(capacity) || capacity < 1) return failure("Capacity must be at least 1.");
    if (!/^https?:\/\//i.test(imageUrl)) return failure("Please enter a valid image URL.");
    await db.update(events).set({ title, subtitle, description, category, organizer, venue, location, imageUrl, capacity, startAt, endAt, deadlineAt, updatedAt: new Date() }).where(eq(events.id, event.id));
    return Response.json(await getWorkspace());
  } catch (error) {
    console.error("Workspace PATCH failed", error);
    return failure("Could not save event details.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, registrations: attendees } = await getWorkspace();
    if (body.action === "checkin") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!code) return failure("Enter or scan a ticket code.");
      const [ticket] = await db.select().from(registrations).where(and(eq(registrations.eventId, event.id), eq(registrations.ticketCode, code))).limit(1);
      if (!ticket) return failure("Ticket not found. Check the code and try again.", 404);
      if (ticket.checkedInAt) return failure(`${ticket.fullName} is already checked in.`);
      await db.update(registrations).set({ checkedInAt: new Date() }).where(eq(registrations.id, ticket.id));
      return Response.json({ message: `${ticket.fullName} checked in successfully!`, ...(await getWorkspace()) });
    }
    if (body.action !== "register" && body.action !== "guest") return failure("Invalid action.");
    const isGuest = body.action === "guest";
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "").trim();
    const company = String(body.company || "").trim();
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failure("Enter a valid name and email address.");
    if (!isGuest && new Date() > event.deadlineAt) return failure("Registration has closed for this event.");
    if (attendees.length >= event.capacity) return failure("This event is at capacity.");
    if (attendees.some(person => person.email.toLowerCase() === email)) return failure("This email is already registered for the event.", 409);
    const ticketCode = `GTH-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [ticket] = await db.insert(registrations).values({ eventId: event.id, fullName, email, role, company, isGuest, ticketCode }).returning();
    return Response.json({ ticket, ...(await getWorkspace()) }, { status: 201 });
  } catch (error) {
    console.error("Workspace POST failed", error);
    return failure("Something went wrong. Please try again.", 500);
  }
}
