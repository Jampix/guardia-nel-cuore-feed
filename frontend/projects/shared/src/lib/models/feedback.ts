/**
 * Modelli condivisi dell'app "Guardia nel Cuore" (client + admin).
 * Allineati agli attributi della tabella DynamoDB `Feedbacks`
 * (vedi docs/02-architettura-aws.md §5).
 */

/** Stato di lavorazione di un feedback (ciclo di vita nel backoffice). */
export type FeedbackStatus =
  | 'proposta'
  | 'in_valutazione'
  | 'in_lavorazione'
  | 'risolto'
  | 'archiviato';

/** Visibilità scelta dal cittadino alla creazione. */
export type Visibility = 'pubblico' | 'privato';

/** Categoria tra cui il cittadino sceglie (gestite dal backoffice). */
export interface Category {
  id: string;
  nome: string;
  /** Se false, non è più selezionabile per nuovi feedback. */
  attiva: boolean;
}

/** Un feedback (proposta / segnalazione / idea) di un cittadino. */
export interface Feedback {
  id: string;
  titolo: string;
  descrizione: string;
  categoriaId: string;
  stato: FeedbackStatus;
  visibilita: Visibility;
  /** URL della foto (già risolto, es. presigned GET) — assente se nessuna foto. */
  fotoUrl?: string;
  lat?: number;
  lng?: number;
  /** Etichetta leggibile del luogo, es. "Via Roma". */
  luogo?: string;
  numeroVoti: number;
  /**
   * Ultima risposta pubblica dell'associazione (denormalizzata sul feedback
   * per comodità di lettura). La cronologia completa vivrà in FeedbackComments.
   */
  rispostaPubblica?: string;
  /**
   * Nota interna dello staff: visibile SOLO nel backoffice. L'endpoint pubblico
   * la rimuove dalla risposta (mai esposta ai cittadini).
   */
  notaInterna?: string;
  autoreId: string;
  /** Nickname pubblico dell'autore mostrato in bacheca. */
  autoreNick: string;
  /** Lingua del contenuto ('it' | 'en'). */
  lingua: string;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
}

/** Dati inviati per creare un feedback (POST /feedback). */
export interface CreateFeedbackInput {
  titolo: string;
  descrizione: string;
  categoriaId: string;
  visibilita: Visibility;
  luogo?: string;
  lat?: number;
  lng?: number;
  /** Chiave S3 della foto caricata via presigned PUT. */
  fotoKey?: string;
  lingua?: string;
}

/** Etichette leggibili degli stati (IT), per i chip in UI. */
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  proposta: 'Proposta',
  in_valutazione: 'In valutazione',
  in_lavorazione: 'In lavorazione',
  risolto: 'Risolto',
  archiviato: 'Archiviato',
};
