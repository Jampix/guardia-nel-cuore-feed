import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';

const ses = new SESv2Client({});
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const STAFF_EMAIL = process.env.STAFF_EMAIL as string;
const CLIENT_URL = process.env.CLIENT_URL as string;
const ADMIN_URL = process.env.ADMIN_URL as string;

/**
 * Trigger Post-Confirmation: scatta quando il cittadino ha inserito il codice
 * e la sua email è verificata. Manda due avvisi:
 *
 * 1. allo STAFF, che c'è qualcuno in attesa di approvazione. È il pezzo che
 *    mancava: l'unico modo di accorgersene era aprire il backoffice, e alcuni
 *    iscritti hanno aspettato giorni.
 * 2. al CITTADINO, che la registrazione è arrivata e serve l'approvazione, così
 *    non resta a chiedersi se il passaggio è andato a buon fine.
 *
 * Non solleva MAI: un errore qui farebbe vedere un fallimento a chi ha appena
 * inserito il codice giusto. L'utente è già confermato a questo punto.
 */
export const handler = async (
  event: PostConfirmationTriggerEvent,
): Promise<PostConfirmationTriggerEvent> => {
  // Lo stesso trigger scatta anche dopo la conferma di un cambio password:
  // là non c'è nessuna nuova iscrizione da annunciare.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const attrs = event.request.userAttributes ?? {};
  const email = attrs.email;
  const nickname = (attrs.nickname ?? '').trim();

  try {
    await Promise.all([avvisaStaff(email, nickname), confermaAlCittadino(email, nickname)]);
  } catch (err) {
    console.error('Invio avvisi di registrazione fallito:', err);
  }

  return event;
};

/** Avvisa lo staff che c'è una nuova iscrizione da approvare. */
async function avvisaStaff(emailCittadino?: string, nickname?: string): Promise<void> {
  if (!FROM_EMAIL || !STAFF_EMAIL) return;

  const chi = [nickname, emailCittadino].filter(Boolean).join(' — ') || 'un nuovo cittadino';
  const link = ADMIN_URL ? `${ADMIN_URL}/cittadini` : '';
  const text =
    `${chi} si è registrato a Guardia nel Cuore e attende l'approvazione.\n\n` +
    'Finché non lo approvi non può accedere.' +
    (link ? `\n\nApprova qui: ${link}` : '') +
    '\n\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [STAFF_EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: 'Nuova iscrizione da approvare' },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Avviso staff inviato per nuova iscrizione');
}

/** Conferma al cittadino che la registrazione è arrivata. */
async function confermaAlCittadino(email?: string, nickname?: string): Promise<void> {
  if (!FROM_EMAIL || !email) return;

  const link = CLIENT_URL ? `${CLIENT_URL}/accedi` : '';
  const text =
    `Ciao${nickname ? ' ' + nickname : ''},\n\n` +
    'la tua registrazione a Guardia nel Cuore è arrivata e la tua email è verificata.\n\n' +
    'Prima del primo accesso un membro dell\'associazione deve approvare l\'iscrizione: ' +
    'ti scriviamo appena è fatto, non serve che tu faccia altro.' +
    (link ? `\n\nDa quel momento potrai accedere qui: ${link}` : '') +
    '\n\nA presto,\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: 'Registrazione ricevuta — Guardia nel Cuore' },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Conferma di registrazione inviata al cittadino');
}
