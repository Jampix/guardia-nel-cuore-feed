import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { emailDelloStaff } from '../lib/staff-emails';
import { rispondiA } from '../lib/email';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';

const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const STAFF_EMAIL = process.env.STAFF_EMAIL as string;
const CLIENT_URL = process.env.CLIENT_URL as string;
const ADMIN_URL = process.env.ADMIN_URL as string;

/** Gruppo dei cittadini abilitati: è ciò che il gate di login controlla. */
const GRUPPO_CITTADINO = 'cittadino';

/** Etichette del rapporto col paese: nell'email va la parola, non il codice. */
const TIPI: Record<string, string> = {
  residente: 'residente a Guardia Piemontese',
  non_residente: 'non residente',
  sostenitore: 'sostenitore del paese',
  turista: 'turista',
};

/**
 * Trigger Post-Confirmation: scatta quando il cittadino ha inserito il codice e
 * la sua email è verificata. Fa tre cose:
 *
 * 1. **ATTIVA l'account**, aggiungendolo al gruppo `cittadino`. L'approvazione
 *    manuale è stata rimossa: chi verifica l'email entra subito. Chi non va bene
 *    si toglie dal gruppo (console Cognito o «rifiuta» dal backoffice), e il gate
 *    di login lo blocca di nuovo — il meccanismo resta, non è più un'attesa.
 * 2. avvisa lo STAFF della nuova iscrizione, che è la notifica che si vuole
 *    tenere anche senza approvazione.
 * 3. conferma al CITTADINO che può accedere.
 *
 * Non solleva MAI: un errore qui farebbe vedere un fallimento a chi ha appena
 * inserito il codice giusto, e a quel punto l'utente è già confermato.
 *
 * ⚠️ Per questo l'esito dell'attivazione **viaggia nelle due email**. Se
 * l'aggiunta al gruppo fallisse in silenzio, il cittadino sarebbe confermato ma
 * incapace di entrare e nessuno lo saprebbe: è esattamente il guasto che a
 * luglio ha lasciato sei persone in attesa per giorni. Qui invece lo staff
 * riceve un avviso che chiede di intervenire, e al cittadino non si promette un
 * accesso che non funziona.
 */
export const handler = async (
  event: PostConfirmationTriggerEvent,
): Promise<PostConfirmationTriggerEvent> => {
  // Lo stesso trigger scatta anche dopo la conferma di un cambio password:
  // là non c'è nessuna nuova iscrizione da annunciare né da attivare.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const attrs = event.request.userAttributes ?? {};
  const email = attrs.email;
  const nickname = (attrs.nickname ?? '').trim();
  // Nome vero e rapporto col paese servono allo staff per riconoscere chi si è
  // iscritto: senza, l'avviso dice solo che "qualcuno" è entrato.
  const nomeCompleto = [attrs.given_name, attrs.family_name]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const tipo = TIPI[attrs['custom:tipoUtente'] ?? ''] ?? '';

  const attivato = await attiva(event.userPoolId, event.userName);

  try {
    // Il pool arriva dall'evento del trigger: passarlo come variabile
    // d'ambiente creerebbe una dipendenza circolare pool→trigger→policy→pool.
    await Promise.all([
      avvisaStaff(event.userPoolId, attivato, email, nickname, nomeCompleto, tipo),
      confermaAlCittadino(attivato, email, nickname),
    ]);
  } catch (err) {
    console.error('Invio avvisi di registrazione fallito:', err);
  }

  return event;
};

/**
 * Aggiunge il nuovo iscritto al gruppo `cittadino`, cioè gli dà l'accesso.
 * Restituisce `false` se non è riuscito, senza sollevare: l'esito serve alle
 * email, non a far fallire la conferma.
 */
async function attiva(userPoolId: string, username: string): Promise<boolean> {
  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: GRUPPO_CITTADINO,
      }),
    );
    console.log('Nuovo iscritto attivato', { gruppo: GRUPPO_CITTADINO });
    return true;
  } catch (err) {
    // Loggato in modo evidente: è l'unico caso in cui una persona resta fuori.
    console.error('ATTIVAZIONE FALLITA: il nuovo iscritto non può accedere', err);
    return false;
  }
}

/** Avvisa lo staff della nuova iscrizione (e se serve intervenire). */
async function avvisaStaff(
  userPoolId: string,
  attivato: boolean,
  emailCittadino?: string,
  nickname?: string,
  nomeCompleto?: string,
  tipo?: string,
): Promise<void> {
  if (!FROM_EMAIL) return;
  const destinatari = await emailDelloStaff(cognito, userPoolId, STAFF_EMAIL);
  if (!destinatari.length) return;

  const chi = [nomeCompleto, emailCittadino].filter(Boolean).join(' — ') || 'un nuovo cittadino';
  const link = ADMIN_URL ? `${ADMIN_URL}/cittadini` : '';
  const dettagli =
    (nickname ? `Nome pubblico: ${nickname}\n` : '') + (tipo ? `Si dichiara: ${tipo}\n` : '');

  const text = attivato
    ? `${chi} si è registrato a Guardia nel Cuore e può già accedere.\n\n` +
      dettagli +
      '\nNon serve fare nulla: l\'attivazione è automatica. Se questa persona non ' +
      'dovesse andare bene, rimuovila dal gruppo «cittadino».' +
      (link ? `\n\nElenco iscritti: ${link}` : '') +
      '\n\nGuardia nel Cuore'
    : `${chi} si è registrato a Guardia nel Cuore, ma L'ATTIVAZIONE AUTOMATICA ` +
      'NON È RIUSCITA: questa persona NON può accedere.\n\n' +
      dettagli +
      '\nAttivala a mano dal backoffice, in Cittadini → In attesa.' +
      (link ? `\n\nVai qui: ${link}` : '') +
      '\n\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      ReplyToAddresses: rispondiA(),
      Destination: { ToAddresses: destinatari },
      Content: {
        Simple: {
          Subject: {
            Data: attivato ? 'Nuova iscrizione' : 'Iscrizione NON attivata — serve un intervento',
          },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Avviso staff inviato per nuova iscrizione', { attivato });
}

/** Conferma al cittadino che può accedere (o che deve attendere, se qualcosa è andato storto). */
async function confermaAlCittadino(
  attivato: boolean,
  email?: string,
  nickname?: string,
): Promise<void> {
  if (!FROM_EMAIL || !email) return;

  const link = CLIENT_URL ? `${CLIENT_URL}/accedi` : '';
  // Se l'attivazione non è riuscita non si promette un accesso che non
  // funziona: mandare qualcuno a sbattere contro un errore è peggio che
  // chiedergli di aspettare.
  const text = attivato
    ? `Ciao${nickname ? ' ' + nickname : ''},\n\n` +
      'la tua email è verificata e il tuo account è attivo: puoi accedere subito ' +
      'con l\'indirizzo e la password che hai scelto.' +
      (link ? `\n\nEntra qui: ${link}` : '') +
      '\n\nBenvenuto,\nGuardia nel Cuore'
    : `Ciao${nickname ? ' ' + nickname : ''},\n\n` +
      'la tua email è verificata. Per completare l\'attivazione serve un ultimo ' +
      'passaggio da parte dell\'associazione: ti scriviamo appena è fatto, non ' +
      'serve che tu faccia altro.' +
      '\n\nA presto,\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      ReplyToAddresses: rispondiA(),
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: {
            Data: attivato
              ? 'Benvenuto in Guardia nel Cuore'
              : 'Registrazione ricevuta — Guardia nel Cuore',
          },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Conferma di registrazione inviata al cittadino', { attivato });
}
