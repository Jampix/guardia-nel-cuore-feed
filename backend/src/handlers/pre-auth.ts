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
  const res = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
    }),
  );
  const groups = (res.Groups ?? []).map((g) => g.GroupName ?? '');
  const active = groups.some((g) => ACTIVE_GROUPS.includes(g));

  if (!active) {
    // Il messaggio viene mostrato al cittadino sulla schermata di login.
    throw new Error('Account in attesa di approvazione da parte dello staff.');
  }

  return event;
};
