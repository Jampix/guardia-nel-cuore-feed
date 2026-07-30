import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from 'shared';
import { App } from './app';

/**
 * Shell del backoffice: la navigazione (sidenav e tab mobile) compare solo da
 * autenticati, così la schermata di accesso resta pulita e non espone le voci
 * riservate allo staff.
 */
describe('App (shell backoffice)', () => {
  async function setup(utente: unknown) {
    const user = signal(utente) as WritableSignal<unknown>;
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: AuthService, useValue: { user, logout: () => Promise.resolve() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, user };
  }

  it('si crea', async () => {
    const { fixture } = await setup(null);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('senza sessione NON mostra la navigazione dello staff', async () => {
    const { fixture } = await setup(null);
    expect(fixture.nativeElement.querySelector('aside.sidenav')).toBeNull();
    expect(fixture.nativeElement.querySelector('nav.tabbar-mobile')).toBeNull();
  });

  it('da autenticati mostra sidenav e tab mobile', async () => {
    const { fixture } = await setup({ nickname: 'Staff' });
    expect(fixture.nativeElement.querySelector('aside.sidenav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('nav.tabbar-mobile')).toBeTruthy();
  });
});
