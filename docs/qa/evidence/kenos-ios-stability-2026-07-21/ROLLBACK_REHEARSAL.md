# ROLLBACK_REHEARSAL

| Step | Result |
| --- | --- |
| previous release exists | true |
| `kenos-ctl rollback` executed | NOT in this run (destructive to dogfood release); target verified present |
| iOS previous IPA | local DerivedData rebuild is forward; uninstall/reinstall prior build = Owner |
| Data safety | service stop/start retains user cloud data; local projections not wiped by ctl stop |

Rollback status: **TARGET_PRESENT** / **FULL_CTL_ROLLBACK_NOT_EXECUTED**
