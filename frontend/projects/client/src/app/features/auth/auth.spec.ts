import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AuthService } from 'shared';
import { Auth } from './auth';

/**
 * Test della schermata di accesso/registrazione.
 *
 * Coprono i difetti realmente emersi su questa pagina: la corrispondenza fra
 * le due password, il messaggio "in attesa di approvazione" mostrato per
 * errori che non c'entravano, e l'impaginazione dei campi quando un hint va a
 * capo (Material riserva una sola riga e il testo sbordava sul campo sotto).
 */

/** Doppio dell'AuthService: quello vero parla con Cognito via Amplify. */
function authStub() {
  return {
    user: signal(null),
    register: jasmine.createSpy('register').and.resolveTo(undefined),
    login: jasmine.createSpy('login').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(undefined),
    resendCode: jasmine.createSpy('resendCode').and.resolveTo(undefined),
    requestPasswordReset: jasmine.createSpy('requestPasswordReset').and.resolveTo(undefined),
    confirmPasswordReset: jasmine.createSpy('confirmPasswordReset').and.resolveTo(undefined),
    logout: jasmine.createSpy('logout').and.resolveTo(undefined),
    getIdToken: jasmine.createSpy('getIdToken').and.resolveTo('token'),
    hasGroup: () => false,
  };
}

/** MatDialog finto: in registrazione il componente apre il regolamento da solo. */
function dialogStub(result: unknown = true) {
  return { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(result) }) };
}

describe('Auth', () => {
  let fixture: ComponentFixture<Auth>;
  let comp: Auth;
  let auth: ReturnType<typeof authStub>;

  type Mode = 'login' | 'register' | 'confirm' | 'reset' | 'reset-confirm';

  async function setup(mode: Mode, dialogResult: unknown = true) {
    auth = authStub();
    await TestBed.configureTestingModule({
      imports: [Auth],
      providers: [
        provideNoopAnimations(),
        // Rotte finte: dopo la registrazione il componente naviga a /conferma e
        // un router vuoto riempirebbe l'output di NG04002 senza far fallire i
        // test, nascondendo gli errori veri.
        provideRouter([{ path: '**', children: [] }]),
        { provide: AuthService, useValue: auth },
        { provide: MatDialog, useValue: dialogStub(dialogResult) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Auth);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('conferma password (registrazione)', () => {
    beforeEach(async () => setup('register'));

    it('segnala le due password diverse con l\'errore `mismatch`', () => {
      const { password, password2 } = comp.registerForm.controls;
      password.setValue('Password1');
      password2.setValue('Password2');

      expect(password2.hasError('mismatch')).toBeTrue();
    });

    it('accetta le due password uguali', () => {
      const { password, password2 } = comp.registerForm.controls;
      password.setValue('Password1');
      password2.setValue('Password1');

      expect(password2.hasError('mismatch')).toBeFalse();
      expect(password2.valid).toBeTrue();
    });

    it('rivaluta la ripetizione se la password cambia DOPO', () => {
      // Il caso che sfugge se il validatore non viene rieseguito a mano: le due
      // password coincidono, poi la prima cambia e l'errore deve comparire.
      const { password, password2 } = comp.registerForm.controls;
      password.setValue('Password1');
      password2.setValue('Password1');
      expect(password2.valid).toBeTrue();

      password.setValue('Password9');

      expect(password2.hasError('mismatch')).toBeTrue();
    });

    it('non invia la registrazione se le password non coincidono', async () => {
      comp.registerForm.patchValue({
        nickname: 'Mario P.',
        email: 'mario@example.com',
        password: 'Password1',
        password2: 'Password2',
        consenso: true,
      });

      await comp.doRegister();

      expect(auth.register).not.toHaveBeenCalled();
    });

    it('invia la registrazione con la sola password, non la ripetizione', async () => {
      comp.registerForm.patchValue({
        nickname: 'Mario P.',
        email: 'mario@example.com',
        password: 'Password1',
        password2: 'Password1',
        consenso: true,
      });

      await comp.doRegister();

      expect(auth.register).toHaveBeenCalledWith('mario@example.com', 'Password1', 'Mario P.');
    });
  });

  describe('mostra/nascondi password', () => {
    it('cambia il tipo del campo quando si preme l\'occhio', async () => {
      await setup('login');
      const input = (): HTMLInputElement =>
        fixture.nativeElement.querySelector('input[formcontrolname=password]');
      const eye = (): HTMLButtonElement =>
        fixture.nativeElement.querySelector('mat-form-field button[mat-icon-button]');

      expect(input().type).toBe('password');

      eye().click();
      fixture.detectChanges();
      expect(input().type).toBe('text');

      eye().click();
      fixture.detectChanges();
      expect(input().type).toBe('password');
    });

    it('l\'occhio non invia la form', async () => {
      await setup('login');
      const eye: HTMLButtonElement =
        fixture.nativeElement.querySelector('mat-form-field button[mat-icon-button]');

      expect(eye.type).toBe('button');
    });
  });

  describe('messaggi di errore del login', () => {
    it('mostra l\'attesa di approvazione solo se lo dice il trigger', async () => {
      await setup('login');
      const err: any = new Error('PreAuthentication failed with error Account in attesa di approvazione.');
      err.name = 'UserLambdaValidationException';
      auth.login.and.rejectWith(err);
      comp.loginForm.setValue({ email: 'a@b.it', password: 'x' });

      await comp.doLogin();

      expect(comp.error()).toContain('attesa di approvazione');
    });

    it('NON parla di approvazione per un errore generico della Lambda', async () => {
      // Regressione: prima bastava il TIPO dell'eccezione, così un errore
      // transitorio veniva mostrato come "account in attesa di approvazione".
      await setup('login');
      const err: any = new Error('Rate exceeded');
      err.name = 'UserLambdaValidationException';
      auth.login.and.rejectWith(err);
      comp.loginForm.setValue({ email: 'a@b.it', password: 'x' });

      await comp.doLogin();

      expect(comp.error()).not.toContain('approvazione');
      expect(comp.error()).toContain('Riprova');
    });

    it('traduce le credenziali errate', async () => {
      await setup('login');
      const err: any = new Error('Incorrect username or password.');
      err.name = 'NotAuthorizedException';
      auth.login.and.rejectWith(err);
      comp.loginForm.setValue({ email: 'a@b.it', password: 'x' });

      await comp.doLogin();

      expect(comp.error()).toBe('Email o password non corretti.');
    });
  });

  describe('recupero password', () => {
    it('chiede il codice per l\'indirizzo indicato', async () => {
      await setup('reset');
      comp.resetForm.setValue({ email: 'mario@example.com' });

      await comp.doReset();

      expect(auth.requestPasswordReset).toHaveBeenCalledWith('mario@example.com');
    });

    it('non rivela se l\'indirizzo è registrato', async () => {
      // Il pool ha preventUserExistenceErrors: dire "non esiste" permetterebbe
      // di scoprire chi è iscritto. Anche l'utente sconosciuto va al passo 2.
      await setup('reset');
      const err: any = new Error('User does not exist.');
      err.name = 'UserNotFoundException';
      auth.requestPasswordReset.and.rejectWith(err);
      comp.resetForm.setValue({ email: 'ignoto@example.com' });

      await comp.doReset();

      expect(comp.error()).toBeNull();
    });

    it('applica alla nuova password le stesse regole della registrazione', async () => {
      await setup('reset-confirm');
      const { password, password2 } = comp.resetConfirmForm.controls;

      password.setValue('debole');
      expect(password.valid).withContext('password troppo debole').toBeFalse();

      password.setValue('Password1');
      password2.setValue('Password2');
      expect(password2.hasError('mismatch')).toBeTrue();

      password2.setValue('Password1');
      expect(password2.valid).toBeTrue();
    });

    it('rivaluta la ripetizione se la nuova password cambia DOPO', async () => {
      await setup('reset-confirm');
      const { password, password2 } = comp.resetConfirmForm.controls;
      password.setValue('Password1');
      password2.setValue('Password1');

      password.setValue('Password9');

      expect(password2.hasError('mismatch')).toBeTrue();
    });

    it('non salva se le due password non coincidono', async () => {
      await setup('reset-confirm');
      comp.resetConfirmForm.patchValue({
        email: 'mario@example.com', code: '123456', password: 'Password1', password2: 'Password2',
      });

      await comp.doResetConfirm();

      expect(auth.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('salva la nuova password col codice ricevuto', async () => {
      await setup('reset-confirm');
      comp.resetConfirmForm.patchValue({
        email: 'mario@example.com', code: '123456', password: 'Password1', password2: 'Password1',
      });

      await comp.doResetConfirm();

      expect(auth.confirmPasswordReset).toHaveBeenCalledWith('mario@example.com', '123456', 'Password1');
    });

    it('il rinvio usa il codice di REIMPOSTAZIONE, non quello di registrazione', async () => {
      // Sono due codici diversi: rinviare quello di verifica dell'account qui
      // non servirebbe a nulla.
      await setup('reset-confirm');
      comp.resetConfirmForm.patchValue({ email: 'mario@example.com' });

      await comp.resend();

      expect(auth.requestPasswordReset).toHaveBeenCalledWith('mario@example.com');
      expect(auth.resendCode).not.toHaveBeenCalled();
    });

    it('nella conferma normale il rinvio usa il codice di registrazione', async () => {
      await setup('confirm');
      comp.confirmForm.patchValue({ email: 'mario@example.com' });

      await comp.resend();

      expect(auth.resendCode).toHaveBeenCalledWith('mario@example.com');
      expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('dalla schermata di accesso si raggiunge il recupero', async () => {
      await setup('login');
      const link: HTMLAnchorElement | null =
        fixture.nativeElement.querySelector('a[href="/password-dimenticata"]');
      expect(link).withContext('link "Password dimenticata?"').toBeTruthy();
    });
  });

  describe('impaginazione dei campi', () => {
    it('un hint che va a capo non si sovrappone al campo successivo', async () => {
      // Material riserva sotto ogni campo UNA riga di altezza fissa e vi
      // posiziona hint ed errori in absolute: su schermo stretto l'hint della
      // password (due righe) sbordava sulla label di "Ripeti password".
      await setup('register');
      fixture.nativeElement.style.display = 'block';
      fixture.nativeElement.style.width = '360px';
      fixture.detectChanges();

      const fields: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('form mat-form-field'),
      );
      const pwdField = fields.find((f) => f.querySelector('input[formcontrolname=password]'))!;
      const pwd2Field = fields.find((f) => f.querySelector('input[formcontrolname=password2]'))!;
      const hint = pwdField.querySelector('mat-hint') as HTMLElement;

      expect(hint).withContext('il campo password ha un hint').toBeTruthy();
      // Se non va a capo il test non proverebbe nulla: verifichiamo l'ipotesi.
      expect(hint.getBoundingClientRect().height)
        .withContext('a 360px l\'hint occupa più di una riga')
        .toBeGreaterThan(20);

      expect(hint.getBoundingClientRect().bottom)
        .withContext('il testo dell\'hint resta sopra il campo successivo')
        .toBeLessThanOrEqual(pwd2Field.getBoundingClientRect().top);
    });

    it('l\'errore compare sotto il campo, non dentro il riquadro', async () => {
      // Regressione: con <mat-error> dentro @if ANNIDATI la content projection
      // di Material non lo raccoglieva e finiva dentro il bordo del campo.
      await setup('register');
      const { password, password2 } = comp.registerForm.controls;
      password.setValue('Password1');
      password2.setValue('Password2');
      password2.markAsTouched();
      fixture.detectChanges();

      const pwd2Field: HTMLElement = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('form mat-form-field'),
      ).find((f) => f.querySelector('input[formcontrolname=password2]'))!;
      const error = pwd2Field.querySelector('mat-error') as HTMLElement;
      const box = pwd2Field.querySelector('.mat-mdc-text-field-wrapper') as HTMLElement;

      expect(error).withContext('l\'errore di mismatch è mostrato').toBeTruthy();
      expect(error.textContent).toContain('non coincidono');
      expect(error.getBoundingClientRect().top)
        .withContext('l\'errore sta sotto il riquadro del campo')
        .toBeGreaterThanOrEqual(box.getBoundingClientRect().bottom);
    });
  });
});
