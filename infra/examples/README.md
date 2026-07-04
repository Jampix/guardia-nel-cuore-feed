# Esempi di Utilizzo del Template CDK

Questa cartella contiene esempi pratici di come utilizzare e personalizzare il template CDK.

## 📁 Struttura degli Esempi

- `basic-setup/` - Configurazione base per un progetto semplice
- `advanced-setup/` - Configurazione avanzata con tutte le features
- `custom-constructs/` - Esempi di constructs personalizzati
- `multi-environment/` - Configurazione per più ambienti

## 🚀 Quick Start

1. **Copia il template** nella tua nuova repository
2. **Personalizza** `config/project-config.ts`
3. **Configura** gli ambienti in `lib/config/environments/`
4. **Deploy** con `npm run deploy:dev`

## 📋 Checklist di Personalizzazione

- [ ] Aggiorna `projectName` in `config/project-config.ts`
- [ ] Aggiorna `projectCode` in `config/project-config.ts`
- [ ] Configura gli account ID per ogni ambiente
- [ ] Personalizza le features per ambiente
- [ ] Aggiorna il dominio DNS se necessario
- [ ] Configura le chiavi SSH
- [ ] Testa il deploy in dev

## 🔧 Personalizzazioni Comuni

### Modificare il Tipo di Istanza
```typescript
// In lib/config/environments/dev.ts
compute: {
  web: {
    instanceType: 't3.large', // Cambia qui
    // ...
  }
}
```

### Aggiungere Porte Personalizzate
```typescript
// In lib/config/environments/dev.ts
compute: {
  web: {
    allowedPorts: [22, 80, 443, 8001, 11434, 3000], // Aggiungi 3000
    // ...
  }
}
```

### Configurare Backup
```typescript
// In lib/config/environments/staging.ts
features: {
  backup: {
    enabled: true,
    retentionDays: 30,
    schedule: 'cron(0 2 * * ? *)' // Backup alle 2 AM
  }
}
```

## 🆘 Risoluzione Problemi

### Errore di Permessi
```bash
# Assicurati di avere i permessi AWS configurati
aws configure list
```

### Errore di Bootstrap
```bash
# Bootstrap CDK se non fatto
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Errore di Naming
```bash
# Controlla che i nomi siano unici
cdk synth | grep -i "name"
```
