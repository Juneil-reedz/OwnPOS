# OwnPOS Server setup (free, about 10 minutes, once)

This gives you the admin dashboard, sends feedback to your Gmail, and lets you approve renewals
so licenses reach stores' apps by themselves. It runs inside your own Google account.

1. Go to **sheets.new** while signed in to your Google account. Name the sheet **OwnPOS Server**.
2. In the sheet: **Extensions → Apps Script**.
3. Delete what's in `Code.gs` and paste all of [`Code.gs`](Code.gs).
4. Click **+** next to Files → **HTML** → name it exactly `Dashboard` → paste all of [`Dashboard.html`](Dashboard.html).
5. Click **Save** (the disk icon).
6. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**  (stores' apps must be able to reach it; your data is still protected by your PIN)
   - Click **Deploy** → **Authorize access** → choose your account → **Advanced → Go to OwnPOS (unsafe) → Allow**.
     Google shows this warning for every script you write yourself.
7. Copy the **Web app URL** (ends in `/exec`).
8. Open that URL and **create your admin PIN**. Bookmark the page on your phone: this is your dashboard.
9. On GitHub: **OwnPOS → Settings → Secrets and variables → Actions → Variables tab → New repository variable**
   - Name: `OWNPOS_SERVER_URL`  Value: the Web app URL
10. Release a new version (Actions → Build Android app → Run workflow) so the app knows the address.

## When you change the script later
Deploy → **Manage deployments** → pencil icon → Version: **New version** → Deploy. The URL stays the same.
