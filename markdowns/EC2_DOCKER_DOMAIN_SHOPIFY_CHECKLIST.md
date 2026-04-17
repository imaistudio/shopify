# EC2 + Docker + Domain + Shopify Checklist

This checklist is for the current repo with no architecture changes:

- one long-lived app instance
- SQLite via Prisma
- persistent database at `file:/var/data/prod.sqlite`
- Docker Compose on EC2
- HTTPS terminated by Caddy on the host

If you keep this setup, do not autoscale the app tier. SQLite and the in-memory SSE layer are single-instance assumptions in this codebase.

## 1. AWS resources

- [ ] Create one EC2 instance in your target AWS region.
- [ ] Use Ubuntu 24.04 LTS or Amazon Linux 2023.
- [ ] Start with `t3.small` or `t3.medium`.
- [ ] Create and attach one Elastic IP.
- [ ] Create one EBS volume in the same Availability Zone.
- [ ] Start the EBS volume at `20-40 GB` gp3.
- [ ] Create a security group with:
- [ ] `22/tcp` allowed only from your IP
- [ ] `80/tcp` allowed from anywhere
- [ ] `443/tcp` allowed from anywhere

## 2. Server access

- [ ] SSH into the instance.
- [ ] Confirm the OS user you will run Docker under.
- [ ] Run `sudo timedatectl set-timezone Asia/Kolkata` if you want the server time to match your local ops timezone.
- [ ] Run `sudo apt-get update` on Ubuntu or the equivalent package refresh for Amazon Linux.

## 3. Format and mount persistent storage

- [ ] Run `lsblk` and identify the new empty EBS device.
- [ ] Format it once with `sudo mkfs -t ext4 /dev/YOUR_DEVICE`.
- [ ] Create the mount point with `sudo mkdir -p /var/data`.
- [ ] Mount it with `sudo mount /dev/YOUR_DEVICE /var/data`.
- [ ] Get the UUID with `sudo blkid /dev/YOUR_DEVICE`.
- [ ] Add the UUID to `/etc/fstab` so the mount survives reboot.
- [ ] Set write permissions with `sudo chown -R $USER:$USER /var/data`.
- [ ] Verify with `df -h /var/data`.

## 4. Install Docker

- [ ] Install Docker Engine.
- [ ] Install the Docker Compose plugin.
- [ ] Add your user to the `docker` group.
- [ ] Log out and back in once so the group change applies.
- [ ] Verify with `docker version` and `docker compose version`.

## 5. Put the app on the server

- [ ] Clone this repo onto the EC2 instance.
- [ ] Work from the project root on the server.
- [ ] Confirm these files exist:
- [ ] `Dockerfile`
- [ ] `docker-compose.aws.yml`
- [ ] `Caddyfile.aws`
- [ ] `AWS_PRODUCTION_ENV.example`

## 6. Create the production env file

- [ ] Copy `AWS_PRODUCTION_ENV.example` to `.env.production`.
- [ ] Set `NODE_ENV=production`.
- [ ] Set `PORT=3000`.
- [ ] Set `DATABASE_URL=file:/var/data/prod.sqlite`.
- [ ] Set `SHOPIFY_APP_URL=https://ecommerce.imai.studio`.
- [ ] Set the real `SHOPIFY_API_KEY`.
- [ ] Set the real `SHOPIFY_API_SECRET`.
- [ ] Set `SCOPES=read_products,write_products,write_files`.
- [ ] Set a real `ENCRYPTION_KEY` with at least 32 bytes.
- [ ] Set `SHOPIFY_BILLING_TEST_MODE=false`.
- [ ] Set `IMAI_WEBHOOK_SECRET` if your upstream webhook is signed.
- [ ] Set `IMAI_BILLING_SYNC_URL=https://www.imai.studio/api/v1/shopify/allocate-credits` unless you intentionally use another endpoint.
- [ ] Lock down file permissions on `.env.production`.

## 7. Restore or initialize the SQLite database

- [ ] If you already have production data, copy the SQLite file to `/var/data/prod.sqlite`.
- [ ] If this is a fresh deployment, make sure `/var/data` exists and is writable so Prisma can initialize the database.
- [ ] Verify the file path with `ls -lah /var/data`.

## 8. Start the app with Docker Compose

- [ ] Run `docker compose --env-file .env.production -f docker-compose.aws.yml up -d --build`.
- [ ] Follow logs with `docker compose --env-file .env.production -f docker-compose.aws.yml logs -f app`.
- [ ] Wait until the app is healthy.
- [ ] Verify locally on the server with `curl -I http://127.0.0.1:3000/api/health`.

## 9. Install and configure Caddy

- [ ] Install Caddy on the EC2 host.
- [ ] Copy `Caddyfile.aws` to `/etc/caddy/Caddyfile`.
- [ ] Replace `YOUR_SUBDOMAIN` with `ecommerce.imai.studio`.
- [ ] Restart Caddy.
- [ ] Confirm Caddy is listening on `80` and `443`.

## 10. Point the domain

- [ ] Open the DNS zone for `imai.studio`.
- [ ] Create or update the `A` record for `ecommerce.imai.studio`.
- [ ] Point it to the EC2 Elastic IP.
- [ ] Wait for DNS propagation.
- [ ] Verify with `dig ecommerce.imai.studio`.
- [ ] Verify HTTPS with `curl -I https://ecommerce.imai.studio/api/health`.

## 11. Update Shopify app config

- [ ] Update `shopify.app.toml`:
- [ ] `application_url = "https://ecommerce.imai.studio"`
- [ ] `redirect_urls = ["https://ecommerce.imai.studio/auth/callback"]`
- [ ] Keep scopes aligned with `.env.production`.
- [ ] Run `shopify app deploy` from your local machine after the domain is live.

## 12. Shopify production validation

- [ ] Install the app on a development store.
- [ ] Confirm OAuth completes.
- [ ] Confirm the embedded app loads in Shopify Admin.
- [ ] Confirm settings save and reload correctly.
- [ ] Confirm one IMAI generation request succeeds.
- [ ] Confirm one IMAI webhook callback reaches `/api/imai/webhook`.
- [ ] Confirm the billing page loads.
- [ ] Confirm the app still works after restarting the container.
- [ ] Reboot the EC2 instance once and confirm `/var/data/prod.sqlite` survives.

## 13. Shopify review readiness

- [ ] In Partner Dashboard, switch to the correct production app.
- [ ] Confirm app distribution is set the way you intend.
- [ ] Fill in support URL, privacy policy URL, and any required app listing details.
- [ ] Make sure reviewer instructions are clear and complete.
- [ ] Run Shopify automated checks.
- [ ] Fix every failing check before submission.
- [ ] Submit the app for review only after the production domain is stable.

## 14. Backups and operations

- [ ] Back up `/var/data/prod.sqlite` regularly.
- [ ] Keep a copy of `.env.production` outside the instance in a secure secret store.
- [ ] Set up basic instance monitoring for CPU, memory, disk, and restart events.
- [ ] Do not run multiple app replicas unless you redesign the database and realtime flow.
