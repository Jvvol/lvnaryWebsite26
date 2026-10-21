// Worker entry point. Wires Cloudflare's email sender into the app logic in app.js.
import { EmailMessage } from 'cloudflare:email';
import { handle } from './app.js';
import { buildRawEmail } from './email.js';

export default {
  fetch(request, env) {
    const sendEmail = async ({ subject, text, replyTo }) => {
      const raw = buildRawEmail({ from: env.ORDER_EMAIL_FROM, to: env.ORDER_EMAIL_TO, subject, text, replyTo });
      await env.ORDER_EMAIL.send(new EmailMessage(env.ORDER_EMAIL_FROM, env.ORDER_EMAIL_TO, raw));
    };
    return handle(request, env, { sendEmail });
  },
};
