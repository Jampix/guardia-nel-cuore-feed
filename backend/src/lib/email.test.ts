import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import { rispondiA } from './email';

const HANDLERS = path.join(__dirname, '..', 'handlers');

describe('rispondiA', () => {
  const originale = process.env.REPLY_TO_EMAIL;
  afterEach(() => {
    if (originale === undefined) delete process.env.REPLY_TO_EMAIL;
    else process.env.REPLY_TO_EMAIL = originale;
  });

  it('restituisce il recapito configurato', () => {
    process.env.REPLY_TO_EMAIL = 'associazione@example.com';
    expect(rispondiA()).toEqual(['associazione@example.com']);
  });

  it('senza configurazione non restituisce nulla, così SES omette il campo', () => {
    // Non un array vuoto: SES rifiuterebbe `ReplyToAddresses: []`? No, lo
    // accetta — ma `undefined` è l'unico valore che lascia il campo fuori dalla
    // richiesta, e un avviso senza Reply-To deve partire comunque.
    delete process.env.REPLY_TO_EMAIL;
    expect(rispondiA()).toBeUndefined();
  });

  it('ignora un valore fatto di soli spazi', () => {
    // Una variabile d'ambiente svuotata male ("REPLY_TO_EMAIL= ") produrrebbe un
    // Reply-To vuoto, e SES rifiuta l'intero invio: l'avviso si perderebbe per
    // colpa del campo aggiunto per non perdere le risposte.
    process.env.REPLY_TO_EMAIL = '   ';
    expect(rispondiA()).toBeUndefined();
  });
});

/**
 * Guardia strutturale: il Reply-To non serve a niente se un invio se lo
 * dimentica, e dimenticarselo non produce nessun errore — l'email parte, la
 * risposta si perde, e nessuno lo scopre. Invece di fidarsi della disciplina,
 * qui si verifica che OGNI `SendEmailCommand` del backend lo imposti.
 */
describe('tutti gli invii impostano il Reply-To', () => {
  const sorgenti = readdirSync(HANDLERS)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ file: f, testo: readFileSync(path.join(HANDLERS, f), 'utf-8') }));

  /** Estrae gli argomenti di ogni `new SendEmailCommand(...)` bilanciando le parentesi. */
  function invii(testo: string): string[] {
    const trovati: string[] = [];
    const marcatore = 'new SendEmailCommand(';
    let i = testo.indexOf(marcatore);
    while (i !== -1) {
      let profondita = 0;
      let j = i + marcatore.length - 1;
      do {
        if (testo[j] === '(') profondita++;
        else if (testo[j] === ')') profondita--;
        j++;
      } while (profondita > 0 && j < testo.length);
      trovati.push(testo.slice(i, j));
      i = testo.indexOf(marcatore, j);
    }
    return trovati;
  }

  const conInvii = sorgenti.filter((s) => s.testo.includes('new SendEmailCommand('));

  it('trova gli handler che inviano email', () => {
    // Se questo numero cala senza una ragione, la guardia sotto sta verificando
    // meno di quanto crede: il test peggiore è quello che passa a vuoto.
    expect(conInvii.length, `handler con invii: ${conInvii.map((s) => s.file)}`).toBe(5);
    expect(conInvii.flatMap((s) => invii(s.testo)).length).toBe(6);
  });

  for (const { file, testo } of sorgenti) {
    for (const [n, invio] of invii(testo).entries()) {
      it(`${file} — invio ${n + 1}`, () => {
        expect(invio, `manca ReplyToAddresses in ${file}:\n${invio}`).toContain(
          'ReplyToAddresses',
        );
        expect(invio, `${file}: il Reply-To non passa dall'helper`).toContain('rispondiA()');
      });
    }
  }
});
