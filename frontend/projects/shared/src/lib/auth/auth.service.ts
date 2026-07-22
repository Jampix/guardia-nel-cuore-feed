import { computed, Injectable, signal } from '@angular/core';
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

/** Utente autenticato (dati pubblici, mai la password). */
export interface AuthUser {
  userId: string;
  email: string;
  /** Nome pubblico mostrato sui feedback. */
  nickname: string;
  /** Gruppi Cognito (es. ['admin'] | ['membro'] | ['cittadino']). */
  groups: string[];
}

/**
 * Autenticazione via Amplify (Cognito). Condivisa da client e admin: ogni app
 * configura Amplify col proprio app client al bootstrap (main.ts), la logica è
 * identica. Espone lo stato utente (con i gruppi) come signal.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<AuthUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    void this.refresh();
    Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') {
        void this.refresh();
      } else if (payload.event === 'signedOut') {
        this._user.set(null);
      }
    });
  }

  /** Registrazione: crea l'account (UNCONFIRMED) e invia il codice via email. */
  register(email: string, password: string, nickname: string) {
    return signUp({ username: email, password, options: { userAttributes: { email, nickname } } });
  }

  /** Conferma l'account con il codice ricevuto via email. */
  confirm(email: string, code: string) {
    return confirmSignUp({ username: email, confirmationCode: code });
  }

  /** Rinvia il codice di verifica. */
  resendCode(email: string) {
    return resendSignUpCode({ username: email });
  }

  /** Login con email + password. Al successo aggiorna lo stato utente. */
  async login(email: string, password: string) {
    try {
      const res = await signIn({ username: email, password });
      if (res.isSignedIn) await this.refresh();
      return res;
    } catch (e: any) {
      // Sessione residua nel browser (altro utente / tentativo precedente):
      // esci e riprova una volta.
      if (e?.name === 'UserAlreadyAuthenticatedException') {
        await signOut();
        const res = await signIn({ username: email, password });
        if (res.isSignedIn) await this.refresh();
        return res;
      }
      throw e;
    }
  }

  /** Logout. */
  async logout(): Promise<void> {
    await signOut();
    this._user.set(null);
  }

  /** Id token JWT per le chiamate autenticate (undefined se non loggato). */
  async getIdToken(): Promise<string | undefined> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString();
    } catch {
      return undefined;
    }
  }

  /** True se l'utente appartiene al gruppo indicato. */
  hasGroup(group: string): boolean {
    return this._user()?.groups.includes(group) ?? false;
  }

  /** Ripristina/aggiorna lo stato utente (con i gruppi) dalla sessione Amplify. */
  async refresh(): Promise<void> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) {
        this._user.set(null);
        return;
      }
      const u = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const groups = (idToken.payload['cognito:groups'] as string[] | undefined) ?? [];
      this._user.set({
        userId: u.userId,
        email: attrs.email ?? '',
        nickname: attrs.nickname ?? '',
        groups,
      });
    } catch {
      this._user.set(null);
    }
  }
}
