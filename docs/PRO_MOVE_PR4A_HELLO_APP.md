# PR-4A: reMarkable Pro Move Hello App - Manual Run Instructions

These instructions are for manually testing the PlannerOS Lite Hello App on the reMarkable Paper Pro Move.

## Prerequisites

1. Ensure the app has been built (requires x86_64 Linux environment with the chiappa Qt6 SDK).
2. Deploy the binary to the device's safe workspace:
   ```bash
   scp planneros-lite remarkable-pro-move:/home/root/planneros-lite/
   ```

## Execution

1. SSH into the device:
   ```bash
   ssh remarkable-pro-move
   ```

2. Check the status of the native UI (`xochitl`):
   ```bash
   systemctl status xochitl --no-pager
   ```

3. Temporarily stop `xochitl` to free the framebuffer/display:
   ```bash
   systemctl stop xochitl
   ```

4. Navigate to the safe workspace and run the app:
   ```bash
   cd /home/root/planneros-lite
   QT_QUICK_BACKEND=epaper ./planneros-lite -platform epaper
   ```

5. Verify the UI:
   - You should see the "PlannerOS Lite" title, current date, and 3 mock tasks.
   - The first task should be rendered in red (testing color e-ink).

6. Stop the app (press `Ctrl+C` in the SSH session).

7. Restart the native UI to return the device to normal:
   ```bash
   systemctl start xochitl
   ```

8. Verify `xochitl` is running again:
   ```bash
   systemctl status xochitl --no-pager
   ```
