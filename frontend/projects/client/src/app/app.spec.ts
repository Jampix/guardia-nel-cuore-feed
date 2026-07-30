import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from 'shared';
import { App } from './app';

/**
 * Shell dell'app cittadini. I contenuti sono privati: la navigazione va
 * mostrata solo a chi ha una sessione, altrimenti chi atterra senza essere
 * autenticato vedrebbe voci che non può usare.
 */
describe('App (shell cittadini)', () => {
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

  it('senza sessione NON mostra la navigazione', async () => {
    const { fixture } = await setup(null);
    expect(fixture.nativeElement.querySelector('nav.tabbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('nav.links')).toBeNull();
  });

  it('con la sessione mostra la navigazione', async () => {
    const { fixture } = await setup({ nickname: 'Mario', email: 'mario@example.com' });
    expect(fixture.nativeElement.querySelector('nav.tabbar')).toBeTruthy();
  });

  it('la navigazione appare appena l\'utente accede', async () => {
    const { fixture, user } = await setup(null);
    expect(fixture.nativeElement.querySelector('nav.tabbar')).toBeNull();

    user.set({ nickname: 'Mario' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('nav.tabbar')).toBeTruthy();
  });
});
