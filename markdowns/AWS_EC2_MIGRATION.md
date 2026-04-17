# AWS EC2 Migration Runbook

This runbook turns the current Railway deployment into a single-instance AWS EC2 deployment without changing the app architecture.

It is written for the current repo shape:

- Dockerized Node server
- SQLite at `file:/var/data/prod.sqlite`
- one instance only
- HTTPS on a host reverse proxy

## Target architecture

- 1 EC2 instance
- 1 Elastic IP
- 1 extra EBS volume mounted at `/var/data`
- Docker Compose for app lifecycle
- Caddy on the host for HTTPS and reverse proxying to port `3000`

## 1. Prepare production values before touching AWS

Collect these from the current Railway production setup:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `ENCRYPTION_KEY`
- `IMAI_WEBHOOK_SECRET` if used
- `IMAI_BILLING_SYNC_URL` if used
- `SHOPIFY_BILLING_TEST_MODE`
- current production SQLite database file

Do not start migration until you have:

- a backup of the live SQLite database
- the exact production subdomain Shopify is using today
- a maintenance window or at least a quiet period for cutover

## 2. Create AWS resources

Choose one AWS region and keep the instance, volume, and Elastic IP there.

Create:

1. One EC2 instance.
   Recommended starting size: `t3.small` or `t4g.small` if you know you want ARM.
2. One security group.
   Allow inbound `80/tcp` and `443/tcp` from anywhere.
   Allow inbound `22/tcp` only from your IP.
3. One Elastic IP.
   Associate it with the EC2 instance.
4. One EBS volume in the same Availability Zone as the instance.
   Start with `20-40 GB gp3`.

## 3. Connect to the instance

SSH into the server using the key pair you created in AWS.

Example:

```bash
ssh -i ~/Downloads/your-key.pem ubuntu@YOUR_ELASTIC_IP
```

Use `ec2-user@...` instead of `ubuntu@...` if you launched Amazon Linux.

## 4. Format and mount the EBS volume at /var/data

After SSHing into the instance:

1. List block devices:

```bash
lsblk
```

2. Find the new empty volume, usually something like `/dev/nvme1n1` or `/dev/xvdf`.

3. Format it once:

```bash
sudo mkfs -t ext4 /dev/YOUR_DEVICE
```

4. Create the mountpoint:

```bash
sudo mkdir -p /var/data
```

5. Mount it:

```bash
sudo mount /dev/YOUR_DEVICE /var/data
```

6. Make it persistent across reboot:

```bash
sudo blkid /dev/YOUR_DEVICE
```

Copy the UUID and add it to `/etc/fstab`:

```bash
UUID=YOUR_UUID /var/data ext4 defaults,nofail 0 2
```

7. Set permissions so Docker can write the SQLite file:

```bash
sudo chown -R $USER:$USER /var/data
chmod 755 /var/data
```

8. Validate:

```bash
sudo umount /var/data
sudo mount -a
df -h /var/data
```

## 5. Install Docker and Compose

Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in once so the Docker group applies.

## 6. Copy the app to the server

Use Git on the server or copy the files manually.

Example with Git:

```bash
git clone YOUR_REPO_URL shopify
cd shopify
```

## 7. Create the production env file

Use the template in [`AWS_PRODUCTION_ENV.example`](./AWS_PRODUCTION_ENV.example).

On the server:

```bash
cp AWS_PRODUCTION_ENV.example .env.production
```

Fill in the real secrets and set:

- `SHOPIFY_APP_URL=https://YOUR_SUBDOMAIN`
- `DATABASE_URL=file:/var/data/prod.sqlite`
- `SHOPIFY_BILLING_TEST_MODE=false`

## 8. Restore the production SQLite database

Copy the Railway production DB backup into:

```bash
/var/data/prod.sqlite
```

Then verify:

```bash
ls -lah /var/data/prod.sqlite
```

## 9. Start the app with Docker Compose

This repo includes [`docker-compose.aws.yml`](./docker-compose.aws.yml).

Start it:

```bash
docker compose --env-file .env.production -f docker-compose.aws.yml up -d --build
```

Check logs:

```bash
docker compose --env-file .env.production -f docker-compose.aws.yml logs -f app
```

The app should come up on `127.0.0.1:3000`.

## 10. Configure HTTPS with Caddy

This repo includes a starter [`Caddyfile.aws`](./Caddyfile.aws).

On the server:

1. Install Caddy.
2. Copy `Caddyfile.aws` to `/etc/caddy/Caddyfile`.
3. Replace `YOUR_SUBDOMAIN` with the real production subdomain.
4. Restart Caddy.

Caddy will fetch and renew TLS certificates automatically once DNS points to this server.

## 11. Point the subdomain to AWS

At your external DNS provider:

1. Open the DNS zone for your domain.
2. Create or update the `A` record for the app subdomain.
3. Point it to the EC2 Elastic IP.
4. Wait for DNS propagation.

After DNS resolves to the instance, verify:

```bash
curl -I https://YOUR_SUBDOMAIN/api/health
```

## 12. Update Shopify configuration

Update [`shopify.app.toml`](./shopify.app.toml):

- `application_url = "https://YOUR_SUBDOMAIN"`
- `redirect_urls = ["https://YOUR_SUBDOMAIN/auth/callback"]`

Then run on your machine:

```bash
shopify app deploy
```

That updates Shopify-side app configuration. It does not deploy the EC2 server.

## 13. Cutover validation checklist

Before fully retiring Railway, test:

- `GET /api/health`
- app install/auth redirect
- embedded app load in Shopify Admin
- billing page
- `app_subscriptions/update` webhook
- one IMAI generation request
- one IMAI webhook callback
- restart app container without losing data
- reboot EC2 without losing `/var/data/prod.sqlite`

## 14. Rollback plan

If anything fails during cutover:

1. Point the subdomain back to Railway.
2. Restore the old `shopify.app.toml` URL values if needed.
3. Run `shopify app deploy` again.
4. Keep the AWS instance for debugging, but do not continue cutover until health, auth, billing, and webhooks are clean.
