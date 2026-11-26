function toIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface IcsInviteInput {
  uid: string;
  title: string;
  description: string;
  startIso: string;
  durationMinutes?: number;
  organizerEmail?: string;
  attendeeEmail: string;
  meetLink: string;
}

export function generateIcsInvite(input: IcsInviteInput): string {
  const startDate = new Date(input.startIso);
  const endDate = new Date(startDate.getTime() + (input.durationMinutes ?? 30) * 60_000);
  const dtStamp = toIcsUtcStamp(new Date());
  const dtStart = toIcsUtcStamp(startDate);
  const dtEnd = toIcsUtcStamp(endDate);
  const organizer = input.organizerEmail || 'sales@aislaves.my';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AISlaves//Calendar Setter Agent//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${input.uid}@aislaves.my`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(`${input.description}\n\nJoin Meeting: ${input.meetLink}`)}`,
    `LOCATION:${escapeIcsText(input.meetLink)}`,
    `ORGANIZER;CN=AISlaves Sales Rep:mailto:${organizer}`,
    `ATTENDEE;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Upcoming AISlaves Sales Call',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}
