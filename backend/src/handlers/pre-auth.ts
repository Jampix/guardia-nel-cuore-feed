import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PreAuthenticationTriggerEvent } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});

// Un utente è "attivo" se appartiene a uno di questi gruppi.
const ACTIVE_GROUPS = ['admin', 'membro', 'cittadino'];

/**
 * Trigger Pre-Authentication: blocca il login dei cittadini non ancora
 * approvati dallo staff. L'approvazione = appartenenza al gruppo `cittadino`
 * (aggiunta dall'admin). Chi non è in alcun gruppo attivo non può accedere.
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
    // Il messaggio viene mostrato al cittadino sulla schermata di login.
    throw new Error('Account in attesa di approvazione da parte dello staff.');
  }

  return event;
};
