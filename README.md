# Heat Diffusion Simulation (UHK)

Vibe-coded semestralni projekt pro UHK.  
Interaktivni 2D simulace sireni tepla v budove, s materialy, bytovymi jednotkami, topidly/klimatizaci, venkovni teplotou v case a exportem vysledku.

## Technologie

- `TypeScript`
- `Vue 3 (Quasar)`
- `Web Worker` pro beh simulace mimo UI thread
- `ESLint + Prettier`

## Jak Spustit

1. Instalace zavislosti:

```bash
npm install
```

2. Vyvojovy rezim:

```bash
npm run dev
```

## `data` Slozka

Ve slozce `data/` jsou pripravene podklady pro experimenty:

- exporty setupu simulace sveta (mapa materialu + jednotky + konfigurace),
- hodinove venkovni teplotni rady (pocasi).

Aktualne tam najdes napriklad:

- `data/heat-sim-setup-cold-eps.json`
- `data/heat-sim-setup-cold-no-eps.json`
- `data/heat-sim-setup-mild-eps.json`
- `data/heat-sim-setup-mild-no-eps.json`
- `data/cz_winter_cold_7d_hourly.json`
- `data/cz_winter_mild_7d_hourly.json`

## Jak Projekt Funguje

### Architektura

Projekt je rozdeleny na dve hlavni casti:

1. Prezentacni vrstva (`Quasar/Vue`) v `src/pages/*`.
2. Simulacni vrstva v `src/sim/*`, spustena ve `Web Workeru`.

UI neposila vypocty primo. Posila commandy do workeru (`setup`, `step`, `toggleRun`, edit materialu/jednotek) a worker vraci snapshoty stavu sveta.

### Tok dat

1. UI nastavi konfiguraci simulace.
2. Worker (`src/sim/heatSimulation.worker.ts`) drzi instanci `HeatSimulation`.
3. `HeatSimulation` vola engine (`stepWorld`), ktery udela jeden fyzikalni krok.
4. Worker posle snapshot do UI.
5. UI renderuje grid/canvas, runtime statistiky a exporty.

### Model v abstrakci

Model je mrizka bunek (`cells`). Kazda bunka ma:

- teplotu `T`,
- material (`rho`, `cp`, `lambda`, barva),
- prirazeni k jednotce (`unitId` nebo `null`),
- priznaky, zda je emitter aktivni.

Pri kazdem kroku:

1. Spocte se difuze tepla mezi sousedy.
2. Prepocte se teplota bunek.
3. Vyhodnoti se emittery (heater/AC).
4. Pricte se energie topeni/chlazeni.
5. Aktualizuji se metriky komfortu a toku tepla mezi jednotkami.

### Jednotky a zony

Jednotky (`units`) drzi komfortni rozsahy a statistiky.  
Uvnitri jedne jednotky se runtime deli na zony jako souvisle komponenty bunek stejneho `unitId` (4-smerova sousednost). Regulace emitteru bezi podle teploty zony.

Dulezite:

- `heater` bunka s validnim `unitId` je rizena termostatem jednotky/zony,
- `heater` bunka bez jednotky je `fixed emitter` a drzi `emitTemp` natvrdo.

## Poznamka ke Scope

Model je zjednoduseny a cileny na porovnavaci experimenty, ne na certifikovanou stavebni energetiku. Je ale konzistentni, rychly a dobre pouzitelny pro scenare typu "co se stane kdyz zmenim izolaci, vykon topidel nebo venkovni prubeh teplot".
