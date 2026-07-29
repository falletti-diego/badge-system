/**
 * Email Helper — minimal AWS SES wrapper (Task 5 of 9 — Ambiente Demo
 * Self-Service).
 *
 * First real usage of the AWS SDK in this backend (AWS_REGION /
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY were already declared in
 * .env.example for AWS_S3_BUCKET, but nothing used them until now).
 *
 * Deliberately minimal: no retry logic, no queueing, no templating. The
 * SES client picks up credentials from the standard AWS SDK v3 credential
 * chain (env vars, shared config, or an EC2/ECS instance role in
 * production) — nothing is passed explicitly here besides the region.
 *
 * This function does NOT catch/swallow errors — it lets them propagate.
 * Callers (e.g. POST /demo/contact) are responsible for deciding whether a
 * send failure should be surfaced or silently logged; this module has no
 * opinion on that.
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

let sesClient = null;
function getClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.AWS_REGION || 'eu-west-1' });
  }
  return sesClient;
}

/**
 * Send a plain-text email via SES.
 *
 * @param {{ to: string, subject: string, text: string }} params
 * @returns {Promise<import('@aws-sdk/client-ses').SendEmailCommandOutput>}
 */
async function sendEmail({ to, subject, text }) {
  const command = new SendEmailCommand({
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: text, Charset: 'UTF-8' } },
    },
    Source: process.env.SES_FROM_EMAIL || 'no-reply@dataxiom.it',
  });

  return getClient().send(command);
}

/**
 * Build the welcome email sent to the first admin of a newly-created client,
 * with a one-time link to set their password (backend/src/utils/inviteTokens.js).
 *
 * @param {{ to: string, clientName: string, rawToken: string }} params
 */
function buildAdminInviteEmail({ to, clientName, rawToken }) {
  const link = `https://badge.dataxiom.it/accetta-invito?token=${rawToken}`;
  return {
    to,
    subject: `Benvenuto su Badge System, ${clientName}`,
    text: `Ciao,\n\nil tuo account amministratore per ${clientName} su Badge System è pronto.\n`
      + `Imposta la tua password per iniziare: ${link}\n\n`
      + `Il link scade tra 7 giorni.\n\nTeam Badge System`,
  };
}

/**
 * Build the welcome email sent to a new employee created by the onboarding
 * wizard (backend/src/routes/admin/onboarding.js), with their initial
 * temporary password. The existing forced-password-change flow
 * (must_change_password=true, already set by apply()) handles the rest —
 * no new token infrastructure needed here.
 *
 * @param {{ to: string, tempPassword: string, clientName: string }} params
 */
function buildEmployeeWelcomeEmail({ to, tempPassword, clientName }) {
  return {
    to,
    subject: `Il tuo accesso a Badge System — ${clientName}`,
    text: `Ciao,\n\nè stato creato il tuo account su Badge System per ${clientName}.\n\n`
      + `Email: ${to}\nPassword temporanea: ${tempPassword}\n\n`
      + `Accedi su https://badge.dataxiom.it/login — al primo accesso ti verrà chiesto di impostarne una tua.\n\n`
      + `Team Badge System`,
  };
}

module.exports = { sendEmail, buildAdminInviteEmail, buildEmployeeWelcomeEmail };
