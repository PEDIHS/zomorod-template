# Zomorod Update

After the first installation, update Zomorod with:

```bash
sudo zomorod update
```

The updater downloads the newest `main` installer with cache bypass headers, refreshes the subscription template, dashboard plugin, runtime, backend addon and systemd integration, then hot-applies the dashboard/template integration without restarting or recreating PasarGuard containers.

Useful commands:

```bash
zomorod version
zomorod status
```

The **Zomorod · Special** tab is intentionally injected only while the PasarGuard route is under `/settings/...`, and is removed when leaving Settings. The tab and owner-only Admin Subscription Namespaces controls are never exposed to non-owner admins.
