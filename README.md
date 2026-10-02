# db-latency-jest

Reproduit à petite échelle le scénario d'entretien :

> Une API Node.js a 20 réplicas, chacun avec un pool de 30 connexions. Pendant un pic,
> la latence dépasse 10 s et la base approche sa limite de connexions. Passer à 60 réplicas
> aggrave le problème.

Ici : **PostgreSQL réel (Docker)**, **réplicas = processus enfants** (`child_process.fork`),
échelle **4 vs 12 réplicas** (même ratio 1:3), tests **Jest**.

## Prérequis (WSL)

- Node 24 + npm
- Docker accessible depuis WSL (Docker Desktop avec l'intégration WSL activée, ou Docker Engine)

## Lancer

```bash
npm install
npm run db:up      # démarre Postgres 16 (max_connections=200, 2 CPU) sur le port 5433
npm test           # compile l'app, prépare la table, lance les 5 scénarios (~3-4 min)
npm run db:down    # arrête et supprime le conteneur
```

Autres commandes :

| Commande | Effet |
|---|---|
| `npm run test:unit` | tests unitaires purs (calcul du budget de connexions), sans base |
| `npm run test:logs` | `npm test` avec les logs des réplicas |
| `npx jest test/03 --runInBand` | un seul scénario |
| `SKIP_BUILD=1 npx jest test/03 --runInBand` | idem sans recompiler |

Au premier lancement, 500 000 lignes sont insérées dans `orders` (quelques secondes).

## Comment ça marche

```
Jest (processus parent)
 ├─ fork ─> réplica 1 (Nest, port 4100, pool propre) ─┐
 ├─ fork ─> réplica 2 (Nest, port 4101, pool propre) ─┼─> PostgreSQL (Docker, 200 connexions max)
 └─ fork ─> ...                                       ─┘
 └─ générateur de charge (fetch) + échantillonneur de connexions (pg_stat_activity)
```

Chaque réplica est configuré uniquement par variables d'environnement (`src/config.ts`) :

| Variable | Rôle | Défaut |
|---|---|---|
| `POOL_SIZE` | connexions max de ce réplica | 30 |
| `POOL_ACQUIRE_TIMEOUT_MS` | attente max d'une connexion libre (0 = infinie) | 0 |
| `STATEMENT_TIMEOUT_MS` | Postgres annule les requêtes plus longues (0 = aucune) | 0 |
| `ENABLE_WORKER` | active le job planifié | off |
| `WORKER_POOL_SIZE` | pool dédié au job (0 = partage le pool des utilisateurs) | 0 |

Endpoints de l'API :

| Route | Requête | Sert à |
|---|---|---|
| `/fast` | lecture par clé primaire (~1 ms) | trafic utilisateur normal |
| `/cpu` | calcul CPU côté Postgres (~20-50 ms) | saturer les cœurs de la base |
| `/sleep?ms=200` | `pg_sleep` : garde une connexion sans CPU | requête lente déterministe |
| `/by-customer` | filtre sur `customer_id` | scan complet sans index, rapide avec |
| `/summary-n1` / `/summary` | N+1 requêtes / une seule | correction des requêtes |
| `/stats` | état du pool (total, idle, waiting) | voir la file d'attente |

## Ce que chaque test prouve

| Test | Scénario | Vérification |
|---|---|---|
| `01-scaling-worse` | même charge, 4 puis 12 réplicas (pool 30) | 4 réplicas : 0 erreur, ≤ 120 connexions. 12 réplicas : erreurs `too many clients`, connexions au plafond (~200) |
| `02-small-pool` | 12 réplicas, pool 30 puis pool 5 | pool 5 : 0 erreur, ≤ 60 connexions, débit au moins égal à 70 % de celui du pool 30 |
| `03-worker-isolation` | trafic `/fast` pendant un job lourd | pool partagé : p95 en centaines de ms. Pool isolé : p95 au moins 3 fois plus bas |
| `04-timeouts-fail-fast` | surcharge, avec et sans timeout d'acquisition ; requête de 3 s avec `statement_timeout` | sans timeout : tout le monde attend des secondes. Avec : erreurs rapides, p95 au moins divisé par 2, requête longue annulée en < 1,5 s |
| `05-query-fix` | sans/avec index ; N+1 vs requête unique | index : p95 au moins 3 fois plus bas. Requête unique : p50 nettement plus bas |

Les assertions sont **relatives** (comparaison entre deux scénarios) et non des seuils absolus
en millisecondes, car la vitesse dépend de votre machine.

## Lire les résultats

Chaque test affiche un tableau, par exemple :

```
scenario               ok   failed  ok/s  p50 ms  p95 ms  peak conns
4 replicas  x pool 30  346  0       23    9544    14732   120
12 replicas x pool 30  267  117     23    8574    11358   199
  12 replicas x pool 30 failures: too many clients x117
```

- `peak conns` : maximum de connexions ouvertes sur Postgres pendant le test.
- `failed` et la ligne `failures` : pourquoi les requêtes ont échoué.
- `ok/s` : débit des requêtes réussies. Quand il ne monte pas avec plus de réplicas, c'est
  la base qui plafonne, pas Node.

## Limites à connaître

- Le générateur de charge est « en boucle fermée » (chaque utilisateur attend sa réponse avant d'envoyer la suivante). Par la loi de Little, la latence vaut alors ~ utilisateurs / débit :
  quand le débit est plafonné par la base, ajouter des connexions n'améliore rien. Dans la vraie vie, s'y ajoutent les retries des clients.
- `pg_sleep` (tests 3 et 4) modélise une requête qui garde sa connexion pendant X ms sans dépendre de la vitesse de votre CPU. Les tests 1, 2 et 5 utilisent du vrai travail CPU/disque.
- Sur une machine lente ou très chargée, un test peut échouer de justesse : relancez-le seul, ou adaptez `durationMs` / `concurrency` dans le fichier du test.
- Si le port 5433 est pris, changez-le dans `docker-compose.yml` et exportez `DATABASE_URL`.
- Si Docker tourne côté Windows, `localhost:5433` est normalement joignable depuis WSL.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `Cannot reach Postgres at ...` | oubli de `npm run db:up`, ou Docker non démarré |
| `replica 41xx exited before being ready` | port occupé par un ancien processus : `pkill -f dist/main.js` |
| Test instable | machine surchargée : fermez les autres programmes ou allongez `durationMs` |

## Structure

```
docker-compose.yml          Postgres 16 (max_connections=200, 2 CPU)
src/config.ts               configuration par variables d'environnement
src/db/                     pool pg (DbService) + calcul de budget de connexions (+ test unitaire)
src/orders/                 endpoints de test
src/workers/                job planifié (@nestjs/schedule)
test/harness/               fork des réplicas, générateur de charge, échantillonneur, tableau
test/global-setup.ts        compile, attend Postgres, prépare la table
test/0X-*.spec.ts           les 5 scénarios
```
