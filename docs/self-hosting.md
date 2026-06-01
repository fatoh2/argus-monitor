# Self-Hosting Argus Monitor

This guide will walk you through the process of self-hosting Argus Monitor.

## Prerequisites
- Docker and Docker Compose installed
- Sufficient system resources (CPU, RAM, Disk Space)
- A PostgreSQL database instance (can be run via Docker Compose)
- A Redis instance (can be run via Docker Compose)
- A domain name configured to point to your server's IP address (for SSL)

## Setup Steps

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/fatoh2/argus-monitor.git
    cd argus-monitor
    ```

2.  **Configure Environment Variables**:
    Copy the `.env.example` file to `.env` and fill in your database and Redis credentials, as well as any other required environment variables.
    ```bash
    cp .env.example .env
    # Edit .env file with your specific configurations
    ```
    **Important**: Ensure `DATABASE_URL` and `REDIS_URL` are correctly set to point to your PostgreSQL and Redis instances.

3.  **Set up Docker Compose**:
    We provide `docker-compose.yml` for local development and `docker-compose.prod.yml` for production. For production, you should use `docker-compose.prod.yml`. This file assumes you will provide your own PostgreSQL and Redis instances, or you can modify it to include them.

    **Example `docker-compose.prod.yml` adjustments (if you want to run Postgres and Redis via Docker Compose):**
    You can uncomment or add the `postgres` and `redis` services from `docker-compose.yml` into `docker-compose.prod.yml` if you prefer to manage them with Docker Compose. Remember to set appropriate volumes and passwords.

4.  **Run Migrations and Build Services** (using `docker-compose.prod.yml`):
    Ensure your database and Redis are accessible. Then, run the migrations and build the services.
    ```bash
    docker-compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
    docker-compose -f docker-compose.prod.yml build
    ```

5.  **Start Argus Monitor Services** (using `docker-compose.prod.yml`):
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```

## Configuration

Refer to the `.env.example` file for all available configuration options.

## SSL Configuration (Recommended for Production)

For production deployments, it is highly recommended to use SSL to secure communication. You can achieve this by using a reverse proxy like Nginx or Caddy in front of your Argus Monitor services.

**Example with Nginx (assuming your domain is `monitor.example.com`):**

1.  **Install Nginx**:
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  **Configure Nginx**: Create a new Nginx configuration file (e.g., `/etc/nginx/sites-available/argus-monitor`) and link it to `sites-enabled`.

    ```nginx
    server {
        listen 80;
        server_name monitor.example.com;

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name monitor.example.com;

        ssl_certificate /etc/letsencrypt/live/monitor.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/monitor.example.com/privkey.pem;

        location / {
            proxy_pass http://localhost:3000; # Or the internal IP/port of your frontend service
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        location /api {
            proxy_pass http://localhost:3001; # Or the internal IP/port of your API service
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    **Note**: Replace `localhost:3000` and `localhost:3001` with the actual internal IP addresses and ports of your frontend and API services if they are not running on the same host or if you're using a different Docker network.

3.  **Obtain SSL Certificates**: Use Certbot to obtain free SSL certificates from Let's Encrypt.
    ```bash
    sudo snap install --classic certbot
    sudo certbot --nginx -d monitor.example.com
    ```

4.  **Test Nginx Configuration and Restart**:
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```

## Testing
Ensure all services are running and accessible. You should be able to access the API and frontend via your configured domain.

## Troubleshooting
- Check container logs: `docker-compose -f docker-compose.prod.yml logs -f`
- Ensure database and Redis connections are correctly configured in your `.env` file.
- Verify Nginx configuration and SSL certificates if you're using a reverse proxy.

## Done when
A user can self-host argus-monitor by following this guide in under 30 minutes.
