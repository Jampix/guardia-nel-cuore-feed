# Specifiche Funzionali — Guardia nel Cuore (Feedback Civico)

> Fase **Inception** (AI-DLC, versione leggera).
> Stato: **FINALIZZATO** — v1.0 · 04/07/2026

## 1. Visione e obiettivo

Un'applicazione web attraverso cui i **cittadini di Guardia Piemontese** possono
lasciare **feedback, proposte, idee e segnalazioni** sul paese. L'iniziativa è
promossa dall'associazione **Guardia nel Cuore** (non è un canale ufficiale del
Comune): l'associazione raccoglie la voce dei cittadini e la gestisce da un
backoffice interno, con l'obiettivo di dare visibilità alle esigenze del
territorio e, dove possibile, farsene portavoce.

**Obiettivo di successo (semplice e misurabile):** i cittadini riescono a inviare
un feedback in meno di 1 minuto, e i membri dell'associazione riescono a leggere,
categorizzare e dare uno stato a ogni feedback da un unico pannello.

## 2. Attori (personas)

| Attore | Chi è | Cosa vuole |
|---|---|---|
| **Cittadino** | Residente/visitatore di Guardia Piemontese | Segnalare un problema o proporre un'idea, e votare le proposte pubbliche altrui |
| **Membro associazione** | Volontario dell'associazione (backoffice) | Leggere, filtrare, categorizzare, rispondere e aggiornare lo stato dei feedback |
| **Amministratore** | Referente tecnico dell'associazione | Gestire membri, utenti e impostazioni di base |

## 3. Ambito

### In scope (v1)
- Registrazione/login cittadino via **email + password / OTP** (Cognito).
- Invio di un feedback con: **titolo, descrizione, categoria**, **foto** (opz.) e **posizione/mappa** (opz.).
- Alla creazione il cittadino sceglie la **visibilità**: **pubblico e votabile** oppure **privato**.
- **Bacheca pubblica**: elenco dei feedback pubblici, con possibilità di **votarli** (1 voto per utente).
- Il cittadino vede **la lista dei propri feedback** e il loro **stato**.
- **Backoffice associazione**: lista feedback con filtri (categoria, stato, data, visibilità), dettaglio, cambio stato, note interne, risposta pubblica.
- **Gestione categorie** dal backoffice.
- **Notifica email** al cittadino quando lo stato del suo feedback cambia.

### Out of scope (per ora)
- SPID/CIE e integrazioni ufficiali con il Comune.
- App mobile nativa (l'app web sarà comunque *mobile-first*/responsive).
- Notifiche diverse dall'email (push, SMS…).

## 4. User stories (Units of Work)

### Cittadino
- **US-01** — Come cittadino voglio registrarmi con la mia email e verificarla, così da poter inviare feedback.
- **US-02** — Come cittadino voglio accedere e recuperare la password se la dimentico.
- **US-03** — Come cittadino voglio inviare un feedback scegliendo una **categoria** (tra quelle create dall'associazione).
- **US-04** — Come cittadino voglio (opzionalmente) **allegare una foto** e **indicare il luogo su mappa**.
- **US-05** — Come cittadino voglio scegliere se il mio feedback è **pubblico e votabile** oppure **privato**.
- **US-06** — Come cittadino voglio vedere l'elenco dei feedback che ho inviato e il loro stato.
- **US-07** — Come cittadino voglio **sfogliare la bacheca pubblica** e **votare** i feedback pubblici che condivido (max 1 voto per feedback).
- **US-08** — Come cittadino voglio ricevere una **email** quando il mio feedback cambia stato.

### Membro associazione (backoffice)
- **US-09** — Come membro voglio accedere a un'area riservata separata dai cittadini.
- **US-10** — Come membro voglio vedere tutti i feedback con filtri per categoria/stato/data/visibilità e ricerca testuale.
- **US-11** — Come membro voglio aprire un feedback e cambiarne lo **stato** (*Ricevuto → In valutazione → Preso in carico → Realizzato / Archiviato*).
- **US-12** — Come membro voglio aggiungere **note interne** (non visibili al cittadino).
- **US-13** — Come membro voglio (opzionale) scrivere una **risposta pubblica** visibile al cittadino.
- **US-14** — Come membro (o admin) voglio **gestire le categorie** (creare, rinominare, disattivare) tra cui i cittadini scelgono.

### Amministratore
- **US-15** — Come admin voglio invitare/abilitare i **membri** dell'associazione al backoffice.
- **US-16** — Come admin voglio vedere **tutti gli utenti** registrati sulla piattaforma.

## 5. Modello dati (bozza concettuale)

- **Utente** (gestito da Cognito): id, email, ruolo (`cittadino` | `membro` | `admin`).
- **Categoria**: id, nome, attiva (bool), creatoDa, data.
- **Feedback**: id, autore (userId), titolo, descrizione, categoriaId, stato, **visibilità** (`pubblico` | `privato`), foto (URL), posizione (testo + lat/lng), **numeroVoti**, dataCreazione, dataAggiornamento.
- **Voto**: id, feedbackId, userId, data. *(vincolo: 1 voto per (feedbackId, userId))*
- **NotaInterna**: id, feedbackId, autore (membro), testo, data.
- **RispostaPubblica**: id, feedbackId, autore (membro), testo, data.

## 6. Requisiti non funzionali
- **Mobile-first**, semplice e accessibile (molti utenti non tecnici/anziani).
- **Costi minimi** (serverless, scala a zero).
- **Privacy/GDPR**: raccogliamo email e contenuti dei feedback → serve informativa privacy e possibilità di cancellare il proprio account/dati. I feedback pubblici mostrano l'autore? → **da decidere** (consiglio: mostrare solo nome/nickname, non l'email).
- **Anti-spam**: verifica email + eventuale rate limiting / captcha.
- Lingua interfaccia: **bilingue Italiano / Inglese** già in v1 (i18n).

## 7. Decisioni prese (tutte le questioni aperte sono chiuse)
- **Nome app**: **Guardia nel Cuore** (stesso nome dell'associazione).
- **Auth** via email/OTP (Cognito) · **Backoffice** per l'associazione · **Serverless** a costi minimi.
- Feedback **pubblico&votabile o privato** a scelta del cittadino (in v1).
- **Foto + posizione/mappa** in v1.
- Notifiche **solo email**.
- **Categorie** gestibili sia dai **membri** sia dall'**admin** dal backoffice.
- Interfaccia **bilingue IT/EN** dalla v1.

### Nota residua (non blocca l'architettura)
- Sui feedback pubblici mostrare un **nome/nickname** dell'autore, mai l'email (da rifinire in fase di design UI).
