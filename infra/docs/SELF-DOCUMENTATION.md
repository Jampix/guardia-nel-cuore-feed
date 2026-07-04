# 📚 Self-Documentation Guide

Questa guida spiega come utilizzare la self-documentation integrata nel template CDK.

## 🎯 Cos'è la Self-Documentation?

La self-documentation significa che il codice si documenta da solo tramite:
- **JSDoc comments** nel codice sorgente
- **TypeScript types** espliciti
- **Documentazione generata automaticamente** da TypeDoc

## 🔧 Come Generare la Documentazione

### Generazione Documentazione API

```bash
# Genera documentazione da JSDoc comments
npm run docs

# La documentazione viene generata in docs/api/
```

### Generazione Diagrammi Architettura

```bash
# Genera diagrammi dopo synth
npm run synth
npm run diagram

# Oppure tutto in uno
npm run diagram:all

# I diagrammi vengono generati in docs/diagrams/
```

### Visualizzazione

Dopo la generazione, puoi visualizzare:
- **Documentazione API**: `docs/api/` (file markdown)
- **Diagrammi Architettura**: `docs/diagrams/` (immagini SVG/PNG)
- **Online**: Se configurato, può essere pubblicata su GitHub Pages o altro

## 📝 Standard JSDoc nel Template

### Interfaces

```typescript
/**
 * Configuration interface for the entire project.
 * 
 * @example
 * ```typescript
 * const config: ProjectConfig = {
 *   projectName: 'my-project',
 *   // ...
 * };
 * ```
 */
export interface ProjectConfig {
  /** Project name used for resource naming */
  projectName: string;
}
```

### Classes

```typescript
/**
 * Construct for creating a VPC.
 * 
 * This construct creates a VPC with public and private subnets.
 * 
 * @example
 * ```typescript
 * const vpc = new VpcConstruct(this, 'VPC', {
 *   config: projectConfig
 * });
 * ```
 */
export class VpcConstruct extends Construct {
  /** The created VPC instance */
  public readonly vpc: Vpc;

  /**
   * Creates a new VPC construct.
   * 
   * @param scope - The parent construct
   * @param id - Unique identifier
   * @param props - Properties for the construct
   */
  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    // ...
  }
}
```

### Methods

```typescript
/**
 * Validates the project configuration.
 * 
 * @param config - The configuration to validate
 * @returns Validation result with errors and warnings
 * 
 * @example
 * ```typescript
 * const result = ConfigValidator.validate(config);
 * if (!result.isValid) {
 *   console.error('Invalid configuration');
 * }
 * ```
 */
static validate(config: ProjectConfig): ValidationResult {
  // ...
}
```

## 📊 Diagrammi Architettura

### Generazione con cdk-dia

`cdk-dia` genera automaticamente diagrammi visuali dell'architettura CDK:

```bash
# Genera CloudFormation template
npm run synth

# Genera diagrammi
npm run diagram

# Oppure tutto insieme
npm run diagram:all
```

### Output

I diagrammi vengono generati in `docs/diagrams/`:
- **SVG**: Diagrammi vettoriali scalabili
- **PNG**: Immagini raster
- **HTML**: Diagrammi interattivi

### Formati Disponibili

```bash
# SVG (default)
cdk-dia --target docs/diagrams --cdk-out cdk.out

# PNG
cdk-dia --target docs/diagrams --cdk-out cdk.out --format png

# HTML interattivo
cdk-dia --target docs/diagrams --cdk-out cdk.out --format html
```

### Vantaggi Diagrammi

1. **Visualizzazione Architettura**: Capire rapidamente la struttura
2. **Documentazione Automatica**: Sempre aggiornati con il codice
3. **Presentazioni**: Utili per spiegare l'architettura
4. **Onboarding**: Aiutano nuovi sviluppatori a capire il sistema

```
docs/api/
├── README.md                    # Indice principale
├── classes/                     # Documentazione classi
│   ├── VpcConstruct.md
│   ├── Ec2InstanceConstruct.md
│   └── ...
├── interfaces/                  # Documentazione interfacce
│   ├── ProjectConfig.md
│   └── ...
└── modules/                     # Documentazione moduli
    └── ...
```

## ✅ Best Practices JSDoc

### 1. Documenta sempre le interfacce pubbliche
```typescript
/**
 * Properties for EC2 instance creation
 */
export interface Ec2InstanceConstructProps {
  /** Project configuration */
  config: ProjectConfig;
}
```

### 2. Aggiungi esempi per constructs complessi
```typescript
/**
 * @example
 * ```typescript
 * const instance = new Ec2InstanceConstruct(this, 'Instance', {
 *   config: config,
 *   vpc: vpc,
 *   securityGroup: sg
 * });
 * ```
 */
```

### 3. Documenta parametri e return values
```typescript
/**
 * @param config - Configuration object
 * @param environment - Target environment
 * @returns Validation result
 */
```

### 4. Usa tag JSDoc appropriati
- `@param` - Parametri funzione/construct
- `@returns` - Valore di ritorno
- `@example` - Esempi di utilizzo
- `@throws` - Eccezioni possibili
- `@see` - Riferimenti correlati

## 🔄 Aggiornare la Documentazione

Quando modifichi il codice:

1. **Aggiorna i JSDoc comments** nei file modificati
2. **Rigenera la documentazione**: `npm run docs`
3. **Verifica** che la documentazione rifletta le modifiche
4. **Commit** sia il codice che la documentazione generata

## 📖 Esempi nel Template

Gli esempi di JSDoc sono presenti in:

- ✅ `lib/config/interfaces.ts` - Interfacce principali
- ✅ `lib/constructs/networking/vpc.ts` - Construct esempio
- 📝 Altri file - Da aggiungere seguendo lo stesso pattern

## 🎯 Vantaggi Self-Documentation

1. **Documentazione sempre aggiornata** - Si genera dal codice
2. **DRY (Don't Repeat Yourself)** - Documentazione nel codice, non duplicata
3. **IDE Integration** - Autocompletamento e tooltips migliorati
4. **Type Safety** - TypeScript + JSDoc = documentazione type-safe
5. **Accessibilità** - Developer vedono docs direttamente nell'IDE

## 🔍 Visualizzare Documentazione in IDE

Con JSDoc comments, la documentazione appare automaticamente:
- **VS Code**: Hover su classi/funzioni mostra JSDoc
- **IntelliJ/WebStorm**: Autocompletamento con documentazione
- **TypeScript Language Server**: Tutti gli IDE moderni supportano

## 📚 Riferimenti

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeDoc Documentation](https://typedoc.org/)
- [TypeScript Documentation Comments](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
