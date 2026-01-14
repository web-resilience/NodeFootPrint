# JSONL Export Format

## shema global

```json
{
  "timestamp": "ISO-8601",
  "intervalSeconds": number,

  "host": {
    "cpu": { ... },
    "energy": { ... }
  },

  "process": { ... },

  "carbon": { ... }
}
```

## Metadata 
```json
"timestamp": "2026-01-12T10:20:18.428Z",
"intervalSeconds": 1.001824681
```
- `timestamp`: horodatage du tick
- `intervalSeconds`: temps réel écoulé depuis le tick précédent (abscent ou null au premier tick)

## Host CPU (tick courant)

```json
"host": {
  "cpu": {
    "unit": "jiffies",
    "deltaActive": "27",
    "deltaIdle": "1166",
    "deltaTotal": "1193"
  }
}
```
### Host Energy (tick courant)

```json
"host": {
  "energy": {
    "unit": "joules",
    "delta": 5.708,
    "perPackage": [
      {
        "node": "intel-rapl:0",
        "delta": 5.708,
        "wraps": 0
      }
    ],
    "meta": {
      "internalClampedDt": 1.001824681
    }
  }
}
```
- énergie mesurée

- pas de puissance

- pas de moyenne

- énergie strictement positive ou nulle
  
### Process attribution (fenêtre glissante)

```json
"process": {
  "pid": 95030,
  "active": true,

  "cpuShare": 0.018912529550827423,

  "window": {
    "samples": 10,
    "cpuTicks": {
      "unit": "jiffies",
      "hostActive": "846",
      "processActive": "16"
    },
    "energy": {
      "unit": "joules",
      "host": 93.317
    }
  },

  "energy": {
    "unit": "joules",
    "value": 1.7648605200945628
  }
}
```
**Notes importantes** :

- active = process a exécuté du CPU sur la fenêtre

- cpuShare = valeur déjà stabilisée

- window.energy.host = somme host sur la fenêtre

- energy.value = énergie attribuée au process

## Carbon estimation (CPU-only)

```json
"carbon": {
  "scope": "cpu-electricity-only",

  "emissionFactor": {
    "countryCode": "GLOBAL",
    "unit": "gCO2e/kWh",
    "value": 475
  },

  "energy": {
    "unit": "kWh",
    "value": 4.902390333596008e-7
  },

  "emissions": {
    "unit": "gCO2e",
    "value": 2.3286354084581035e-4
  }
}
```
- carbone dérivé, jamais mesuré

- unités explicitement affichées

- scope toujours rappelé


## exemple:
```json
{"timestamp":"2026-01-12T10:20:18.428Z","intervalSeconds":1.0018,"host":{"cpu":{"unit":"jiffies","deltaActive":"27","deltaIdle":"1166","deltaTotal":"1193"},"energy":{"unit":"joules","delta":5.708}},"process":{"pid":95030,"active":true,"cpuShare":0.0189,"window":{"samples":10,"cpuTicks":{"unit":"jiffies","hostActive":"846","processActive":"16"},"energy":{"unit":"joules","host":93.317}},"energy":{"unit":"joules","value":1.7649}},"carbon":{"scope":"cpu-electricity-only","emissionFactor":{"countryCode":"GLOBAL","unit":"gCO2e/kWh","value":475},"energy":{"unit":"kWh","value":4.9e-7},"emissions":{"unit":"gCO2e","value":2.3e-4}}}
{"timestamp":"2026-01-12T10:20:19.430Z","intervalSeconds":1.0021,"host":{"cpu":{"unit":"jiffies","deltaActive":"31","deltaIdle":"1158","deltaTotal":"1189"},"energy":{"unit":"joules","delta":5.892}},"process":{"pid":95030,"active":true,"cpuShare":0.0214,"window":{"samples":10,"cpuTicks":{"unit":"jiffies","hostActive":"877","processActive":"19"},"energy":{"unit":"joules","host":99.209}},"energy":{"unit":"joules","value":2.122}},"carbon":{"scope":"cpu-electricity-only","emissionFactor":{"countryCode":"GLOBAL","unit":"gCO2e/kWh","value":475},"energy":{"unit":"kWh","value":5.9e-7},"emissions":{"unit":"gCO2e","value":2.8e-4}}}
```