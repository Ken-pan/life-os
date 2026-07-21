# HOSTNAME_REGRESSION

**run:** `hostname-2026-07-21T17-37-24-582Z`
**verdict:** `PASS_AUTOMATED_HOSTNAME`
**origin:** `http://Kens-M5-Max-MacBook-Pro.local:5219`

| Case | Result | Owner? |
| --- | --- | --- |
| CASE_A_normal | PASS | no |
| CASE_B_dhcp_ip_change | PASS_HOST_INDEPENDENT_OF_IP | yes |
| CASE_C_wifi_toggle | OWNER_OPEN | yes |
| CASE_D_service_restart | PASS | no |
| CASE_E_mac_reboot | OWNER_OPEN | yes |

## Owner-only (not forged)

- CASE_B true DHCP renew
- CASE_C Wi‑Fi toggle
- CASE_E Mac reboot
