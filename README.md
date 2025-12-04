# NodeFootPrint
![Node.js CI](https://github.com/web-resilience/NodeFootPrint/actions/workflows/node-FootPrint.yaml/badge.svg)

Un **agent Node.js** pour mesurer :

-  **Énergie CPU/SoC** (via RAPL ou modèle empirique)
-  **Émissions CO₂e** (avec intensité carbone dynamique)
-  **Santé de l’event-loop** (latence, utilisation)
-  Export métriques (Prometheus, JSON, NDJSON)

##  Objectif

Aider **développeurs et DevOps** à :
- comprendre la consommation énergétique de leurs applications,
- calibrer les ressources (CPU/RAM/IO),
- suivre l’empreinte carbone en temps réel,
- détecter les saturations de l’event-loop.
