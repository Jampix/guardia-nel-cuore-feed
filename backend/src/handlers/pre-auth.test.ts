import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './pre-auth';

const cognito = mockClient(CognitoIdentityProviderClient);
beforeEach(() => cognito.reset());

const event = { userPoolId: 'eu-west-1_TEST', userName: 'user-1' } as any;

describe('pre-auth (gate login)', () => {
  it('BLOCCA il login di chi non è in alcun gruppo', async () => {
    // Dall'8 agosto 2026 non è più un'attesa di approvazione: l'attivazione è
    // automatica, quindi chi finisce qui è qualcuno a cui l'accesso è stato
    // tolto (o un'attivazione non riuscita). Il messaggio deve dire a chi
    // scrivere e NON parlare di approvazione, che sarebbe una bugia.
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [] });
    await expect(handler(event)).rejects.toThrow(/non è abilitato ad accedere/i);
    await expect(handler(event)).rejects.toThrow(/guardianelcuore@gmail\.com/);
    await expect(handler(event)).rejects.not.toThrow(/approvazione/i);
  });

  it('CONSENTE il login del cittadino approvato', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'cittadino' }] });
    await expect(handler(event)).resolves.toBe(event);
  });

  it('CONSENTE il login dello staff (admin)', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'admin' }] });
    await expect(handler(event)).resolves.toBe(event);
  });

  it('NON parla di approvazione per una email inesistente (userNotFound)', async () => {
    // PreventUserExistenceErrors=ENABLED: il trigger scatta anche senza utente.
    const notFound = { ...event, request: { userNotFound: true } } as any;
    await expect(handler(notFound)).resolves.toBe(notFound);
    expect(cognito.calls()).toHaveLength(0);
  });

  it('NON parla di approvazione se Cognito risponde UserNotFoundException', async () => {
    const err: any = new Error('User does not exist.');
    err.name = 'UserNotFoundException';
    cognito.on(AdminListGroupsForUserCommand).rejects(err);
    await expect(handler(event)).resolves.toBe(event);
  });

  it('NON fa passare in caso di errore transitorio di Cognito', async () => {
    const err: any = new Error('Rate exceeded');
    err.name = 'TooManyRequestsException';
    cognito.on(AdminListGroupsForUserCommand).rejects(err);
    await expect(handler(event)).rejects.toThrow(/Rate exceeded/);
  });
});
