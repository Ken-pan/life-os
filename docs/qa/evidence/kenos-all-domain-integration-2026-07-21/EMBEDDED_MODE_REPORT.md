# Embedded Mode Report

## Pattern (Plan / Training reference)

1. `markIosNativeShellDom()` + `?iosNativeShell=1` / session flag  
2. Hide web BottomNav / tabbar via CSS `html[data-ios-native-shell='true']`  
3. DomainMusicHeader in **scroll main** (status pad 54px on scroll root)  
4. Native Domain Dock is the only bottom IA  

## Per domain (2026-07-21 follow-up)

| Domain | App | markIosNativeShellDom | Hide web chrome | DomainMusicHeader | Native Continuity |
| ------ | --- | --------------------- | --------------- | ----------------- | ----------------- |
| Plan | planner | yes | CSS + layout | PageShell main | yes |
| Training | fitness | yes | CSS + layout | main snippet | yes |
| Work | aios `/work` | yes | aios CSS | KenosSystemBar / page | yes (path gate) |
| Money | finance | yes | AppShell CSS + hidden tabbar | AppShell main-wrap | yes |
| Library | knowledge | yes | CSS + skip nav | main snippet | yes |
| Music | music | yes | CSS + skip nav | main snippet | yes |
| Home | home | yes | CSS + skip nav | main (non-immersive) | yes |
| Health | health | yes | CSS + skip nav | main snippet | yes |
| Paper | — | n/a | n/a | n/a | legacy placeholder |

## P0 fixes this pass

- Music/Library/Home/Health lacked CSS belt; DomainMusicHeader lived in shell `header` (status overlap) → moved to `main` + CSS pad  
- Swift Continuity port list missed Health `:5192`; Work `/work` stayed on Kenos tabs → `isEmbeddedWebContinuityURL` SSOT  
- Finance was briefly loopback-only → blank Continuity; LAN `0.0.0.0:5180` restored  

## Dual dock

Device screenshots show **one** Domain Dock per Continuity surface (Spaces chip + domain slots). Web mobile-tabbar / BottomNav not visible alongside.
