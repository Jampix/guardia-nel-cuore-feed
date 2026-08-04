import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfermaDialog, ConfermaDialogData } from 'shared';

/**
 * Conferma per azioni distruttive (vive in `shared`, testata qui perché è dove
 * la CI esegue i test del frontend).
 *
 * La regola che conta è l'abilitazione: sull'eliminazione dell'account protegge
 * dal clic riflesso su un pulsante rosso, quindi non deve mai attivarsi con la
 * parola sbagliata.
 */
describe('ConfermaDialog', () => {
  async function setup(data: ConfermaDialogData) {
    await TestBed.configureTestingModule({
      imports: [ConfermaDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: () => {} } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ConfermaDialog);
    fixture.detectChanges();
    return fixture;
  }

  const semplice: ConfermaDialogData = {
    titolo: 'Eliminare?',
    messaggio: 'Non si torna indietro.',
    azione: 'Elimina',
  };

  it('senza parola chiave la conferma è subito attiva', async () => {
    const { componentInstance: c } = await setup(semplice);
    expect(c.abilitato()).toBeTrue();
  });

  it('con parola chiave parte DISABILITATA', async () => {
    const { componentInstance: c } = await setup({ ...semplice, parolaChiave: 'ELIMINA' });
    expect(c.abilitato()).toBeFalse();
  });

  it('resta disabilitata con la parola incompleta o sbagliata', async () => {
    const { componentInstance: c } = await setup({ ...semplice, parolaChiave: 'ELIMINA' });

    for (const tentativo of ['elimin', 'ELIMIN', 'cancella', 'ELIMINAA', '']) {
      c.digitato.set(tentativo);
      expect(c.abilitato()).withContext(`"${tentativo}" non deve abilitare`).toBeFalse();
    }
  });

  it('si abilita con la parola esatta, ignorando maiuscole e spazi', async () => {
    const { componentInstance: c } = await setup({ ...semplice, parolaChiave: 'ELIMINA' });

    for (const tentativo of ['ELIMINA', 'elimina', ' Elimina ']) {
      c.digitato.set(tentativo);
      expect(c.abilitato()).withContext(`"${tentativo}" deve abilitare`).toBeTrue();
    }
  });

  it('mostra l\'elenco di ciò che viene rimosso', async () => {
    const fixture = await setup({
      ...semplice,
      elenco: ['Il tuo profilo', 'Le tue proposte'],
    });

    const voci = fixture.nativeElement.querySelectorAll('.elenco li');
    expect(voci.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Il tuo profilo');
  });

  it('il pulsante di conferma riflette lo stato di abilitazione', async () => {
    const fixture = await setup({ ...semplice, parolaChiave: 'ELIMINA' });
    const bottone = (): HTMLButtonElement =>
      fixture.nativeElement.querySelector('button.pericolo');

    expect(bottone().disabled).toBeTrue();

    fixture.componentInstance.digitato.set('ELIMINA');
    fixture.detectChanges();

    expect(bottone().disabled).toBeFalse();
  });
});
