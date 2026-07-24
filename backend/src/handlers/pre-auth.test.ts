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
  it('BLOCCA il login di chi non è in alcun gruppo (non approvato)', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [] });
    await expect(handler(event)).rejects.toThrow(/approvazione/i);
  });

  it('CONSENTE il login del cittadino approvato', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'cittadino' }] });
    await expect(handler(event)).resolves.toBe(event);
  });

  it('CONSENTE il login dello staff (admin)', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'admin' }] });
    await expect(handler(event)).resolves.toBe(event);
  });
});
