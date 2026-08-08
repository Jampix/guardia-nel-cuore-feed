import { DynamoDBDocumentClient, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { queryAll, scanAll } from './ddb-paginate';

export interface Archivi {
  feedbacks: string;
  votes: string;
  comments: string;
  photoBucket: string;
}

/** Quanto è stato rimosso: serve a poterlo LOGGARE, non a decorare la risposta. */
export interface Rimosso {
  proposte: number;
  votiEspressi: number;
  segnalazioniFatte: number;
}

/**
 * Rimuove tutto ciò che appartiene a un utente, ovunque sia.
 *
 * Estratta da `delete-account.ts`, dov'era scritta per il solo utente
 * autenticato (leggeva il `sub` dal token). Ora la chiamano **due** percorsi — il
 * cittadino che cancella il proprio account e lo staff che rimuove una persona
 * dal backoffice — e prima non era così: «rifiuta» eseguiva solo
 * `AdminDeleteUser`, quindi **lasciava orfani** proposte, foto, voti e
 * segnalazioni, esattamente come cancellare l'utente dalla console. Finora non
 * aveva fatto danni solo perché veniva usato su iscritti che non avevano ancora
 * scritto nulla.
 *
 * NON tocca Cognito: l'account va eliminato **dopo**, dal chiamante. L'ordine
 * conta — se si cancellasse prima l'utente e poi qualcosa qui fallisse, non
 * resterebbe più modo di sapere di chi erano i dati rimasti.
 *
 * Ogni lettura è paginata: qui una pagina mancante significa **dati non
 * cancellati** in una richiesta di oblio, cioè il difetto peggiore possibile su
 * questo flusso.
 */
export async function cancellaDatiUtente(
  ddb: DynamoDBDocumentClient,
  s3: S3Client,
  userId: string,
  a: Archivi,
): Promise<Rimosso> {
  if (!userId) throw new Error('cancellaDatiUtente: userId mancante');

  // 1. Proposte dell'utente.
  const mine = await queryAll(ddb, {
    TableName: a.feedbacks,
    IndexName: 'byAutore',
    KeyConditionExpression: 'autoreId = :a',
    ExpressionAttributeValues: { ':a': userId },
  });
  for (const f of mine) {
    const feedbackId = String(f.id);
    if (f.fotoKey) {
      await s3
        .send(new DeleteObjectCommand({ Bucket: a.photoBucket, Key: String(f.fotoKey) }))
        .catch((e) => console.error('Foto non eliminata:', e));
    }
    // Voti ricevuti da questa proposta (di chiunque): PK = feedbackId.
    const votes = await queryAll(ddb, {
      TableName: a.votes,
      KeyConditionExpression: 'feedbackId = :f',
      ExpressionAttributeValues: { ':f': feedbackId },
    });
    for (const v of votes) {
      await ddb.send(
        new DeleteCommand({ TableName: a.votes, Key: { feedbackId, userId: v.userId } }),
      );
    }
    // Segnalazioni RICEVUTE da questa proposta: senza questo restavano orfane,
    // puntando a una proposta che non esiste più.
    const ricevute = await queryAll(ddb, {
      TableName: a.comments,
      KeyConditionExpression: 'feedbackId = :f',
      ExpressionAttributeValues: { ':f': feedbackId },
    });
    for (const c of ricevute) {
      await ddb.send(new DeleteCommand({ TableName: a.comments, Key: { feedbackId, sk: c.sk } }));
    }
    await ddb.send(new DeleteCommand({ TableName: a.feedbacks, Key: { id: feedbackId } }));
  }

  // 2. Voti espressi dall'utente su proposte altrui (rimaste).
  const cast = await scanAll(ddb, {
    TableName: a.votes,
    FilterExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  });
  for (const v of cast) {
    const feedbackId = String(v.feedbackId);
    await ddb.send(new DeleteCommand({ TableName: a.votes, Key: { feedbackId, userId } }));
    await ddb
      .send(
        new UpdateCommand({
          TableName: a.feedbacks,
          Key: { id: feedbackId },
          UpdateExpression: 'ADD numeroVoti :d',
          ExpressionAttributeValues: { ':d': -1 },
          ConditionExpression: 'attribute_exists(id)',
        }),
      )
      .catch(() => {
        /* proposta già rimossa: ignora */
      });
  }

  // 3. Segnalazioni FATTE dall'utente su proposte altrui. Senza questo passo
  //    restavano con il suo identificativo dentro — un riferimento a una persona
  //    che non c'è più — e il contatore continuava a pesare su quelle proposte
  //    con un'accusa il cui autore non esiste.
  const fatte = await scanAll(ddb, {
    TableName: a.comments,
    FilterExpression: 'autoreId = :u',
    ExpressionAttributeValues: { ':u': userId },
  });
  for (const c of fatte) {
    const feedbackId = String(c.feedbackId);
    await ddb.send(new DeleteCommand({ TableName: a.comments, Key: { feedbackId, sk: c.sk } }));
    if (String(c.tipo) === 'REPORT') {
      await ddb
        .send(
          new UpdateCommand({
            TableName: a.feedbacks,
            Key: { id: feedbackId },
            UpdateExpression: 'ADD segnalazioni :d',
            ExpressionAttributeValues: { ':d': -1 },
            ConditionExpression: 'attribute_exists(id)',
          }),
        )
        .catch(() => {
          /* proposta già rimossa: ignora */
        });
    }
  }

  return { proposte: mine.length, votiEspressi: cast.length, segnalazioniFatte: fatte.length };
}
