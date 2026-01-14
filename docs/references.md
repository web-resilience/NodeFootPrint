## Références

## cpuinfo
- `/proc/cpuinfo`:caractéristiques du processeur. Il est généré dynamiquement par le noyau et contient des infos détaillées sur chaque cœur de CPU.

### principaux champs

`processor`	Numéro du cœur logique (commence à 0)
`vendor_id`	Fabricant du CPU (ex: GenuineIntel, AuthenticAMD)
`cpu family`	Famille du processeur (utile pour identifier la génération)
`model`	Modèle dans la famille
`model name`	Nom commercial du CPU (ex: Intel(R) Core(TM) i7-9700K)
`stepping`	Révision du modèle
`cpu MHz`	Fréquence actuelle en MHz
`cache size`	Taille du cache L2 ou L3
`physical id`	Identifiant du socket physique (utile pour les systèmes multi-processeurs)
`siblings`	Nombre de threads par socket
`core id`	Identifiant du cœur physique
`cpu cores`	Nombre de cœurs physiques par socket
`flags`	Capacités du CPU (ex: vmx pour la virtualisation, sse, aes, etc.)
`power management` Indique les technologies d’économie d’énergie activées

### principaux flags

|Flag	|Signification|
|fpu	|Processeur à virgule flottante intégré (Floating Point Unit)|
|vmx	|Virtualisation Intel VT-x (nécessaire pour les machines virtuelles)|
|svm	|Virtualisation AMD-V|
|aes	|Instructions AES-NI pour le chiffrement matériel|
|sse, sse2, sse4_1, sse4_2  |Instructions SIMD pour calculs vectoriels rapides|
|ht	|Hyper-Threading (threads logiques par cœur physique)|
|nx	|Protection d’exécution (No eXecute bit)|
|lm	|Mode 64 bits (Long Mode)|
|tsc	|Time Stamp Counter — compteur haute précision|
|pat	|Page Attribute Table — gestion avancée de la mémoire|
|rdtscp	|Lecture sécurisée du TSC|
|xsave, xsaveopt	|Sauvegarde/restauration étendue du contexte CPU|
|cpuid	|Support de l’instruction CPUID (permet d’interroger le CPU)|
|clflush	|Instruction pour vider une ligne du cache|
|pni	|SSE3 (aussi appelé Prescott New Instructions)|
|rdrand	|Générateur de nombres aléatoires matériel|

## stat

`/proc/stat` : l’état du système Linux en temps réel

| Champ              | Exemple                          | Signification                                                                 |
|-------------------|----------------------------------|--------------------------------------------------------------------------------|
| `cpu`             | `cpu 2255 34 2290 22625563 ...`  | Statistiques globales CPU (tous les cœurs)                                    |
| `cpuN`            | `cpu0 1130 17 1145 11312781 ...` | Statistiques par cœur logique (N = numéro du cœur)                            |
| `intr`            | `intr 12345678 1 2 3 ...`         | Nombre total d’interruptions depuis le démarrage                              |
| `ctxt`            | `ctxt 987654321`                 | Nombre total de commutations de contexte (changement de tâche)                |
| `btime`           | `btime 1693820000`               | Heure de démarrage du système (timestamp Unix)                                |
| `processes`       | `processes 123456`               | Nombre total de processus créés depuis le démarrage                           |
| `procs_running`   | `procs_running 3`                | Nombre de processus actuellement en exécution                                 |
| `procs_blocked`   | `procs_blocked 1`                | Nombre de processus bloqués en attente d’IO                                   |
| `softirq`         | `softirq 123456 0 1 2 ...`        | Nombre total d’interruptions logicielles par type                             |


```sh 
cat /proc/stat 
> cpu  133578 279 42765 2359858 1679 0 1470 0 0 0
```

| Position | Nom        | Description                                      |
|----------|------------|--------------------------------------------------|
| 1        | user       | Temps CPU en mode utilisateur                    |
| 2        | nice       | Temps utilisateur avec priorité modifiée         |
| 3        | system     | Temps CPU en mode noyau                          |
| 4        | idle       | Temps d’inactivité                               |
| 5        | iowait     | Temps d’attente d’IO                             |
| 6        | irq        | Temps des interruptions matérielles              |
| 7        | softirq    | Temps des interruptions logicielles              |
| 8+       | autres     | Champs additionnels selon le noyau               |

##  `/proc/<pid>/stat` Reference

Ce fichier contient une ligne unique avec **52 champs** décrivant l’état d’un processus Linux. Chaque champ est positionné dans un ordre fixe.

---

##  Champs disponibles

| Index | Nom du champ               | Type       | Description |
|-------|----------------------------|------------|-------------|
| 1     | `pid`                      | int        | Identifiant du processus |
| 2     | `comm`                     | string     | Nom du programme (entre parenthèses) |
| 3     | `state`                    | char       | État du processus |
| 4     | `ppid`                     | int        | PID du processus parent |
| 5     | `pgrp`                     | int        | Groupe de processus |
| 6     | `session`                  | int        | ID de session |
| 7     | `tty_nr`                   | int        | Terminal de contrôle |
| 8     | `tpgid`                    | int        | Groupe de processus du terminal |
| 9     | `flags`                    | unsigned   | Flags du noyau |
| 10    | `minflt`                   | unsigned   | Fautes mineures |
| 11    | `cminflt`                  | unsigned   | Fautes mineures des enfants |
| 12    | `majflt`                   | unsigned   | Fautes majeures |
| 13    | `cmajflt`                  | unsigned   | Fautes majeures des enfants |
| 14    | `utime`                    | unsigned   | Temps CPU utilisateur (en ticks) |
| 15    | `stime`                    | unsigned   | Temps CPU noyau (en ticks) |
| 16    | `cutime`                   | int        | Temps utilisateur des enfants |
| 17    | `cstime`                   | int        | Temps noyau des enfants |
| 18    | `priority`                 | int        | Priorité |
| 19    | `nice`                     | int        | Valeur nice |
| 20    | `num_threads`              | int        | Nombre de threads |
| 21    | `itrealvalue`              | int        | Valeur du timer expiré |
| 22    | `starttime`                | unsigned   | Temps depuis le boot (en ticks) |
| 23    | `vsize`                    | unsigned   | Taille mémoire virtuelle (octets) |
| 24    | `rss`                      | int        | Taille mémoire physique (pages) |
| 25    | `rsslim`                   | unsigned   | Limite mémoire physique |
| 26    | `startcode`                | unsigned   | Adresse début du code |
| 27    | `endcode`                  | unsigned   | Adresse fin du code |
| 28    | `startstack`               | unsigned   | Adresse début de la pile |
| 29    | `kstkesp`                  | unsigned   | Pointeur pile actuel |
| 30    | `kstkeip`                  | unsigned   | Pointeur instruction actuel |
| 31    | `signal`                   | unsigned   | Masque des signaux |
| 32    | `blocked`                  | unsigned   | Signaux bloqués |
| 33    | `sigignore`                | unsigned   | Signaux ignorés |
| 34    | `sigcatch`                 | unsigned   | Signaux capturés |
| 35    | `wchan`                    | unsigned   | Adresse de l’attente |
| 36    | `nswap`                    | unsigned   | Nombre de pages échangées |
| 37    | `cnswap`                   | unsigned   | Pages échangées par les enfants |
| 38    | `exit_signal`             | int        | Signal envoyé à la fin |
| 39    | `processor`                | int        | CPU utilisé |
| 40    | `rt_priority`              | unsigned   | Priorité temps réel |
| 41    | `policy`                   | unsigned   | Politique de scheduling |
| 42    | `delayacct_blkio_ticks`    | unsigned   | Temps d’attente I/O (ticks) |
| 43    | `guest_time`               | unsigned   | Temps CPU invité |
| 44    | `cguest_time`              | int        | Temps CPU invité des enfants |
| 45    | `start_data`               | unsigned   | Début segment data |
| 46    | `end_data`                 | unsigned   | Fin segment data |
| 47    | `start_brk`                | unsigned   | Début heap |
| 48    | `arg_start`                | unsigned   | Début des arguments |
| 49    | `arg_end`                  | unsigned   | Fin des arguments |
| 50    | `env_start`                | unsigned   | Début des variables d’environnement |
| 51    | `env_end`                  | unsigned   | Fin des variables d’environnement |
| 52    | `exit_code`                | int        | Code de sortie du processus |

---

##  États possibles (`state`)

| Code | État                        | Description |
|------|-----------------------------|-------------|
| `R`  | Running                     | En cours d’exécution ou prêt |
| `S`  | Sleeping                    | En attente interruptible |
| `D`  | Uninterruptible sleep       | Attente non interruptible (souvent I/O) |
| `Z`  | Zombie                      | Terminé mais non nettoyé |
| `T`  | Stopped                     | Arrêté par signal |
| `t`  | Tracing stop                | En pause pour débogage |
| `X`  | Dead                        | Processus mort |
| `x`  | Dead (legacy)              | Variante historique |
| `K`  | Wakekill                    | En attente d’être tué (Linux 2.6.33–3.13) |
| `W`  | Waking                      | En train de se réveiller (Linux 2.6.33–3.13) |
| `P`  | Parked                      | En attente dans un pool de threads |
| `I`  | Idle                        | Inactif (Linux ≥ 4.14, souvent pour threads noyau) |

---

## 📎 Notes

- Les champs sont tous sur une seule ligne, séparés par des espaces.
- Le champ `comm` (nom du programme) est entouré de parenthèses et peut contenir des espaces.
- Les valeurs de temps (`utime`, `stime`, `starttime`) sont exprimées en **ticks**. Pour convertir en secondes : `valeur / HZ` (HZ = 100 ou 1000 selon le système).

---

##  Sources

- [man proc(5)](https://man7.org/linux/man-pages/man5/proc.5.html)
- Documentation du noyau Linux


## Référence des classes 


### `RaplReader`:

### description

classe premettant de mesurer la consommation energetique des cpu via l'interface RAPL (Rinnig Average Power Limit) exposée dans /sys/class/powercap/intel-rapl.
- Elle lit les capteur d'energie cumulée (`energy_uj`) pour chaque package cpu
- Detecte les dépassements (wraps)
- Calcule la puissance moyenne consomée dans un intervalle donné.


### Utilisation:

```js
import RaplReader from './RaplReader.js'

const reader = new RaplReader({probe}); // probe contient les packages détectés
const nowNs = process.hrtime.bigint(); // timestamp en nanosecondes
const result = await reader.sample(nowNs);

console.log(result.powerW); // puissance moyenne en watts
```

`new RaplReader({probe})`

- `probe` (Object):Objet contenant les packages CPU détectés.
    - Chaque package doirt avoir:
    - `HasEnergyReadable:true`
    - `file.energy_uj`:chemin vers le fichier `energy_uj`
    - `maxEnergyUj`: valeur maximale avant wrap (optionnelle)
  
**Initialise l’état interne avec les packages valides.**

`async sample(nowNs)`
- `nowNs`:Timestamp actuel en nanoseconde
- retour:
```js
{
  ok: true,                  // true si des packages sont disponibles
  primed:true,                // delta exploitable
  deltaTimeTs: Number,         // durée de l’intervalle en secondes
  deltaUj: Number,         // énergie cumulée en microjoules
  deltaJ: Number,          // énergie en joules
  packages: [               // liste des packages utilisés
    { node: 'package-0', path: '/sys/class/powercap/.../energy_uj' },
    ...
  ],
  wraps: Number             // nombre de dépassements détectés
}
```
### Wraps energetique

Chaque compteur energy_uj est un entier qui augmante continuellement.
Lorsqu'ul atteint un **max_energy_range**, le compteur revient a 0.
La classe detecte ce cas si `deltaUj` < 0 et ajuste le calcul

```js
deltaUj = current + maxRange - previous
```

### Sécurité temporelle

l'intervalle de temps `deltaTimeTs` (s) est borné dans [0.2,5] secondes
pour eviter les derives en cas de freeze ou de latence systeme

### Notes

- Les valeur sont en **BigInt**
- la premiere lecture initialise les valeur sans produire de delta
- le calcul est fait sur tout les package cumlulés
- 
### security troubleshooting

https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/advisory-guidance/running-average-power-limit-energy-reporting.html



