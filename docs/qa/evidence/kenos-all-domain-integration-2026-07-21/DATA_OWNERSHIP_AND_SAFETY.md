# Data Ownership + Safety

| Domain | Write owner | Shell writes domain DB? |
| ------ | ----------- | ----------------------- |
| plan | planner | No |
| training | fitness | No |
| work | aios-work | No |
| money | finance | No (resume strips amounts) |
| library | knowledge | No silent vault writes |
| music | music | No |
| home | home | No |
| health | health | No medical decisions |
| paper | paperos-external | N/A — not embedded |

No dual-write, no admin/service-role product path, no RLS weaken, no secrets in evidence.
