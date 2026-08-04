import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Scan e Query paginate.
 *
 * DynamoDB restituisce al massimo **1 MB per pagina**: senza seguire
 * `LastEvaluatedKey` si leggono solo i primi risultati e i restanti spariscono
 * **senza alcun errore**. È la forma di guasto peggiore, perché sembra che
 * tutto funzioni: una lista mostra meno elementi del vero, o una cancellazione
 * lascia indietro i dati oltre la prima pagina.
 *
 * `cap` è una rete di sicurezza contro cicli imprevisti, non un limite di
 * business: se scatta viene segnalato nei log invece di troncare in silenzio.
 */
export async function scanAll(
  ddb: DynamoDBDocumentClient,
  input: ConstructorParameters<typeof ScanCommand>[0],
  cap = 20,
): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  let start: Record<string, any> | undefined;
  let pagine = 0;
  do {
    const res = await ddb.send(new ScanCommand({ ...input, ExclusiveStartKey: start }));
    out.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
    pagine++;
    if (pagine >= cap && start) {
      console.warn('scanAll: raggiunto il limite di pagine, risultato incompleto', {
        table: input.TableName,
        pagine,
      });
      break;
    }
  } while (start);
  return out;
}

export async function queryAll(
  ddb: DynamoDBDocumentClient,
  input: ConstructorParameters<typeof QueryCommand>[0],
  cap = 20,
): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  let start: Record<string, any> | undefined;
  let pagine = 0;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey: start }));
    out.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
    pagine++;
    if (pagine >= cap && start) {
      console.warn('queryAll: raggiunto il limite di pagine, risultato incompleto', {
        table: input.TableName,
        pagine,
      });
      break;
    }
  } while (start);
  return out;
}
