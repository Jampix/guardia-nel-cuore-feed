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
}

/**
 * Autenticazione via Amplify (Cognito User Pool). Amplify persiste i token
 * nel browser: allo start proviamo a ripristinare la sessione. Lo stato utente
 * è esposto come signal per la UI.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<AuthUser | null>(null);
  /** Utente corrente (null se non autenticato). */
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    void this.refresh();
    // Mantiene lo stato allineato agli eventi di Amplify (login/logout/refresh).
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
    return signUp({
      username: email,
      password,
      options: { userAttributes: { email, nickname } },
    });
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
    const res = await signIn({ username: email, password });
    if (res.isSignedIn) await this.refresh();
    return res;
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

  /** Ripristina/aggiorna lo stato utente dalla sessione Amplify. */
  async refresh(): Promise<void> {
    try {
      const u = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      this._user.set({
        userId: u.userId,
        email: attrs.email ?? '',
        nickname: attrs.nickname ?? '',
      });
    } catch {
      this._user.set(null);
    }
  }
}
