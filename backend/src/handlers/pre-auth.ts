import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PreAuthenticationTriggerEvent } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});

// Un utente è "attivo" se appartiene a uno di questi gruppi.
const ACTIVE_GROUPS = ['admin', 'membro', 'cittadino'];

/**
 * Trigger Pre-Authentication: consente il login solo a chi appartiene a un gruppo
 * attivo.
 *
 * Non è più un'attesa di approvazione: dall'8 agosto 2026 il trigger
 * Post-Confirmation aggiunge da sé il nuovo iscritto al gruppo `cittadino`, quindi
 * chi verifica l'email entra subito. Questo gate resta come **interruttore**: chi
 * non deve più accedere si rimuove dal gruppo (console Cognito, oppure «rifiuta»
 * dal backoffice) e da quel momento è bloccato qui.
 *
 * Per questo il messaggio NON parla di approvazione: chi lo legge, ormai, è
 * qualcuno a cui l'accesso è stato tolto — o un caso in cui l'attivazione
 * automatica non è riuscita. In entrambi i casi la cosa utile da dire è a chi
 * scrivere.
 */
export const handler = async (
  event: PreAuthenticationTriggerEvent,
): Promise<PreAuthenticationTriggerEvent> => {
  // Il pool ha PreventUserExistenceErrors=ENABLED: Cognito invoca questo trigger
  // anche per email inesistenti (per non rivelare se l'account esiste). In quel
  // caso lasciamo proseguire: Cognito risponderà "Email o password non corretti".
  if (event.request?.userNotFound) return event;

  let groups: string[];
  try {
    const res = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
      }),
    );
    groups = (res.Groups ?? []).map((g) => g.GroupName ?? '');
  } catch (err: any) {
    // Utente inesistente: lasciamo decidere a Cognito (credenziali non valide).
    if (err?.name === 'UserNotFoundException') return event;
    // Altri errori: NON facciamo passare (il gate di approvazione resta chiuso),
    // ma rilanciamo l'originale così il messaggio non parla di approvazione.
    console.error('Lettura gruppi fallita in pre-auth:', err);
    throw err;
  }

  const active = groups.some((g) => ACTIVE_GROUPS.includes(g));

  if (!active) {
    // Mostrato tale e quale sulla schermata di login: dice cosa succede e cosa
    // fare, senza far credere a un'attesa che non esiste più.
    throw new Error(
      'Questo account non è abilitato ad accedere. Scrivi a guardianelcuore@gmail.com.',
    );
  }

  return event;
};
