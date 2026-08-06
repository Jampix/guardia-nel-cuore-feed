import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** Gruppi che possono agire sugli avvisi, quindi che devono riceverli. */
const GRUPPI_STAFF = ['admin', 'membro'];

/**
 * Indirizzi a cui mandare gli avvisi per lo staff, letti da Cognito al momento
 * dell'invio.
 *
 * Prima era un unico indirizzo fisso nella configurazione: aggiungere una
 * persona allo staff non bastava a farle ricevere nulla, e chi poteva agire non
 * sapeva che c'era da agire — lo stesso difetto che ha lasciato dei cittadini in
 * attesa per giorni.
 *
 * Si notificano **admin e membro**, non solo gli admin: entrambi possono
 * approvare e moderare (il controllo di accesso accetta i due gruppi), e
 * avvisare solo una parte di chi può agire ricrea il buco.
 *
 * Se la lettura non riesce o non trova nessuno si ricade sull'indirizzo di
 * configurazione: un avviso in meno è peggio di un avviso a un destinatario in
 * più, e non deve smettere di partire in silenzio.
 */
export async function emailDelloStaff(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  fallback: string,
): Promise<string[]> {
  const trovate = new Set<string>();
  try {
    for (const gruppo of GRUPPI_STAFF) {
      let token: string | undefined;
      do {
        const r = await cognito.send(
          new ListUsersInGroupCommand({
            UserPoolId: userPoolId,
            GroupName: gruppo,
            NextToken: token,
          }),
        );
        for (const u of r.Users ?? []) {
          const email = u.Attributes?.find((a) => a.Name === 'email')?.Value;
          // Un indirizzo non verificato non riceve: inviarci non serve.
          const verificata =
            u.Attributes?.find((a) => a.Name === 'email_verified')?.Value !== 'false';
          if (email && verificata) trovate.add(email.trim().toLowerCase());
        }
        token = r.NextToken;
      } while (token);
    }
  } catch (err) {
    console.error('Lettura staff da Cognito fallita, uso il solo indirizzo di configurazione:', err);
    return fallback ? [fallback] : [];
  }

  if (!trovate.size) {
    console.warn('Nessuno staff con email verificata: uso l\'indirizzo di configurazione');
    return fallback ? [fallback] : [];
  }
  console.log('Avviso staff: destinatari', trovate.size);
  return [...trovate];
}
