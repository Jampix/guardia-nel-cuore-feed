/**
 * Reply-To di tutte le email che l'app invia.
 *
 * Il mittente è `noreply@feed.guardianelcuore.it`, che **non è una casella**:
 * chi riceveva un avviso e premeva "Rispondi" scriveva nel vuoto, senza
 * accorgersene. Per un'app in cui l'associazione chiede ai cittadini di
 * partecipare, una risposta persa è un danno peggiore dell'avviso mancato.
 *
 * L'indirizzo è il recapito dell'associazione, lo stesso pubblicato
 * nell'informativa privacy: chi risponde a una notifica e chi scrive per
 * esercitare un diritto finiscono nella stessa casella, che è quello che si
 * aspetta.
 *
 * Se non è configurato si restituisce `undefined`, così SES omette il campo e
 * l'email parte comunque: un avviso senza Reply-To è meno utile, non inutile, e
 * non deve diventare il motivo per cui non viene inviato.
 *
 * Letto a ogni chiamata e non al caricamento del modulo: gli invii sono già
 * best-effort e questo evita che l'ordine degli import decida se il campo c'è.
 */
export function rispondiA(): string[] | undefined {
  const email = process.env.REPLY_TO_EMAIL?.trim();
  return email ? [email] : undefined;
}
