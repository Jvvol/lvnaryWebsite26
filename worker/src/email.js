// Builds a plain-text email the Cloudflare send_email binding accepts.

// Headers must be ASCII on one line; anything a buyer typed stays out of them except a checked reply-to.
const headerSafe = s => String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '?');

export function buildRawEmail({ from, to, subject, text, replyTo, date = new Date(), id = crypto.randomUUID() }) {
  const domain = from.split('@')[1];
  const headers = [
    `From: LVNARY Store <${from}>`,
    `To: ${to}`,
    `Subject: ${headerSafe(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (replyTo && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(replyTo)) headers.push(`Reply-To: ${replyTo}`);
  return `${headers.join('\r\n')}\r\n\r\n${text.replace(/\r?\n/g, '\r\n')}\r\n`;
}
