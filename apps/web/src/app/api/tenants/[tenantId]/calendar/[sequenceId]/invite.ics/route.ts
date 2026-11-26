import { NextResponse } from 'next/server';
import { generateIcsInvite } from '@aislaves/crew-engine';
import { loadPlatformState } from '@aislaves/demo-sandbox';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string; sequenceId: string }> }
) {
  const { tenantId, sequenceId } = await context.params;
  const state = await loadPlatformState();
  const tenant = state.tenants[tenantId];
  const seq = tenant?.outreachSequences.find((s) => s.id === sequenceId);

  if (!tenant || !seq) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  const slot = seq.bookedSlot ?? {
    startIso: '2026-12-03T15:00:00+08:00',
    displayLabel: 'Thu 3 Dec 2026 • 3:00 PM MYT',
    meetLink: 'https://meet.google.com/ais-demo-3pm',
  };

  const ics = generateIcsInvite({
    uid: seq.id,
    title: `${tenant.name} x ${seq.company} — Intro Call`,
    description: `Booked by AISlaves Calendar Setter Agent for ${seq.leadName}.`,
    startIso: slot.startIso,
    durationMinutes: 30,
    attendeeEmail: seq.leadEmail,
    meetLink: slot.meetLink,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="aislaves-meeting-${seq.id}.ics"`,
    },
  });
}
